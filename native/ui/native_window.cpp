#include "native_window.h"

#if defined(_WIN32)

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <string>
#include <cwchar>

namespace {

constexpr wchar_t kWindowClass[] = L"ilyStreamNativeHealthWindow";

std::wstring Widen(const char* value) {
    if (!value) return {};
    const int length = MultiByteToWideChar(CP_UTF8, 0, value, -1, nullptr, 0);
    if (length <= 1) return {};
    std::wstring result(static_cast<std::size_t>(length - 1), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value, -1, result.data(), length);
    return result;
}

const ily::ui::UiState* g_state = nullptr;

void DrawHealthCenter(HWND window, HDC dc) {
    RECT bounds{};
    GetClientRect(window, &bounds);
    SetBkMode(dc, TRANSPARENT);

    HFONT titleFont = CreateFontW(
        28, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    HFONT bodyFont = CreateFontW(
        16, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE,
        DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");

    RECT title = {32, 28, bounds.right - 32, 72};
    SelectObject(dc, titleFont);
    SetTextColor(dc, RGB(235, 238, 245));
    DrawTextW(dc, L"ilyStream Health Center", -1, &title, DT_LEFT | DT_SINGLELINE);

    SelectObject(dc, bodyFont);
    SetTextColor(dc, RGB(170, 180, 195));
    RECT subtitle = {32, 82, bounds.right - 32, 112};
    DrawTextW(dc, L"Native UI pilot — platform-rendered diagnostics", -1, &subtitle,
              DT_LEFT | DT_SINGLELINE);

    SetTextColor(dc, RGB(125, 220, 160));
    RECT status = {32, 150, bounds.right - 32, 182};
    DrawTextW(dc, L"●  Native window is running", -1, &status, DT_LEFT | DT_SINGLELINE);

    SetTextColor(dc, RGB(210, 215, 225));
    RECT details = {32, 205, bounds.right - 32, 300};
    wchar_t summary[256]{};
    const auto* state = g_state;
    swprintf_s(summary, L"Connected %u   Ready %u   Needs review %u   Real traffic %u\n\n"
                        L"Health Center rendering is now owned by C++ on Windows.\n"
                        L"The same UI state contract is shared with macOS and Linux.\n\n"
                        L"Close this window to return to the Electron renderer.",
                state ? state->connectedServices : 0,
                state ? state->readyServices : 0,
                state ? state->needsReview : 0,
                state ? state->realTraffic : 0);
    DrawTextW(dc, summary, -1, &details, DT_LEFT | DT_WORDBREAK);

    DeleteObject(titleFont);
    DeleteObject(bodyFont);
}

LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_PAINT: {
        PAINTSTRUCT paint{};
        HDC dc = BeginPaint(window, &paint);
        DrawHealthCenter(window, dc);
        EndPaint(window, &paint);
        return 0;
    }
    case WM_ERASEBKGND: {
        RECT bounds{};
        GetClientRect(window, &bounds);
        HBRUSH brush = CreateSolidBrush(RGB(15, 17, 21));
        FillRect(reinterpret_cast<HDC>(wParam), &bounds, brush);
        DeleteObject(brush);
        return 1;
    }
    case WM_CLOSE:
        DestroyWindow(window);
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    default:
        return DefWindowProcW(window, message, wParam, lParam);
    }
}

} // namespace

namespace ily::ui {

bool RunNativeWindow(const UiState& initialState, std::string& error) {
    g_state = &initialState;
    const HINSTANCE instance = GetModuleHandleW(nullptr);
    WNDCLASSW windowClass{};
    windowClass.hInstance = instance;
    windowClass.lpfnWndProc = WindowProc;
    windowClass.lpszClassName = kWindowClass;
    windowClass.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(IDC_ARROW));
    windowClass.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    if (!RegisterClassW(&windowClass) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
        error = "RegisterClassW failed";
        return false;
    }

    HWND window = CreateWindowExW(
        0, kWindowClass, L"ilyStream Health Center",
        WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 720, 460,
        nullptr, nullptr, instance, nullptr);
    if (!window) {
        error = "CreateWindowExW failed";
        return false;
    }

    ShowWindow(window, SW_SHOW);
    UpdateWindow(window);
    BringWindowToTop(window);
    SetForegroundWindow(window);
    SetFocus(window);
    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    return true;
}

} // namespace ily::ui

#elif defined(__linux__) && defined(ILY_NATIVE_UI_HAS_X11)

#include <X11/Xlib.h>

namespace ily::ui {

bool RunNativeWindow(const UiState&, std::string& error) {
    Display* display = XOpenDisplay(nullptr);
    if (!display) {
        error = "XOpenDisplay failed (a graphical X11 session is required)";
        return false;
    }

    const int screen = DefaultScreen(display);
    const Window window = XCreateSimpleWindow(
        display, RootWindow(display, screen), 0, 0, 720, 460, 1,
        BlackPixel(display, screen), WhitePixel(display, screen));
    XStoreName(display, window, "ilyStream Health Center");
    XSelectInput(display, window, ExposureMask | KeyPressMask | StructureNotifyMask);
    XMapWindow(display, window);

    bool running = true;
    while (running) {
        XEvent event{};
        XNextEvent(display, &event);
        if (event.type == DestroyNotify || event.type == KeyPress) running = false;
        if (event.type == Expose) {
            XDrawString(display, window, DefaultGC(display, screen), 32, 58,
                        "ilyStream Health Center", 22);
            XDrawString(display, window, DefaultGC(display, screen), 32, 98,
                        "Native UI pilot - Linux X11 renderer", 36);
            XDrawString(display, window, DefaultGC(display, screen), 32, 150,
                        "Native window is running", 24);
            XFlush(display);
        }
    }
    XDestroyWindow(display, window);
    XCloseDisplay(display);
    return true;
}

} // namespace ily::ui

#elif defined(__APPLE__)

// Cocoa implementation lives in native_window_mac.mm.

#else

namespace ily::ui {

bool RunNativeWindow(const UiState&, std::string& error) {
    error = "No native window backend is available for this platform";
    return false;
}

} // namespace ily::ui

#endif
