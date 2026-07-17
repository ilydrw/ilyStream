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

# Shared engine library
add_library(ilystream_engine SHARED ${ENGINE_SOURCES})
target_compile_definitions(ilystream_engine PRIVATE ILY_ENGINE_BUILD_DLL)
target_link_libraries(ilystream_engine PRIVATE nlohmann_json::nlohmann_json)

# Precompiled, committed sprite-shader bytecode headers (one dir per backend:
# dx11/ spv/ glsl/ essl/ mtl/). shader_loader.cpp includes these by backend
# subdir, e.g. #include "dx11/vs_sprite.sc.bin.h". Regenerate the contents with
# shaders/compile_shaders.ps1; no shaderc is needed for a normal engine build.
target_include_directories(ilystream_engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/shaders/generated)

# If using bgfx, we locate and link it
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

# Node addon bindings target (MODULE library as required for node native addons)
add_library(ilystream_napi MODULE src/napi_bindings.cpp)
# Set prefix to empty and suffix to .node for Node.js addon standard
set_target_properties(ilystream_napi PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)

# N-API bindings need node-addon-api header search path and Node.js include directories.
target_include_directories(ilystream_napi PRIVATE ${NODE_ADDON_API_DIR})

# Dynamically locate Electron or Node headers on the developer machine
file(GLOB ELECTRON_GYP_INCLUDES
    "$ENV{USERPROFILE}/.electron-gyp/*/include/node"
    "$ENV{USERPROFILE}/.node-gyp/*/include/node"
)

if(ELECTRON_GYP_INCLUDES)
    list(GET ELECTRON_GYP_INCLUDES 0 LATEST_NODE_INCLUDES)
    message(STATUS "Found Node/Electron headers: ${LATEST_NODE_INCLUDES}")
    target_include_directories(ilystream_napi PRIVATE ${LATEST_NODE_INCLUDES})
else()
    message(WARNING "Could not find Electron/Node.js include headers. NAPI module might fail compilation.")
endif()

# Link ilystream_napi with ilystream_engine
target_link_libraries(ilystream_napi PRIVATE ilystream_engine)

# On Windows, we need to link against node.lib from electron-gyp/node-gyp
if(WIN32)
    file(GLOB NODE_LIBS
        "$ENV{USERPROFILE}/.electron-gyp/*/x64/node.lib"
        "$ENV{USERPROFILE}/.node-gyp/*/x64/node.lib"
        "$ENV{USERPROFILE}/.electron-gyp/*/win-x64/node.lib"
        "$ENV{USERPROFILE}/.node-gyp/*/win-x64/node.lib"
    )
    if(NODE_LIBS)
        list(GET NODE_LIBS 0 LATEST_NODE_LIB)
        message(STATUS "Found node.lib: ${LATEST_NODE_LIB}")
        target_link_libraries(ilystream_napi PRIVATE ${LATEST_NODE_LIB})
    else()
        message(WARNING "Could not find node.lib for Windows linking.")
    endif()
endif()

if(MSVC)
    # Enable BigObj just in case
    target_compile_options(ilystream_napi PRIVATE /bigobj)
    # Node native modules on Windows don't link node.lib directly if they use N-API.
    target_compile_definitions(ilystream_napi PRIVATE NAPI_CPP_EXCEPTIONS)
else()
    target_compile_definitions(ilystream_napi PRIVATE NAPI_CPP_EXCEPTIONS)
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
target_link_libraries(renderer_stress_test PRIVATE
    ilystream_engine
    Catch2::Catch2WithMain
    nlohmann_json::nlohmann_json
)

# Texture pipeline tests executable target
add_executable(texture_pipeline_test tests/texture_pipeline_test.cpp)
target_link_libraries(texture_pipeline_test PRIVATE
    ilystream_engine
    Catch2::Catch2WithMain
    nlohmann_json::nlohmann_json
    bgfx::bgfx
)
