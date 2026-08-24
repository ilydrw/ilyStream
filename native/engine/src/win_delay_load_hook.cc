/*
 * Delay-load hook so the compiled Node addon resolves its N-API imports from
 * whatever executable is hosting it (node.exe, electron.exe, ...) rather than a
 * literal "node.exe" on disk.
 *
 * The addon imports napi_* from "node.exe". Without this hook those imports are
 * bound at load time and fail inside Electron (host is electron.exe), crashing
 * on require(). Paired with the linker flag /DELAYLOAD:node.exe, this hook
 * intercepts the delayed load of the host binary and returns a handle to the
 * running process image instead.
 *
 * Vendored from node-gyp (src/win_delay_load_hook.cc), which node-gyp injects
 * automatically; this project builds the addon with raw CMake, so we add it
 * ourselves.
 */

#ifdef _MSC_VER

#pragma managed(push, off)

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>

#include <delayimp.h>
#include <string.h>

#ifndef HOST_BINARY
#define HOST_BINARY "node.exe"
#endif

static FARPROC WINAPI load_exe_hook(unsigned int event, DelayLoadInfo* info) {
  HMODULE m;
  if (event != dliNotePreLoadLibrary)
    return NULL;

  if (_stricmp(info->szDll, HOST_BINARY) != 0)
    return NULL;

  // Prefer libnode.dll (node built as a shared lib) then fall back to the
  // hosting process image (node.exe / electron.exe / a renamed host).
  m = GetModuleHandle(TEXT("libnode.dll"));
  if (m == NULL) m = GetModuleHandle(NULL);
  return (FARPROC) m;
}

decltype(__pfnDliNotifyHook2) __pfnDliNotifyHook2 = load_exe_hook;

#pragma managed(pop)

#endif
