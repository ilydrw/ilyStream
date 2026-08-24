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
    src/capture/dxgi_capture.cpp
    src/capture/mf_camera_capture.cpp
)

# Shared engine library
add_library(ilystream_engine SHARED ${ENGINE_SOURCES})
target_compile_definitions(ilystream_engine PRIVATE ILY_ENGINE_BUILD_DLL)
target_link_libraries(ilystream_engine PRIVATE nlohmann_json::nlohmann_json)
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
set(ELECTRON_VERSION "")
set(ELECTRON_PKG_JSON "${CMAKE_CURRENT_SOURCE_DIR}/../../node_modules/electron/package.json")
if(EXISTS "${ELECTRON_PKG_JSON}")
    file(READ "${ELECTRON_PKG_JSON}" ELECTRON_PKG_CONTENT)
    string(JSON ELECTRON_VERSION ERROR_VARIABLE ELECTRON_JSON_ERR GET "${ELECTRON_PKG_CONTENT}" version)
endif()

set(LATEST_NODE_INCLUDES "")
if(ELECTRON_VERSION AND EXISTS "$ENV{USERPROFILE}/.electron-gyp/${ELECTRON_VERSION}/include/node")
    set(LATEST_NODE_INCLUDES "$ENV{USERPROFILE}/.electron-gyp/${ELECTRON_VERSION}/include/node")
    message(STATUS "Using installed Electron ${ELECTRON_VERSION} headers: ${LATEST_NODE_INCLUDES}")
else()
    file(GLOB ELECTRON_GYP_INCLUDES
        "$ENV{USERPROFILE}/.electron-gyp/*/include/node"
        "$ENV{USERPROFILE}/.node-gyp/*/include/node"
    )
    if(ELECTRON_GYP_INCLUDES)
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

# Native audio capture addon. Independent of the render engine — it shares this
# build only so there is one native toolchain to maintain, not two.
add_library(ilystream_audio MODULE ../audio/audio_capture.cpp src/win_delay_load_hook.cc)
set_target_properties(ilystream_audio PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)
target_include_directories(ilystream_audio PRIVATE ${NODE_ADDON_API_DIR} ../audio)
if(LATEST_NODE_INCLUDES)
    target_include_directories(ilystream_audio PRIVATE ${LATEST_NODE_INCLUDES})
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
