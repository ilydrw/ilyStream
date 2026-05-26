#pragma once

#include <cstdint>
#include <string>
#include <windows.h>

namespace ilystream::vcam
{
constexpr wchar_t kGlobalFrameMappingName[] = L"Global\\IlyStreamVirtualCameraFrame";
constexpr wchar_t kLocalFrameMappingName[] = L"Local\\IlyStreamVirtualCameraFrame";
constexpr wchar_t kFrameDataDirectoryName[] = L"ilyStream";
constexpr wchar_t kFrameDataFileName[] = L"virtual-camera-frame.dat";
constexpr uint32_t kFrameBridgeMagic = 0x43564C49; // ILVC
constexpr uint32_t kPipeFrameMagic = 0x46564349; // ICVF
constexpr uint32_t kFrameBridgeVersion = 1;
constexpr uint32_t kFrameFormatBgra32 = 1;
constexpr uint32_t kDefaultFrameWidth = 1280;
constexpr uint32_t kDefaultFrameHeight = 720;
constexpr uint32_t kMaxFrameWidth = 1920;
constexpr uint32_t kMaxFrameHeight = 1080;
constexpr uint32_t kMaxFrameBytes = kMaxFrameWidth * kMaxFrameHeight * 4;

#pragma pack(push, 1)
struct SharedFrameHeader
{
    uint32_t magic;
    uint32_t version;
    uint32_t width;
    uint32_t height;
    uint32_t stride;
    uint32_t format;
    uint32_t frameId;
    uint32_t dataSize;
    uint64_t timestamp;
};

struct PipeFrameHeader
{
    uint32_t magic;
    uint32_t version;
    uint32_t width;
    uint32_t height;
    uint32_t stride;
    uint32_t format;
    uint32_t dataSize;
    uint64_t timestamp;
};
#pragma pack(pop)

constexpr uint32_t SharedFrameMappingBytes()
{
    return static_cast<uint32_t>(sizeof(SharedFrameHeader) + kMaxFrameBytes);
}

inline std::wstring FrameDataDirectory()
{
    wchar_t programData[MAX_PATH]{};
    const DWORD length = GetEnvironmentVariableW(L"ProgramData", programData, MAX_PATH);
    std::wstring base = (length > 0 && length < MAX_PATH) ? programData : L"C:\\ProgramData";
    if (!base.empty() && base.back() != L'\\')
    {
        base += L'\\';
    }
    base += kFrameDataDirectoryName;
    return base;
}

inline std::wstring FrameDataFilePath()
{
    std::wstring path = FrameDataDirectory();
    path += L'\\';
    path += kFrameDataFileName;
    return path;
}
}
