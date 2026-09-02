cmake_minimum_required(VERSION 3.21)
project(ilystream_engine_project LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Option to use bgfx
option(ILY_USE_BGFX "Use bgfx renderer backend" ON)

# Enable position independent code for shared/module targets
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# nlohmann_json and Catch2 are provided by vcpkg (see vcpkg.json). Resolving
# them with find_package instead of FetchContent keeps configure fully offline
# and deterministic: FetchContent performs git clones/update-checks against
# GitHub on every reconfigure, which can hang the build when the network stalls.
find_package(nlohmann_json CONFIG REQUIRED)
find_package(Catch2 3 CONFIG REQUIRED)

# Include directories
include_directories(include src)

if(MSVC)
    add_compile_options(/Zc:__cplusplus /Zc:preprocessor)
endif()

# Source files for ilystream_engine
set(ENGINE_SOURCES
    src/engine.cpp
    src/backend/bgfx_backend.cpp
    src/renderer/render_device.cpp
    src/renderer/frame_scheduler.cpp
    src/renderer/renderer.cpp
    src/renderer/shader_loader.cpp
    src/renderer/texture_producer.cpp
)

# Desktop duplication and Media Foundation are Windows backends. Keep their
# implementations out of Unix builds; the public engine API is still present
# through the platform stubs in the capture headers and reports the feature as
# unavailable instead of making the whole portable renderer fail to compile.
if(WIN32)
    list(APPEND ENGINE_SOURCES
        src/capture/dxgi_capture.cpp
        src/capture/mf_camera_capture.cpp
    )
endif()

# Shared engine library
add_library(ilystream_engine SHARED ${ENGINE_SOURCES})
target_compile_definitions(ilystream_engine PRIVATE ILY_ENGINE_BUILD_DLL)
target_link_libraries(ilystream_engine PRIVATE nlohmann_json::nlohmann_json)
set_target_properties(ilystream_engine PROPERTIES OUTPUT_NAME "ilystream_engine")
if(APPLE)
    set_target_properties(ilystream_engine PROPERTIES INSTALL_RPATH "@loader_path")
elseif(UNIX)
    set_target_properties(ilystream_engine PROPERTIES INSTALL_RPATH "$ORIGIN")
endif()
if(WIN32)
    target_link_libraries(ilystream_engine PRIVATE
        d3d11
        dxgi
        mf
        mfplat
        mfreadwrite
        mfuuid
        ole32
    )
endif()

# Precompiled, committed sprite-shader bytecode headers (one dir per backend:
# dx11/ spv/ glsl/ essl/ mtl/). shader_loader.cpp includes these by backend
# subdir, e.g. #include "dx11/vs_sprite.sc.bin.h". Regenerate the contents with
# shaders/compile_shaders.ps1; no shaderc is needed for a normal engine build.
target_include_directories(ilystream_engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/shaders/generated)
target_include_directories(ilystream_engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../program-transport)

# The vcpkg manifest disables bgfx's internal render thread. The engine already
# owns a dedicated renderer thread, and bgfx native interop (getInternalData /
# overrideInternal) is only safe on bgfx's render thread.
if(ILY_USE_BGFX)
    find_package(bgfx CONFIG REQUIRED)
    target_compile_definitions(ilystream_engine PUBLIC ILY_USE_BGFX)
    target_link_libraries(ilystream_engine PRIVATE bgfx::bgfx)
endif()

# Find node-addon-api include path
execute_process(
    COMMAND node -e "console.log(require('node-addon-api').include)"
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)

# Clean up path quotes if any
string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")

# Fallback path if node-addon-api command failed
if(NOT NODE_ADDON_API_DIR OR NODE_ADDON_API_DIR STREQUAL "")
    set(NODE_ADDON_API_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../node_modules/node-addon-api")
endif()

# Node addon bindings target (MODULE library as required for node native addons).
# win_delay_load_hook.cc + the /DELAYLOAD below let the addon resolve its N-API
# imports from the hosting executable (electron.exe), not a literal node.exe.
add_library(ilystream_napi MODULE src/napi_bindings.cpp src/win_delay_load_hook.cc)
# Set prefix to empty and suffix to .node for Node.js addon standard
set_target_properties(ilystream_napi PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)

# N-API bindings need node-addon-api header search path and Node.js include directories.
target_include_directories(ilystream_napi PRIVATE ${NODE_ADDON_API_DIR})

# Determine the Electron version the app actually runs so we build the addon
# against matching headers + node.lib. A version mismatch produces a .node that
# crashes on load in the app's Electron, so prefer the installed version and
# only fall back to globbing whatever .electron-gyp happens to contain.
option(ILY_ALLOW_ELECTRON_HEADER_FALLBACK
    "Allow development builds to use mismatched Electron headers" ON)
set(ELECTRON_VERSION "")
set(ELECTRON_PKG_JSON "${CMAKE_CURRENT_SOURCE_DIR}/../../node_modules/electron/package.json")
if(EXISTS "${ELECTRON_PKG_JSON}")
    file(READ "${ELECTRON_PKG_JSON}" ELECTRON_PKG_CONTENT)
    string(JSON ELECTRON_VERSION ERROR_VARIABLE ELECTRON_JSON_ERR GET "${ELECTRON_PKG_CONTENT}" version)
endif()

set(LATEST_NODE_INCLUDES "")
set(NODE_HEADER_ROOTS "")
if(DEFINED ENV{USERPROFILE})
    list(APPEND NODE_HEADER_ROOTS "$ENV{USERPROFILE}")
endif()
if(DEFINED ENV{HOME})
    list(APPEND NODE_HEADER_ROOTS "$ENV{HOME}")
endif()
set(EXACT_HEADER_CANDIDATES "")
set(FALLBACK_HEADER_CANDIDATES "")
foreach(NODE_HOME IN LISTS NODE_HEADER_ROOTS)
    if(ELECTRON_VERSION)
        list(APPEND EXACT_HEADER_CANDIDATES "${NODE_HOME}/.electron-gyp/${ELECTRON_VERSION}/include/node")
    endif()
    list(APPEND FALLBACK_HEADER_CANDIDATES "${NODE_HOME}/.electron-gyp/*/include/node")
    list(APPEND FALLBACK_HEADER_CANDIDATES "${NODE_HOME}/.node-gyp/*/include/node")
endforeach()
foreach(EXACT_HEADER IN LISTS EXACT_HEADER_CANDIDATES)
    if(EXISTS "${EXACT_HEADER}")
        set(LATEST_NODE_INCLUDES "${EXACT_HEADER}")
        break()
    endif()
endforeach()
if(LATEST_NODE_INCLUDES)
    message(STATUS "Using installed Electron ${ELECTRON_VERSION} headers: ${LATEST_NODE_INCLUDES}")
else()
    file(GLOB ELECTRON_GYP_INCLUDES ${FALLBACK_HEADER_CANDIDATES})
    if(ELECTRON_GYP_INCLUDES)
        if(NOT ILY_ALLOW_ELECTRON_HEADER_FALLBACK)
            message(FATAL_ERROR
                "Exact Electron ${ELECTRON_VERSION} headers were not found. "
                "Install matching headers before producing a release artifact, "
                "or enable ILY_ALLOW_ELECTRON_HEADER_FALLBACK only for development.")
        endif()
        list(GET ELECTRON_GYP_INCLUDES 0 LATEST_NODE_INCLUDES)
        message(WARNING "Installed Electron headers not found for '${ELECTRON_VERSION}'; falling back to ${LATEST_NODE_INCLUDES}. The addon may crash on load if versions differ.")
    endif()
endif()

if(LATEST_NODE_INCLUDES)
    target_include_directories(ilystream_napi PRIVATE ${LATEST_NODE_INCLUDES})
else()
    message(WARNING "Could not find Electron/Node.js include headers. NAPI module might fail compilation.")
endif()

# Link ilystream_napi with ilystream_engine
target_link_libraries(ilystream_napi PRIVATE ilystream_engine)

if(WIN32)
    # Native credential protection via the current user's DPAPI profile.
    target_link_libraries(ilystream_napi PRIVATE crypt32)
elseif(APPLE)
    # Generic-password items back the native secure-store adapter on macOS.
    target_link_libraries(ilystream_napi PRIVATE "-framework Security" "-framework CoreFoundation")
elseif(UNIX)
    # libsecret is resolved dynamically at runtime; only dlopen is required at
    # link time, so headless/minimal Linux builds remain installable.
    target_link_libraries(ilystream_napi PRIVATE dl)
endif()

# On Windows, link against node.lib for the SAME Electron version as the headers
# above (import lib must match the host Electron or the addon crashes on load).
if(WIN32)
    set(LATEST_NODE_LIB "")
    if(ELECTRON_VERSION AND EXISTS "$ENV{USERPROFILE}/.electron-gyp/${ELECTRON_VERSION}/x64/node.lib")
        set(LATEST_NODE_LIB "$ENV{USERPROFILE}/.electron-gyp/${ELECTRON_VERSION}/x64/node.lib")
        message(STATUS "Using installed Electron ${ELECTRON_VERSION} node.lib: ${LATEST_NODE_LIB}")
    else()
        file(GLOB NODE_LIBS
            "$ENV{USERPROFILE}/.electron-gyp/*/x64/node.lib"
            "$ENV{USERPROFILE}/.node-gyp/*/x64/node.lib"
            "$ENV{USERPROFILE}/.electron-gyp/*/win-x64/node.lib"
            "$ENV{USERPROFILE}/.node-gyp/*/win-x64/node.lib"
        )
        if(NODE_LIBS)
            if(NOT ILY_ALLOW_ELECTRON_HEADER_FALLBACK)
                message(FATAL_ERROR
                    "Exact Electron ${ELECTRON_VERSION} node.lib was not found. "
                    "Install matching headers before producing a release artifact, "
                    "or enable ILY_ALLOW_ELECTRON_HEADER_FALLBACK only for development.")
            endif()
            list(GET NODE_LIBS 0 LATEST_NODE_LIB)
            message(WARNING "Using fallback node.lib: ${LATEST_NODE_LIB}")
        endif()
    endif()
    if(LATEST_NODE_LIB)
        target_link_libraries(ilystream_napi PRIVATE ${LATEST_NODE_LIB})
    else()
        message(WARNING "Could not find node.lib for Windows linking.")
    endif()
endif()

if(MSVC)
    # Enable BigObj just in case
    target_compile_options(ilystream_napi PRIVATE /bigobj)
    target_compile_definitions(ilystream_napi PRIVATE NAPI_CPP_EXCEPTIONS)
    # Delay-load the host binary and let win_delay_load_hook.cc redirect it to
    # the running process, so the addon loads under electron.exe (not just
    # node.exe). Without this it crashes on require() inside Electron.
    target_link_options(ilystream_napi PRIVATE /DELAYLOAD:node.exe)
    target_link_libraries(ilystream_napi PRIVATE delayimp)
else()
    target_compile_definitions(ilystream_napi PRIVATE NAPI_CPP_EXCEPTIONS)
endif()

# Node addon for Renderer process (Preview Shared Memory Reader)
add_library(ilystream_preview MODULE src/preview_bindings.cpp src/win_delay_load_hook.cc)
set_target_properties(ilystream_preview PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)
target_include_directories(ilystream_preview PRIVATE ${NODE_ADDON_API_DIR} include)
if(LATEST_NODE_INCLUDES)
    target_include_directories(ilystream_preview PRIVATE ${LATEST_NODE_INCLUDES})
endif()
if(WIN32 AND LATEST_NODE_LIB)
    target_link_libraries(ilystream_preview PRIVATE ${LATEST_NODE_LIB})
endif()
if(MSVC)
    target_compile_options(ilystream_preview PRIVATE /bigobj)
    target_compile_definitions(ilystream_preview PRIVATE NAPI_CPP_EXCEPTIONS)
    target_link_options(ilystream_preview PRIVATE /DELAYLOAD:node.exe)
    target_link_libraries(ilystream_preview PRIVATE delayimp)
else()
    target_compile_definitions(ilystream_preview PRIVATE NAPI_CPP_EXCEPTIONS)
endif()

# Native audio core. Capture and shared-ring behavior live here without any
# Node/Electron headers so both the temporary addon and the standalone core host
# call exactly the same implementation.
add_library(ilystream_audio_core STATIC
    ../audio/audio_capture_core.cpp
    ../audio/program_mixer_core.cpp
    ../audio/program_mixer_transport.cpp
    ../audio/master_dsp.cpp
    ../audio/shared_audio_ring.cpp
)
target_include_directories(ilystream_audio_core PUBLIC ../audio)
if(MSVC)
    target_compile_definitions(ilystream_audio_core PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
endif()
if(WIN32)
    target_link_libraries(ilystream_audio_core PRIVATE ole32 avrt advapi32)
endif()

# Dependency-free UI state model. Platform window implementations will render
# this contract separately on Win32, Cocoa, and X11/Wayland without coupling
# the app to a cross-platform widget toolkit.
add_library(ilystream_ui_core STATIC
    ../ui/ui_model.cpp
)
target_include_directories(ilystream_ui_core PUBLIC ../ui)

add_executable(ui_model_test ../ui/ui_model_test.cpp)
target_include_directories(ui_model_test PRIVATE ../ui)
target_link_libraries(ui_model_test PRIVATE
    ilystream_ui_core
    Catch2::Catch2WithMain
)

# Standalone OS-native UI pilot. The executable is intentionally separate from
# Electron so each platform can evolve its window implementation without
# changing the renderer process. It is opt-in during the migration.
set(ILY_NATIVE_UI_SOURCES
    ../ui/native_ui_main.cpp
    ../ui/native_window.cpp
)
if(APPLE)
    enable_language(OBJCXX)
    list(APPEND ILY_NATIVE_UI_SOURCES ../ui/native_window_mac.mm)
endif()
add_executable(ilystream_native_ui ${ILY_NATIVE_UI_SOURCES})
target_include_directories(ilystream_native_ui PRIVATE ../ui)
target_link_libraries(ilystream_native_ui PRIVATE ilystream_ui_core)
if(WIN32)
    target_link_libraries(ilystream_native_ui PRIVATE user32 gdi32)
elseif(APPLE)
    target_link_libraries(ilystream_native_ui PRIVATE "-framework Cocoa")
elseif(UNIX)
    find_package(X11 QUIET)
    if(X11_FOUND)
        target_compile_definitions(ilystream_native_ui PRIVATE ILY_NATIVE_UI_HAS_X11=1)
        target_include_directories(ilystream_native_ui PRIVATE ${X11_INCLUDE_DIR})
        target_link_libraries(ilystream_native_ui PRIVATE ${X11_LIBRARIES})
    else()
        message(STATUS "X11 not found; Linux native UI pilot will be unavailable")
    endif()
endif()

# Temporary Node adapter. It can be removed once every caller uses the native
# host, without changing capture behavior a second time.
add_library(ilystream_audio MODULE ../audio/audio_capture.cpp src/win_delay_load_hook.cc)
set_target_properties(ilystream_audio PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)
target_include_directories(ilystream_audio PRIVATE ${NODE_ADDON_API_DIR} ../audio)
target_link_libraries(ilystream_audio PRIVATE ilystream_audio_core)
if(LATEST_NODE_INCLUDES)
    target_include_directories(ilystream_audio PRIVATE ${LATEST_NODE_INCLUDES})
endif()

# Standalone Windows native core host. Control stays on an authenticated,
# current-user-only named pipe; high-rate media remains in shared memory/GPU
# transports rather than being serialized into JSON.
if(WIN32)
    add_executable(ilystream_core_host
        ../core-host/main.cpp
        ../core-host/protocol.cpp
        ../core-host/mixer-transport-config.cpp
    )
    target_include_directories(ilystream_core_host PRIVATE ../core-host ../audio include)
    target_link_libraries(ilystream_core_host PRIVATE
        ilystream_engine
        ilystream_audio_core
        nlohmann_json::nlohmann_json
        advapi32
        bcrypt
    )
endif()
if(WIN32 AND LATEST_NODE_LIB)
    target_link_libraries(ilystream_audio PRIVATE ${LATEST_NODE_LIB})
endif()
if(MSVC)
    target_compile_options(ilystream_audio PRIVATE /bigobj)
    # miniaudio pulls in windows.h, whose min/max macros otherwise swallow
    # std::min in the SPSC queue.
    target_compile_definitions(ilystream_audio PRIVATE NAPI_CPP_EXCEPTIONS NOMINMAX WIN32_LEAN_AND_MEAN)
    target_link_options(ilystream_audio PRIVATE /DELAYLOAD:node.exe)
    target_link_libraries(ilystream_audio PRIVATE delayimp)
else()
    target_compile_definitions(ilystream_audio PRIVATE NAPI_CPP_EXCEPTIONS)
endif()

# Node/Electron provides the N-API symbols at runtime. ELF loaders generally
# permit unresolved symbols in addon modules, while Apple's linker rejects them
# unless dynamic lookup is explicitly requested. Keep all portable MODULE
# targets loadable by the host without hard-linking to a particular Node ABI.
if(APPLE)
    target_link_options(ilystream_napi PRIVATE "-undefined" "dynamic_lookup")
    target_link_options(ilystream_preview PRIVATE "-undefined" "dynamic_lookup")
    target_link_options(ilystream_audio PRIVATE "-undefined" "dynamic_lookup")
endif()

# Unit tests executable target
add_executable(engine_tests tests/test_main.cpp)
target_link_libraries(engine_tests PRIVATE 
    ilystream_engine 
    Catch2::Catch2WithMain
    nlohmann_json::nlohmann_json
)

# Stress tests executable target
add_executable(renderer_stress_test tests/renderer_stress_test.cpp)
target_include_directories(renderer_stress_test PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../program-transport)
target_link_libraries(renderer_stress_test PRIVATE
    ilystream_engine
    Catch2::Catch2WithMain
    nlohmann_json::nlohmann_json
)
if(WIN32)
    target_link_libraries(renderer_stress_test PRIVATE d3d11 dxgi)
endif()

# Texture pipeline tests executable target
add_executable(texture_pipeline_test tests/texture_pipeline_test.cpp)
target_link_libraries(texture_pipeline_test PRIVATE
    ilystream_engine
    Catch2::Catch2WithMain
    nlohmann_json::nlohmann_json
    bgfx::bgfx
)

add_executable(core_host_protocol_test
    ../core-host/protocol_test.cpp
    ../core-host/protocol.cpp
)
target_include_directories(core_host_protocol_test PRIVATE ../core-host)
target_link_libraries(core_host_protocol_test PRIVATE
    Catch2::Catch2WithMain
    nlohmann_json::nlohmann_json
)

add_executable(master_dsp_protocol_test
    ../core-host/mixer-transport-config.cpp
    ../core-host/mixer-transport-config_test.cpp
)
target_include_directories(master_dsp_protocol_test PRIVATE ../core-host ../audio)
target_link_libraries(master_dsp_protocol_test PRIVATE
    ilystream_audio_core
    Catch2::Catch2WithMain
    nlohmann_json::nlohmann_json
)

add_executable(audio_capture_core_test ../audio/audio_capture_core_test.cpp)
target_include_directories(audio_capture_core_test PRIVATE ../audio)
target_link_libraries(audio_capture_core_test PRIVATE
    ilystream_audio_core
    Catch2::Catch2WithMain
)

add_executable(program_mixer_core_test ../audio/program_mixer_core_test.cpp)
target_include_directories(program_mixer_core_test PRIVATE ../audio)
target_link_libraries(program_mixer_core_test PRIVATE
    ilystream_audio_core
    Catch2::Catch2WithMain
)

add_executable(program_mixer_transport_test ../audio/program_mixer_transport_test.cpp)
target_include_directories(program_mixer_transport_test PRIVATE ../audio)
target_link_libraries(program_mixer_transport_test PRIVATE
    ilystream_audio_core
    Catch2::Catch2WithMain
)

add_executable(master_dsp_test ../audio/master_dsp_test.cpp)
target_include_directories(master_dsp_test PRIVATE ../audio)
target_link_libraries(master_dsp_test PRIVATE
    ilystream_audio_core
    Catch2::Catch2WithMain
)
