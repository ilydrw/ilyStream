#include "shared_audio_ring.h"

#include "../program-transport/program-audio-ring.hpp"

#include <algorithm>
#include <cstring>
#include <limits>
#include <mutex>
#include <utility>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <sddl.h>
#endif

namespace ily::audio {
namespace {

using ilystream::program_transport::ProgramAudioRingHeader;
constexpr std::size_t kReadAttempts = 8;

bool HasAllowedPrefix(const std::string& value) noexcept {
    constexpr const char* prefixes[] = {
        "Local\\ilyStream.Program.Audio.",
        "Local\\ilyStream.Capture.Audio.",
        "Local\\ilyStream.Mixer.Source."
    };
    for (const char* prefix : prefixes) {
        const std::size_t length = std::strlen(prefix);
        if (value.size() <= length || value.size() > length + 64 ||
            value.compare(0, length, prefix) != 0) continue;
        bool valid = true;
        for (std::size_t index = length; index < value.size(); ++index) {
            const unsigned char character = static_cast<unsigned char>(value[index]);
            if (!((character >= 'A' && character <= 'Z') ||
                  (character >= 'a' && character <= 'z') ||
                  (character >= '0' && character <= '9') || character == '.' ||
                  character == '_' || character == '-')) {
                valid = false;
                break;
            }
        }
        if (valid) return true;
    }
    return false;
}

bool MappingBytes(const SharedAudioRingOptions& options, std::size_t& bytes) noexcept {
    if (!IsValidSharedAudioRingOptions(options)) return false;
    const std::uint64_t sampleBytes = static_cast<std::uint64_t>(options.capacityFrames) *
        options.channels * sizeof(float);
    const std::uint64_t total = ilystream::program_transport::kProgramAudioRingHeaderBytes + sampleBytes;
    if (total > std::numeric_limits<std::uint32_t>::max() || total > SIZE_MAX) return false;
    bytes = static_cast<std::size_t>(total);
    return true;
}

#ifdef _WIN32
std::wstring Utf8ToWide(const std::string& value) {
    if (value.empty()) return {};
    const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), nullptr, 0);
    if (length <= 0) return {};
    std::wstring result(static_cast<std::size_t>(length), L'\0');
    return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), result.data(), length) == length ? result : std::wstring{};
}

struct LocalMemoryDeleter {
    void operator()(void* value) const noexcept { if (value) LocalFree(value); }
};

bool CurrentUserSecurity(SECURITY_ATTRIBUTES& attributes,
                         std::unique_ptr<void, LocalMemoryDeleter>& owner) {
    HANDLE token = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
    DWORD length = 0;
    GetTokenInformation(token, TokenUser, nullptr, 0, &length);
    std::vector<std::uint8_t> buffer(length);
    const bool gotUser = length > 0 &&
        GetTokenInformation(token, TokenUser, buffer.data(), length, &length) != FALSE;
    CloseHandle(token);
    if (!gotUser) return false;

    LPWSTR sid = nullptr;
    const auto* user = reinterpret_cast<const TOKEN_USER*>(buffer.data());
    if (!ConvertSidToStringSidW(user->User.Sid, &sid)) return false;
    std::unique_ptr<void, LocalMemoryDeleter> sidOwner(sid);
    const std::wstring sddl = L"D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;" +
        std::wstring(sid) + L")";
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) return false;
    owner.reset(descriptor);
    attributes = {sizeof(SECURITY_ATTRIBUTES), descriptor, FALSE};
    return true;
}

std::uint64_t ReadSequence(const ProgramAudioRingHeader* header) noexcept {
    MemoryBarrier();
    const auto* sequence = reinterpret_cast<const volatile std::uint64_t*>(&header->publishSequence);
    const std::uint64_t value = *sequence;
    MemoryBarrier();
    return value;
}

bool MetadataMatches(const ProgramAudioRingHeader& header,
                     const SharedAudioRingOptions& options, std::size_t mappingBytes) noexcept {
    return header.magic == ilystream::program_transport::kProgramAudioRingMagic &&
        header.version == ilystream::program_transport::kProgramAudioRingVersion &&
        header.headerBytes == ilystream::program_transport::kProgramAudioRingHeaderBytes &&
        header.mappingBytes == mappingBytes && header.sampleRate == options.sampleRate &&
        header.channels == options.channels &&
        header.format == ilystream::program_transport::kProgramAudioFormatF32Interleaved &&
        header.capacityFrames == options.capacityFrames &&
        header.blockFrames == options.blockFrames && header.generation == options.generation &&
        header.oldestFrame <= header.writeFrame &&
        header.writeFrame - header.oldestFrame <= header.capacityFrames &&
        header.anchorFrame <= header.writeFrame &&
        (header.writeFrame == 0 || header.anchorTimestampNs != 0);
}
#endif

} // namespace

bool IsValidSharedAudioRingOptions(const SharedAudioRingOptions& options) noexcept {
    return HasAllowedPrefix(options.ringName) && options.generation != 0 &&
        options.sampleRate >= 8000 && options.sampleRate <= 384000 &&
        options.channels >= 1 && options.channels <= 8 &&
        options.blockFrames >= 1 && options.blockFrames <= 4096 &&
        options.capacityFrames >= options.blockFrames && options.capacityFrames <= 480000 &&
        options.capacityFrames % options.blockFrames == 0;
}

struct SharedAudioRingWriter::Impl {
#ifdef _WIN32
    HANDLE mapping = nullptr;
    void* view = nullptr;
    ProgramAudioRingHeader* header = nullptr;
    float* samples = nullptr;
    std::mutex mutex;
#endif
};

SharedAudioRingWriter::SharedAudioRingWriter(std::unique_ptr<Impl> impl) : m_impl(std::move(impl)) {}
SharedAudioRingWriter::~SharedAudioRingWriter() { Close(); }

std::unique_ptr<SharedAudioRingWriter> SharedAudioRingWriter::Create(
    const SharedAudioRingOptions& options, std::string& error) {
#ifdef _WIN32
    std::size_t mappingBytes = 0;
    const std::wstring ringName = Utf8ToWide(options.ringName);
    if (!MappingBytes(options, mappingBytes) || ringName.empty()) {
        error = "Invalid shared audio ring options";
        return nullptr;
    }
    SECURITY_ATTRIBUTES security{};
    std::unique_ptr<void, LocalMemoryDeleter> securityOwner;
    if (!CurrentUserSecurity(security, securityOwner)) {
        error = "Could not secure the shared audio ring";
        return nullptr;
    }
    HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, &security, PAGE_READWRITE,
        static_cast<DWORD>(static_cast<std::uint64_t>(mappingBytes) >> 32U),
        static_cast<DWORD>(mappingBytes), ringName.c_str());
    if (!mapping) { error = "Could not create the shared audio ring"; return nullptr; }
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        CloseHandle(mapping);
        error = "Shared audio ring name is already in use";
        return nullptr;
    }
    void* view = MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, mappingBytes);
    if (!view) {
        CloseHandle(mapping);
        error = "Could not map the shared audio ring";
        return nullptr;
    }
    std::memset(view, 0, mappingBytes);
    auto impl = std::make_unique<Impl>();
    impl->mapping = mapping;
    impl->view = view;
    impl->header = static_cast<ProgramAudioRingHeader*>(view);
    impl->samples = reinterpret_cast<float*>(static_cast<std::uint8_t*>(view) +
        ilystream::program_transport::kProgramAudioRingHeaderBytes);
    impl->header->magic = ilystream::program_transport::kProgramAudioRingMagic;
    impl->header->version = ilystream::program_transport::kProgramAudioRingVersion;
    impl->header->headerBytes = static_cast<std::uint16_t>(
        ilystream::program_transport::kProgramAudioRingHeaderBytes);
    impl->header->mappingBytes = static_cast<std::uint32_t>(mappingBytes);
    impl->header->sampleRate = options.sampleRate;
    impl->header->channels = static_cast<std::uint16_t>(options.channels);
    impl->header->format = ilystream::program_transport::kProgramAudioFormatF32Interleaved;
    impl->header->capacityFrames = options.capacityFrames;
    impl->header->blockFrames = options.blockFrames;
    impl->header->generation = options.generation;
    error.clear();
    return std::unique_ptr<SharedAudioRingWriter>(new SharedAudioRingWriter(std::move(impl)));
#else
    (void)options;
    error = "Shared audio rings are only available on Windows";
    return nullptr;
#endif
}

bool SharedAudioRingWriter::Publish(const float* input, std::size_t sampleCount,
                                    std::uint64_t timestampNs, std::uint64_t framesDropped) {
#ifdef _WIN32
    if (!m_impl || !input || sampleCount == 0 || timestampNs == 0) return false;
    std::lock_guard<std::mutex> lock(m_impl->mutex);
    auto* header = m_impl->header;
    if (!header || header->magic != ilystream::program_transport::kProgramAudioRingMagic ||
        sampleCount % header->channels != 0) return false;
    const std::size_t frameCount = sampleCount / header->channels;
    if (frameCount > header->blockFrames) return false;
    const std::uint64_t writeFrame = header->writeFrame;
    const std::size_t firstFrame = static_cast<std::size_t>(writeFrame % header->capacityFrames);
    const std::size_t firstCount = std::min(frameCount,
        static_cast<std::size_t>(header->capacityFrames) - firstFrame);
    const std::size_t bytesPerFrame = static_cast<std::size_t>(header->channels) * sizeof(float);
    auto* sequence = reinterpret_cast<volatile LONG64*>(&header->publishSequence);
    InterlockedIncrement64(sequence);
    std::memcpy(m_impl->samples + firstFrame * header->channels, input,
        firstCount * bytesPerFrame);
    if (firstCount < frameCount) {
        std::memcpy(m_impl->samples, input + firstCount * header->channels,
            (frameCount - firstCount) * bytesPerFrame);
    }
    header->anchorFrame = writeFrame;
    header->anchorTimestampNs = timestampNs;
    header->writeFrame = writeFrame + frameCount;
    header->oldestFrame = header->writeFrame > header->capacityFrames
        ? header->writeFrame - header->capacityFrames : 0;
    header->framesDropped = framesDropped;
    MemoryBarrier();
    InterlockedIncrement64(sequence);
    return true;
#else
    (void)input; (void)sampleCount; (void)timestampNs; (void)framesDropped;
    return false;
#endif
}

void SharedAudioRingWriter::Close() {
#ifdef _WIN32
    if (!m_impl) return;
    {
        std::lock_guard<std::mutex> lock(m_impl->mutex);
        if (m_impl->header) {
            auto* sequence = reinterpret_cast<volatile LONG64*>(&m_impl->header->publishSequence);
            InterlockedIncrement64(sequence);
            m_impl->header->magic = 0;
            MemoryBarrier();
            InterlockedIncrement64(sequence);
        }
        if (m_impl->view) UnmapViewOfFile(m_impl->view);
        if (m_impl->mapping) CloseHandle(m_impl->mapping);
        m_impl->header = nullptr;
        m_impl->view = nullptr;
        m_impl->mapping = nullptr;
    }
#endif
    m_impl.reset();
}

struct SharedAudioRingReader::Impl {
#ifdef _WIN32
    HANDLE mapping = nullptr;
    void* view = nullptr;
    const ProgramAudioRingHeader* header = nullptr;
    const float* samples = nullptr;
    SharedAudioRingOptions options;
    std::size_t mappingBytes = 0;
    std::uint64_t cursor = 0;
    std::uint64_t framesRead = 0;
    std::uint64_t framesSkipped = 0;
#endif
};

SharedAudioRingReader::SharedAudioRingReader(std::unique_ptr<Impl> impl) : m_impl(std::move(impl)) {}
SharedAudioRingReader::~SharedAudioRingReader() { Close(); }

std::unique_ptr<SharedAudioRingReader> SharedAudioRingReader::Open(
    const SharedAudioRingOptions& options, std::string& error) {
#ifdef _WIN32
    std::size_t mappingBytes = 0;
    const std::wstring ringName = Utf8ToWide(options.ringName);
    if (!MappingBytes(options, mappingBytes) || ringName.empty()) {
        error = "Invalid shared audio ring options";
        return nullptr;
    }
    HANDLE mapping = OpenFileMappingW(FILE_MAP_READ, FALSE, ringName.c_str());
    if (!mapping) { error = "Could not open the shared audio ring"; return nullptr; }
    void* view = MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, mappingBytes);
    if (!view) {
        CloseHandle(mapping);
        error = "Could not map the shared audio ring for reading";
        return nullptr;
    }
    auto impl = std::make_unique<Impl>();
    impl->mapping = mapping;
    impl->view = view;
    impl->header = static_cast<const ProgramAudioRingHeader*>(view);
    impl->samples = reinterpret_cast<const float*>(static_cast<const std::uint8_t*>(view) +
        ilystream::program_transport::kProgramAudioRingHeaderBytes);
    impl->options = options;
    impl->mappingBytes = mappingBytes;
    bool valid = false;
    for (std::size_t attempt = 0; attempt < kReadAttempts; ++attempt) {
        const std::uint64_t before = ReadSequence(impl->header);
        if ((before & 1U) != 0) continue;
        const ProgramAudioRingHeader snapshot = *impl->header;
        MemoryBarrier();
        const std::uint64_t after = ReadSequence(impl->header);
        if (before == after && (after & 1U) == 0 &&
            MetadataMatches(snapshot, options, mappingBytes)) {
            impl->cursor = snapshot.oldestFrame;
            valid = true;
            break;
        }
    }
    if (!valid) {
        UnmapViewOfFile(view);
        CloseHandle(mapping);
        error = "Shared audio ring metadata is invalid";
        return nullptr;
    }
    error.clear();
    return std::unique_ptr<SharedAudioRingReader>(new SharedAudioRingReader(std::move(impl)));
#else
    (void)options;
    error = "Shared audio rings are only available on Windows";
    return nullptr;
#endif
}

SharedAudioReadResult SharedAudioRingReader::Read(
    std::size_t maxFrames, std::vector<float>& output, SharedAudioReadStatus& status) {
    output.clear();
#ifdef _WIN32
    if (!m_impl || maxFrames == 0 || maxFrames > m_impl->options.blockFrames) {
        return SharedAudioReadResult::error;
    }
    for (std::size_t attempt = 0; attempt < kReadAttempts; ++attempt) {
        const std::uint64_t before = ReadSequence(m_impl->header);
        if ((before & 1U) != 0) continue;
        const ProgramAudioRingHeader snapshot = *m_impl->header;
        if (snapshot.magic == 0) return SharedAudioReadResult::closed;
        if (!MetadataMatches(snapshot, m_impl->options, m_impl->mappingBytes)) {
            MemoryBarrier();
            const std::uint64_t after = ReadSequence(m_impl->header);
            if (before == after && (after & 1U) == 0) return SharedAudioReadResult::error;
            continue;
        }
        std::uint64_t cursor = m_impl->cursor;
        std::uint64_t skipped = 0;
        if (cursor < snapshot.oldestFrame) {
            skipped = snapshot.oldestFrame - cursor;
            cursor = snapshot.oldestFrame;
        }
        if (cursor > snapshot.writeFrame) return SharedAudioReadResult::error;
        const std::uint64_t available = snapshot.writeFrame - cursor;
        if (available == 0) {
            MemoryBarrier();
            const std::uint64_t after = ReadSequence(m_impl->header);
            if (before == after && (after & 1U) == 0) {
                status = {snapshot.writeFrame, m_impl->framesRead,
                    m_impl->framesSkipped, snapshot.framesDropped};
                return SharedAudioReadResult::noData;
            }
            continue;
        }
        const std::size_t frames = static_cast<std::size_t>(
            std::min<std::uint64_t>(available, maxFrames));
        output.resize(frames * snapshot.channels);
        const std::size_t firstFrame = static_cast<std::size_t>(cursor % snapshot.capacityFrames);
        const std::size_t firstCount = std::min(frames,
            static_cast<std::size_t>(snapshot.capacityFrames) - firstFrame);
        const std::size_t bytesPerFrame = static_cast<std::size_t>(snapshot.channels) * sizeof(float);
        std::memcpy(output.data(), m_impl->samples + firstFrame * snapshot.channels,
            firstCount * bytesPerFrame);
        if (firstCount < frames) {
            std::memcpy(output.data() + firstCount * snapshot.channels, m_impl->samples,
                (frames - firstCount) * bytesPerFrame);
        }
        MemoryBarrier();
        const std::uint64_t after = ReadSequence(m_impl->header);
        if (before != after || (after & 1U) != 0) continue;
        m_impl->cursor = cursor + frames;
        m_impl->framesRead += frames;
        m_impl->framesSkipped += skipped;
        status = {snapshot.writeFrame, m_impl->framesRead,
            m_impl->framesSkipped, snapshot.framesDropped};
        return SharedAudioReadResult::data;
    }
    return SharedAudioReadResult::noData;
#else
    (void)maxFrames; (void)status;
    return SharedAudioReadResult::error;
#endif
}

void SharedAudioRingReader::Close() {
#ifdef _WIN32
    if (!m_impl) return;
    if (m_impl->view) UnmapViewOfFile(m_impl->view);
    if (m_impl->mapping) CloseHandle(m_impl->mapping);
    m_impl->view = nullptr;
    m_impl->mapping = nullptr;
#endif
    m_impl.reset();
}

} // namespace ily::audio
