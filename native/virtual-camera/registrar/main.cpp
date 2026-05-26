#include <windows.h>
#include <mfapi.h>
#include <mfvirtualcamera.h>
#include <wrl/client.h>

#include <algorithm>
#include <cwctype>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;

namespace
{
constexpr wchar_t kDefaultFriendlyName[] = L"ilyStream";
constexpr wchar_t kDefaultSourceClsid[] = L"{6ED0F705-6D87-4A62-A28D-C4DE6F1FF16B}";

// This attribute tells the Media Foundation source which mode to activate.
// The initial ilyStream camera uses the synthetic source; a later frame bridge
// can replace the sample generator without changing the OS registration path.
// {C7F7C57B-DF30-41D0-AFFC-15201CDF920D}
static const GUID VCAM_KIND =
{ 0xc7f7c57b, 0xdf30, 0x41d0, { 0xaf, 0xfc, 0x15, 0x20, 0x1c, 0xdf, 0x92, 0x0d } };
constexpr UINT32 kVirtualCameraKindSynthetic = 0;

struct Options
{
    std::wstring command = L"status";
    std::wstring friendlyName = kDefaultFriendlyName;
    std::wstring sourceClsid = kDefaultSourceClsid;
    MFVirtualCameraLifetime lifetime = MFVirtualCameraLifetime_System;
    MFVirtualCameraAccess access = MFVirtualCameraAccess_CurrentUser;
};

std::wstring ToLower(std::wstring value)
{
    std::transform(value.begin(), value.end(), value.begin(), [](wchar_t ch) {
        return static_cast<wchar_t>(towlower(ch));
    });
    return value;
}

std::wstring JsonEscape(const std::wstring& value)
{
    std::wstring escaped;
    escaped.reserve(value.size());

    for (wchar_t ch : value)
    {
        switch (ch)
        {
        case L'\\':
            escaped += L"\\\\";
            break;
        case L'"':
            escaped += L"\\\"";
            break;
        case L'\n':
            escaped += L"\\n";
            break;
        case L'\r':
            escaped += L"\\r";
            break;
        case L'\t':
            escaped += L"\\t";
            break;
        default:
            escaped += ch;
            break;
        }
    }

    return escaped;
}

std::wstring HrHex(HRESULT hr)
{
    std::wstringstream stream;
    stream << L"0x" << std::uppercase << std::hex << std::setw(8) << std::setfill(L'0')
           << static_cast<unsigned long>(hr);
    return stream.str();
}

void PrintUsage()
{
    std::wcout
        << L"Usage: IlyStreamVirtualCameraRegistrar <status|install|stop|remove> [options]\n"
        << L"\n"
        << L"Options:\n"
        << L"  --name <friendlyName>        Camera name before Windows appends its virtual camera suffix.\n"
        << L"  --source-clsid <{CLSID}>     CLSID of the registered Media Foundation media source.\n"
        << L"  --session                    Create a session-lifetime camera.\n"
        << L"  --system                     Create a system-lifetime camera. Default.\n"
        << L"  --all-users                  Make camera visible to all users. Requires admin.\n"
        << L"  --current-user               Make camera visible to current user. Default.\n";
}

bool TryParseArgs(int argc, wchar_t* argv[], Options& options)
{
    if (argc >= 2)
    {
        options.command = ToLower(argv[1]);
    }

    if (options.command == L"--help" || options.command == L"/?" || options.command == L"help")
    {
        PrintUsage();
        return false;
    }

    for (int i = 2; i < argc; ++i)
    {
        std::wstring arg = ToLower(argv[i]);

        if (arg == L"--name" && i + 1 < argc)
        {
            options.friendlyName = argv[++i];
        }
        else if (arg == L"--source-clsid" && i + 1 < argc)
        {
            options.sourceClsid = argv[++i];
        }
        else if (arg == L"--session")
        {
            options.lifetime = MFVirtualCameraLifetime_Session;
        }
        else if (arg == L"--system")
        {
            options.lifetime = MFVirtualCameraLifetime_System;
        }
        else if (arg == L"--all-users")
        {
            options.access = MFVirtualCameraAccess_AllUsers;
        }
        else if (arg == L"--current-user")
        {
            options.access = MFVirtualCameraAccess_CurrentUser;
        }
        else
        {
            std::wcerr << L"Unknown or incomplete option: " << argv[i] << L"\n";
            PrintUsage();
            return false;
        }
    }

    return true;
}

void PrintJsonStatus(
    const wchar_t* action,
    HRESULT hr,
    BOOL supported,
    const Options& options,
    const std::wstring& message = L"")
{
    std::wcout
        << L"{"
        << L"\"action\":\"" << JsonEscape(action) << L"\","
        << L"\"ok\":" << (SUCCEEDED(hr) ? L"true" : L"false") << L","
        << L"\"hresult\":\"" << HrHex(hr) << L"\","
        << L"\"supported\":" << (supported ? L"true" : L"false") << L","
        << L"\"friendlyName\":\"" << JsonEscape(options.friendlyName) << L"\","
        << L"\"sourceClsid\":\"" << JsonEscape(options.sourceClsid) << L"\","
        << L"\"minimumWindowsBuild\":22000";

    if (!message.empty())
    {
        std::wcout << L",\"message\":\"" << JsonEscape(message) << L"\"";
    }

    std::wcout << L"}\n";
}

HRESULT CreateVirtualCamera(const Options& options, IMFVirtualCamera** camera)
{
    return MFCreateVirtualCamera(
        MFVirtualCameraType_SoftwareCameraSource,
        options.lifetime,
        options.access,
        options.friendlyName.c_str(),
        options.sourceClsid.c_str(),
        nullptr,
        0,
        camera);
}

HRESULT RunCameraCommand(const Options& options)
{
    BOOL supported = FALSE;
    HRESULT supportHr = MFIsVirtualCameraTypeSupported(MFVirtualCameraType_SoftwareCameraSource, &supported);
    if (FAILED(supportHr) || !supported)
    {
        PrintJsonStatus(options.command.c_str(), supportHr, supported, options, L"Windows virtual camera API is not available.");
        return FAILED(supportHr) ? supportHr : HRESULT_FROM_WIN32(ERROR_NOT_SUPPORTED);
    }

    if (options.command == L"status")
    {
        PrintJsonStatus(L"status", S_OK, supported, options);
        return S_OK;
    }

    ComPtr<IMFVirtualCamera> camera;
    HRESULT hr = CreateVirtualCamera(options, &camera);
    if (FAILED(hr))
    {
        PrintJsonStatus(options.command.c_str(), hr, supported, options, L"MFCreateVirtualCamera failed.");
        return hr;
    }

    if (options.command == L"install")
    {
        hr = camera->SetUINT32(VCAM_KIND, kVirtualCameraKindSynthetic);
        if (SUCCEEDED(hr))
        {
            hr = camera->Start(nullptr);
        }
    }
    else if (options.command == L"stop")
    {
        hr = camera->Stop();
    }
    else if (options.command == L"remove")
    {
        hr = camera->Remove();
    }
    else
    {
        PrintUsage();
        return E_INVALIDARG;
    }

    std::wstring message;
    if (options.command == L"install" && FAILED(hr))
    {
        message = L"Could not start the virtual camera. Make sure the media source COM DLL is registered under the source CLSID.";
    }

    PrintJsonStatus(options.command.c_str(), hr, supported, options, message);
    return hr;
}
}

int wmain(int argc, wchar_t* argv[])
{
    Options options;
    if (!TryParseArgs(argc, argv, options))
    {
        return 2;
    }

    HRESULT coHr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(coHr))
    {
        PrintJsonStatus(options.command.c_str(), coHr, FALSE, options, L"CoInitializeEx failed.");
        return static_cast<int>(coHr);
    }

    HRESULT mfHr = MFStartup(MF_VERSION, MFSTARTUP_FULL);
    if (FAILED(mfHr))
    {
        PrintJsonStatus(options.command.c_str(), mfHr, FALSE, options, L"MFStartup failed.");
        CoUninitialize();
        return static_cast<int>(mfHr);
    }

    HRESULT hr = RunCameraCommand(options);

    MFShutdown();
    CoUninitialize();
    return SUCCEEDED(hr) ? 0 : 1;
}
