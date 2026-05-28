#include <windows.h>
#include <sddl.h>

#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

#include "IlyStreamFrameBridge.h"

namespace
{
using namespace ilystream::vcam;

class SharedFrameWriter
{
public:
    ~SharedFrameWriter()
    {
        InvalidateHeader();
        ResetHandles();
        if (m_securityDescriptor)
        {
            LocalFree(m_securityDescriptor);
            m_securityDescriptor = nullptr;
        }
    }

    void InvalidateHeader()
    {
        if (!m_view) return;
        auto* header = Header();
        MemoryBarrier();
        header->magic = 0;
        header->dataSize = 0;
        header->frameId = 0;
        MemoryBarrier();
    }

    bool Initialize()
    {
        SECURITY_ATTRIBUTES securityAttributes{};
        securityAttributes.nLength = sizeof(securityAttributes);
        securityAttributes.bInheritHandle = FALSE;

        // The bridge is created by the desktop app and read by Windows'
        // camera stack. Keep write access scoped to the owner/admin/system
        // instead of exposing the feed as a world-writable mapping.
        if (ConvertStringSecurityDescriptorToSecurityDescriptorW(
                L"D:P(A;;GA;;;OW)(A;;GA;;;SY)(A;;GA;;;BA)(A;;GR;;;LS)(A;;GR;;;NS)(A;;GR;;;AC)",
                SDDL_REVISION_1,
                &m_securityDescriptor,
                nullptr))
        {
            securityAttributes.lpSecurityDescriptor = m_securityDescriptor;
        }

        if (InitializeFileMapping(securityAttributes))
        {
            InitializeHeader();
            return true;
        }

        if (InitializeNamedMapping(securityAttributes, kGlobalFrameMappingName) ||
            InitializeNamedMapping(securityAttributes, kLocalFrameMappingName))
        {
            InitializeHeader();
            return true;
        }

        return false;
    }

    bool WriteFrame(const PipeFrameHeader& frame, const std::vector<uint8_t>& data)
    {
        if (!m_view) return false;
        if (frame.magic != kPipeFrameMagic || frame.version != kFrameBridgeVersion) return false;
        if (frame.format != kFrameFormatBgra32) return false;
        if (frame.width == 0 || frame.height == 0 || frame.stride < frame.width * 4) return false;
        if (frame.dataSize != data.size() || frame.dataSize > kMaxFrameBytes) return false;

        auto* header = Header();
        auto* pixels = Pixels();
        const uint32_t nextOddFrameId = (header->frameId + 1) | 1;

        header->frameId = nextOddFrameId;
        MemoryBarrier();

        CopyMemory(pixels, data.data(), frame.dataSize);

        MemoryBarrier();
        header->magic = kFrameBridgeMagic;
        header->version = kFrameBridgeVersion;
        header->width = frame.width;
        header->height = frame.height;
        header->stride = frame.stride;
        header->format = frame.format;
        header->dataSize = frame.dataSize;
        header->timestamp = frame.timestamp;
        header->frameId = nextOddFrameId + 1;
        return true;
    }

private:
    bool InitializeFileMapping(SECURITY_ATTRIBUTES& securityAttributes)
    {
        const std::wstring directory = FrameDataDirectory();
        if (!CreateDirectoryW(
                directory.c_str(),
                securityAttributes.lpSecurityDescriptor ? &securityAttributes : nullptr))
        {
            const DWORD error = GetLastError();
            if (error != ERROR_ALREADY_EXISTS)
            {
                std::wcerr << L"CreateDirectory failed for " << directory << L": " << error << L"\n";
                return false;
            }
        }

        const std::wstring path = FrameDataFilePath();
        m_file = CreateFileW(
            path.c_str(),
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            securityAttributes.lpSecurityDescriptor ? &securityAttributes : nullptr,
            OPEN_ALWAYS,
            FILE_ATTRIBUTE_NORMAL,
            nullptr);

        if (m_file == INVALID_HANDLE_VALUE)
        {
            std::wcerr << L"CreateFile failed for " << path << L": " << GetLastError() << L"\n";
            return false;
        }

        LARGE_INTEGER size{};
        size.QuadPart = SharedFrameMappingBytes();
        if (!SetFilePointerEx(m_file, size, nullptr, FILE_BEGIN) || !SetEndOfFile(m_file))
        {
            std::wcerr << L"SetEndOfFile failed for " << path << L": " << GetLastError() << L"\n";
            ResetHandles();
            return false;
        }

        m_mapping = CreateFileMappingW(
            m_file,
            securityAttributes.lpSecurityDescriptor ? &securityAttributes : nullptr,
            PAGE_READWRITE,
            0,
            SharedFrameMappingBytes(),
            nullptr);

        if (!m_mapping)
        {
            std::wcerr << L"CreateFileMapping failed for " << path << L": " << GetLastError() << L"\n";
            ResetHandles();
            return false;
        }

        m_view = MapViewOfFile(m_mapping, FILE_MAP_ALL_ACCESS, 0, 0, SharedFrameMappingBytes());
        if (!m_view)
        {
            std::wcerr << L"MapViewOfFile failed for " << path << L": " << GetLastError() << L"\n";
            ResetHandles();
            return false;
        }

        std::wcerr << L"Using frame file bridge: " << path << L"\n";
        return true;
    }

    bool InitializeNamedMapping(SECURITY_ATTRIBUTES& securityAttributes, const wchar_t* mappingName)
    {
        m_mapping = CreateFileMappingW(
            INVALID_HANDLE_VALUE,
            securityAttributes.lpSecurityDescriptor ? &securityAttributes : nullptr,
            PAGE_READWRITE,
            0,
            SharedFrameMappingBytes(),
            mappingName);

        if (!m_mapping)
        {
            std::wcerr << L"CreateFileMapping failed for " << mappingName << L": " << GetLastError() << L"\n";
            return false;
        }

        m_view = MapViewOfFile(m_mapping, FILE_MAP_ALL_ACCESS, 0, 0, SharedFrameMappingBytes());
        if (!m_view)
        {
            std::wcerr << L"MapViewOfFile failed for " << mappingName << L": " << GetLastError() << L"\n";
            ResetHandles();
            return false;
        }

        std::wcerr << L"Using named frame bridge: " << mappingName << L"\n";
        return true;
    }

    void InitializeHeader()
    {
        auto* header = Header();
        header->magic = kFrameBridgeMagic;
        header->version = kFrameBridgeVersion;
        header->width = kDefaultFrameWidth;
        header->height = kDefaultFrameHeight;
        header->stride = kDefaultFrameWidth * 4;
        header->format = kFrameFormatBgra32;
        header->frameId = 0;
        header->dataSize = 0;
        header->timestamp = 0;
    }

    void ResetHandles()
    {
        if (m_view)
        {
            UnmapViewOfFile(m_view);
            m_view = nullptr;
        }
        if (m_mapping)
        {
            CloseHandle(m_mapping);
            m_mapping = nullptr;
        }
        if (m_file != INVALID_HANDLE_VALUE)
        {
            CloseHandle(m_file);
            m_file = INVALID_HANDLE_VALUE;
        }
    }

    SharedFrameHeader* Header()
    {
        return static_cast<SharedFrameHeader*>(m_view);
    }

    uint8_t* Pixels()
    {
        return reinterpret_cast<uint8_t*>(m_view) + sizeof(SharedFrameHeader);
    }

    HANDLE m_mapping = nullptr;
    HANDLE m_file = INVALID_HANDLE_VALUE;
    void* m_view = nullptr;
    PSECURITY_DESCRIPTOR m_securityDescriptor = nullptr;
};

bool ReadExact(HANDLE handle, void* destination, DWORD bytesToRead)
{
    auto* cursor = static_cast<uint8_t*>(destination);
    DWORD remaining = bytesToRead;

    while (remaining > 0)
    {
        DWORD bytesRead = 0;
        if (!ReadFile(handle, cursor, remaining, &bytesRead, nullptr))
        {
            return false;
        }
        if (bytesRead == 0)
        {
            return false;
        }

        cursor += bytesRead;
        remaining -= bytesRead;
    }

    return true;
}
}

int wmain()
{
    SharedFrameWriter writer;
    if (!writer.Initialize())
    {
        return 1;
    }

    HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
    if (!input || input == INVALID_HANDLE_VALUE)
    {
        return 2;
    }

    while (true)
    {
        PipeFrameHeader frame{};
        if (!ReadExact(input, &frame, sizeof(frame)))
        {
            return 0;
        }

        if (frame.dataSize > kMaxFrameBytes)
        {
            return 3;
        }

        std::vector<uint8_t> data(frame.dataSize);
        if (!ReadExact(input, data.data(), frame.dataSize))
        {
            return 0;
        }

        writer.WriteFrame(frame, data);
    }
}
