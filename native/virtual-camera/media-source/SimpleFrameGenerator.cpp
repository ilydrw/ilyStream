//
// Copyright (C) Microsoft Corporation. All rights reserved.
//
#include "pch.h"
#include "..\common\IlyStreamFrameBridge.h"

SimpleFrameGenerator::~SimpleFrameGenerator()
{
    if (m_bridgeView)
    {
        UnmapViewOfFile(m_bridgeView);
        m_bridgeView = nullptr;
    }
    if (m_bridgeMapping)
    {
        CloseHandle(m_bridgeMapping);
        m_bridgeMapping = nullptr;
    }
    if (m_bridgeFile != INVALID_HANDLE_VALUE)
    {
        CloseHandle(m_bridgeFile);
        m_bridgeFile = INVALID_HANDLE_VALUE;
    }
}

HRESULT SimpleFrameGenerator::Initialize(_In_ IMFMediaType* pMediaType)
{
    RETURN_HR_IF_NULL(E_INVALIDARG, pMediaType);

    RETURN_IF_FAILED(pMediaType->GetGUID(MF_MT_SUBTYPE, &m_subType));
    if (m_subType != MFVideoFormat_RGB32 && m_subType != MFVideoFormat_NV12)
    {
        RETURN_HR_MSG(MF_E_UNSUPPORTED_FORMAT, "Unsupported format: %s", winrt::to_hstring(m_subType).data());
    }
    MFGetAttributeSize(pMediaType, MF_MT_FRAME_SIZE, &m_width, &m_height);

    return S_OK;
}

/*:
   Writes to a buffer representing a 2D image.
   Writes a different constant to each line based on row number and current time.
   Assumes top down image, no negative stride and pBuf points to the begnning of the buffer of length len.
   Param:
   pBuf - pointer to beginning of buffer
   pitch - line length in bytes
   len - length of buffer in bytes
*/
HRESULT SimpleFrameGenerator::CreateFrame(
    _Inout_updates_bytes_(len) BYTE* pBuf,
    _In_ DWORD len,
    _In_ LONG pitch,
    _In_ ULONG rgbMask)
{
    if (m_subType == MFVideoFormat_RGB32)
    {
        DEBUG_MSG(L"RGB32 frames %s\n", winrt::to_hstring(MFVideoFormat_RGB32).data());

        if (!_CopyBridgeFrameToRGB32(pBuf, len, pitch, m_width, m_height))
        {
            RETURN_IF_FAILED(_CreateRGB32Frame(pBuf, len, pitch, m_width, m_height, rgbMask));
        }
    }
    else if(m_subType == MFVideoFormat_NV12)
    {
        DEBUG_MSG(L"NV12 frames %s \n", winrt::to_hstring(MFVideoFormat_NV12).data());

        DWORD frameBuffLen = m_width * m_height * 4;
        wil::unique_cotaskmem_ptr<BYTE[]> spBuff = wil::make_unique_cotaskmem_nothrow<BYTE[]>(frameBuffLen);
        RETURN_IF_NULL_ALLOC(spBuff.get());

        if (!_CopyBridgeFrameToRGB32(spBuff.get(), frameBuffLen, m_width * 4, m_width, m_height))
        {
            RETURN_IF_FAILED(_CreateRGB32Frame(spBuff.get(), frameBuffLen, m_width * 4, m_width, m_height, rgbMask));
        }
        RETURN_IF_FAILED(RGB32ToNV12Frame(spBuff.get(), frameBuffLen, m_width * 4, m_width, m_height, pBuf, len, pitch));
    }
    else
    {
        return MF_E_UNSUPPORTED_FORMAT;
    }

    return S_OK;
}

bool SimpleFrameGenerator::_EnsureBridgeMapping()
{
    if (m_bridgeView != nullptr)
    {
        return true;
    }

    if (_OpenBridgeFileMapping())
    {
        return true;
    }

    return _OpenNamedBridgeMapping(ilystream::vcam::kGlobalFrameMappingName) ||
        _OpenNamedBridgeMapping(ilystream::vcam::kLocalFrameMappingName);
}

bool SimpleFrameGenerator::_OpenBridgeFileMapping()
{
    const std::wstring path = ilystream::vcam::FrameDataFilePath();
    m_bridgeFile = CreateFileW(
        path.c_str(),
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        nullptr);

    if (m_bridgeFile == INVALID_HANDLE_VALUE)
    {
        return false;
    }

    m_bridgeMapping = CreateFileMappingW(m_bridgeFile, nullptr, PAGE_READONLY, 0, 0, nullptr);
    if (!m_bridgeMapping)
    {
        CloseHandle(m_bridgeFile);
        m_bridgeFile = INVALID_HANDLE_VALUE;
        return false;
    }

    m_bridgeView = MapViewOfFile(m_bridgeMapping, FILE_MAP_READ, 0, 0, ilystream::vcam::SharedFrameMappingBytes());
    if (!m_bridgeView)
    {
        CloseHandle(m_bridgeMapping);
        m_bridgeMapping = nullptr;
        CloseHandle(m_bridgeFile);
        m_bridgeFile = INVALID_HANDLE_VALUE;
        return false;
    }

    return true;
}

bool SimpleFrameGenerator::_OpenNamedBridgeMapping(const wchar_t* mappingName)
{
    m_bridgeMapping = OpenFileMappingW(FILE_MAP_READ, FALSE, mappingName);
    if (!m_bridgeMapping)
    {
        return false;
    }

    m_bridgeView = MapViewOfFile(m_bridgeMapping, FILE_MAP_READ, 0, 0, ilystream::vcam::SharedFrameMappingBytes());
    if (!m_bridgeView)
    {
        CloseHandle(m_bridgeMapping);
        m_bridgeMapping = nullptr;
        return false;
    }

    return true;
}

bool SimpleFrameGenerator::_CopyBridgeFrameToRGB32(
    _Inout_updates_bytes_(len) BYTE* pBuf,
    _In_ DWORD len,
    _In_ LONG pitch,
    _In_ DWORD width,
    _In_ DWORD height)
{
    if (!pBuf)
    {
        return false;
    }
    if (!_EnsureBridgeMapping())
    {
        return false;
    }

    const auto* header = static_cast<const ilystream::vcam::SharedFrameHeader*>(m_bridgeView);
    const auto* pixels = reinterpret_cast<const BYTE*>(m_bridgeView) + sizeof(ilystream::vcam::SharedFrameHeader);
    const DWORD rowBytes = width * 4;
    const DWORD absPitch = static_cast<DWORD>(pitch < 0 ? -pitch : pitch);

    if (len < absPitch * height)
    {
        return false;
    }

    if (header->magic != ilystream::vcam::kFrameBridgeMagic ||
        header->version != ilystream::vcam::kFrameBridgeVersion ||
        header->format != ilystream::vcam::kFrameFormatBgra32 ||
        header->width != width ||
        header->height != height ||
        header->stride < rowBytes ||
        header->dataSize < header->stride * height)
    {
        return _ServeCachedFrame(pBuf, len, pitch, width, height);
    }

    // Spin briefly so a mid-write (odd) frameId or a torn snapshot doesn't
    // surface as a synthetic-pattern flash. Up to ~5ms of polling.
    for (int attempt = 0; attempt < 50; ++attempt)
    {
        const uint32_t frameIdBefore = header->frameId;
        if (frameIdBefore != 0 && (frameIdBefore & 1) == 0)
        {
            MemoryBarrier();
            const DWORD bridgeRowBytes = rowBytes;
            const size_t expected = static_cast<size_t>(bridgeRowBytes) * height;
            if (m_lastBridgeFrame.size() != expected)
            {
                m_lastBridgeFrame.assign(expected, 0);
            }

            for (DWORD row = 0; row < height; ++row)
            {
                const BYTE* source = pixels + row * header->stride;
                CopyMemory(m_lastBridgeFrame.data() + row * bridgeRowBytes, source, bridgeRowBytes);
            }
            MemoryBarrier();

            const uint32_t frameIdAfter = header->frameId;
            if (frameIdBefore == frameIdAfter && (frameIdAfter & 1) == 0)
            {
                m_lastBridgeFrameId = frameIdAfter;
                _BlitCachedToOutput(pBuf, pitch, width, height);
                return true;
            }
        }

        Sleep(0);
        if ((attempt & 7) == 7)
        {
            Sleep(1);
        }
    }

    // Writer is busy. Re-serve the last good frame rather than flash to the
    // synthetic test pattern.
    return _ServeCachedFrame(pBuf, len, pitch, width, height);
}

bool SimpleFrameGenerator::_ServeCachedFrame(
    _Inout_updates_bytes_(len) BYTE* pBuf,
    _In_ DWORD len,
    _In_ LONG pitch,
    _In_ DWORD width,
    _In_ DWORD height)
{
    const DWORD rowBytes = width * 4;
    const DWORD absPitch = static_cast<DWORD>(pitch < 0 ? -pitch : pitch);
    if (len < absPitch * height) return false;
    if (m_lastBridgeFrame.size() != static_cast<size_t>(rowBytes) * height) return false;
    _BlitCachedToOutput(pBuf, pitch, width, height);
    return true;
}

void SimpleFrameGenerator::_BlitCachedToOutput(
    _Inout_updates_bytes_(0) BYTE* pBuf,
    _In_ LONG pitch,
    _In_ DWORD width,
    _In_ DWORD height)
{
    const DWORD rowBytes = width * 4;
    const DWORD absPitch = static_cast<DWORD>(pitch < 0 ? -pitch : pitch);
    for (DWORD row = 0; row < height; ++row)
    {
        BYTE* destination = pitch >= 0
            ? pBuf + row * pitch
            : pBuf + (height - 1 - row) * absPitch;
        const BYTE* source = m_lastBridgeFrame.data() + row * rowBytes;
        CopyMemory(destination, source, rowBytes);
    }
}

//////////////////////////////////////////////////
// private

HRESULT SimpleFrameGenerator::_CreateRGB32Frame(
    _Inout_updates_bytes_(len) BYTE* pBuf,
    _In_ DWORD len,
    _In_ LONG pitch,
    _In_ DWORD width,
    _In_ DWORD height,
    _In_ ULONG rgbMask )
{
    RETURN_HR_IF_NULL(E_INVALIDARG, pBuf);
    const DWORD absPitch = static_cast<DWORD>(pitch < 0 ? -pitch : pitch);
    if (len < (absPitch * height))
    {
        return HRESULT_FROM_WIN32(ERROR_INSUFFICIENT_BUFFER);
    }

    LONGLONG curSysTimeInS = MFGetSystemTime() / (MFTIME)10000000;
    int offset = curSysTimeInS % height;

    for (unsigned int r = 0; r < height; r++)
    {
        BYTE* row = pitch >= 0
            ? pBuf + r * pitch
            : pBuf + (height - 1 - r) * absPitch;
        uint32_t* p = reinterpret_cast<uint32_t*>(row);
        for (unsigned int c = 0; c < width; c++)
        {
            BYTE gray = (BYTE)(r + offset);
            *p = ((uint32_t)gray << 16 | (uint32_t)gray << 8 | (uint32_t)gray) & rgbMask;
            p++;
        }
    }

    return S_OK;
}

//////////////////////////////////////////////////
// pixelFormatConverter

void SimpleFrameGenerator::RGB24ToYUY2(int R, int G, int B, BYTE* pY, BYTE* pU, BYTE* pV)
{
    *pY = ((66 * R + 129 * G + 25 * B + 128) >> 8) + 16;
    *pU = ((-38 * R - 74 * G + 112 * B + 128) >> 8) + 128;
    *pV = ((112 * R - 94 * G - 18 * B + 128) >> 8) + 128;
}

void SimpleFrameGenerator::RGB24ToY(int R, int G, int B, BYTE* pY)
{
    *pY = ((66 * R + 129 * G + 25 * B + 128) >> 8) + 16;
}

void SimpleFrameGenerator::RGB32ToNV12(BYTE RGB1[8], BYTE RGB2[8], BYTE* pY1, BYTE* pY2, BYTE* pUV)
{
    RGB24ToYUY2(RGB1[2], RGB1[1], RGB1[0], pY1, pUV, pUV + 1);
    RGB24ToY(RGB1[6], RGB1[5], RGB1[4], pY1 + 1);
    RGB24ToYUY2(RGB2[2], RGB2[1], RGB2[0], pY2, pUV, pUV + 1);
    RGB24ToY(RGB2[6], RGB2[5], RGB2[4], pY2 + 1);
};

//////////////////////////////////////////////////
// FrameFormatConverter

HRESULT SimpleFrameGenerator::RGB32ToNV12Frame(_Inout_updates_bytes_(len) BYTE* pbBuff, ULONG cbBuff, long stride, UINT width, UINT height, BYTE* pbBuffOut, ULONG cbBuffOut, long strideOut)
{
    do
    {
        RETURN_HR_IF(E_UNEXPECTED, width * 4 * height > cbBuff);
        RETURN_HR_IF(E_UNEXPECTED, width * 1.5 * height > cbBuffOut);
        RETURN_HR_IF_NULL(E_INVALIDARG, pbBuff);

        RETURN_HR_IF_NULL(E_INVALIDARG, pbBuffOut);
        for (DWORD h = 0; h < height - 1; h += 2)
        {
            BYTE* pRGB1 = h * stride + pbBuff;
            BYTE* pRGB2 = (h + 1) * stride + pbBuff;
            BYTE* pY1 = h * strideOut + pbBuffOut;
            BYTE* pY2 = (h + 1) * strideOut + pbBuffOut;
            BYTE* pUV = (h / 2 + height) * strideOut + pbBuffOut;

            for (DWORD w = 0; w < width; w += 2)
            {
                RGB32ToNV12(pRGB1, pRGB2, pY1, pY2, pUV);
                pRGB1 += 8;
                pRGB2 += 8;
                pY1 += 2;
                pY2 += 2;
                pUV += 2;
            }
        }
    } while (FALSE);

    return S_OK;
}
