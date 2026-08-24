cmake_minimum_required(VERSION 3.28...3.31)

file(READ "${CMAKE_CURRENT_SOURCE_DIR}/buildspec.json" buildspec)
string(JSON plugin_name GET "${buildspec}" name)
string(JSON plugin_version GET "${buildspec}" version)
string(JSON plugin_display_name GET "${buildspec}" displayName)
string(JSON plugin_author GET "${buildspec}" author)

project(${plugin_name} VERSION ${plugin_version} LANGUAGES CXX)

if(NOT WIN32 OR NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
  message(FATAL_ERROR "${plugin_display_name} currently supports only Windows x64.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_MAP_IMPORTED_CONFIG_RELWITHDEBINFO Release RelWithDebInfo)

find_package(libobs CONFIG REQUIRED)
find_package(obs-frontend-api CONFIG REQUIRED)
find_package(Qt6 6.11 COMPONENTS Core Network Widgets REQUIRED)

add_library(${PROJECT_NAME} MODULE)

target_include_directories(${PROJECT_NAME} PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/..")

configure_file(cmake/windows/version.rc.in "${CMAKE_CURRENT_BINARY_DIR}/version.rc" @ONLY)
configure_file(cmake/obs-plugin-package.json.in "${CMAKE_CURRENT_BINARY_DIR}/obs-plugin-package.json" @ONLY)

target_sources(
  ${PROJECT_NAME}
  PRIVATE
    src/bridge-credentials.cpp
    src/bridge-credentials.hpp
    src/bridge-client.cpp
    src/bridge-client.hpp
    src/bridge-peer-verifier.cpp
    src/bridge-peer-verifier.hpp
    src/bridge-program-transport.cpp
    src/bridge-program-transport.hpp
    src/bridge-protocol.hpp
    src/program-transport-descriptor.hpp
    src/dock-fullscreen-controller.cpp
    src/dock-fullscreen-controller.hpp
    src/obs-state.cpp
    src/obs-state.hpp
    src/plugin-main.cpp
    src/program-audio-ring-reader.cpp
    src/program-audio-ring-reader.hpp
    src/program-source.cpp
    src/program-source.hpp
    src/program-transport.cpp
    src/program-transport.hpp
    src/program-video-control-reader.cpp
    src/program-video-control-reader.hpp
    src/unified-chat-dock-locator.cpp
    src/unified-chat-dock-locator.hpp
    src/workspace-dock.cpp
    src/workspace-dock.hpp
    "${CMAKE_CURRENT_BINARY_DIR}/version.rc"
)

target_compile_definitions(
  ${PROJECT_NAME}
  PRIVATE
    NOMINMAX
    WIN32_LEAN_AND_MEAN
    PLUGIN_NAME="${plugin_name}"
    PLUGIN_VERSION="${PROJECT_VERSION}"
)

target_compile_options(${PROJECT_NAME} PRIVATE /permissive- /W4 /wd4100 /wd4251)

target_link_libraries(
  ${PROJECT_NAME}
  PRIVATE
    OBS::libobs
    OBS::obs-frontend-api
    Qt6::Core
    Qt6::Network
    Qt6::Widgets
    advapi32
    d3d11
    dxgi
    shell32
    ole32
)

set_target_properties(
  ${PROJECT_NAME}
  PROPERTIES
    AUTOMOC ON
    AUTOUIC ON
    AUTORCC ON
    PREFIX ""
    OUTPUT_NAME "${plugin_name}"
)

install(
  TARGETS ${PROJECT_NAME}
  RUNTIME DESTINATION "obs-plugins/64bit"
  LIBRARY DESTINATION "obs-plugins/64bit"
)
install(
  FILES "$<TARGET_PDB_FILE:${PROJECT_NAME}>"
  CONFIGURATIONS Debug Release RelWithDebInfo
  DESTINATION "obs-plugins/64bit"
  OPTIONAL
)
install(DIRECTORY data/ DESTINATION "data/obs-plugins/${plugin_name}")
install(
  FILES
    "${CMAKE_CURRENT_BINARY_DIR}/obs-plugin-package.json"
    LICENSE
    README.md
  DESTINATION "."
)

include(CTest)
if(BUILD_TESTING)
  add_executable(
    ${PROJECT_NAME}-protocol-test
    tests/bridge-protocol-test.cpp
    src/bridge-credentials.cpp
    src/bridge-credentials.hpp
    src/bridge-peer-verifier.cpp
    src/bridge-peer-verifier.hpp
  )
  target_compile_features(${PROJECT_NAME}-protocol-test PRIVATE cxx_std_17)
  target_link_libraries(${PROJECT_NAME}-protocol-test PRIVATE Qt6::Core Qt6::Network advapi32 shell32 ole32)
  add_test(NAME ${PROJECT_NAME}.bridge-protocol COMMAND ${PROJECT_NAME}-protocol-test)

  add_executable(
    ${PROJECT_NAME}-bridge-client-test
    tests/bridge-client-test.cpp
    src/bridge-client.cpp
    src/bridge-client.hpp
    src/bridge-credentials.cpp
    src/bridge-credentials.hpp
    src/bridge-peer-verifier.cpp
    src/bridge-peer-verifier.hpp
    src/bridge-protocol.hpp
    src/program-transport-descriptor.hpp
  )
  get_target_property(libobs_include_directories OBS::libobs INTERFACE_INCLUDE_DIRECTORIES)
  target_include_directories(${PROJECT_NAME}-bridge-client-test PRIVATE ${libobs_include_directories})
  target_compile_features(${PROJECT_NAME}-bridge-client-test PRIVATE cxx_std_17)
  target_compile_definitions(
    ${PROJECT_NAME}-bridge-client-test
    PRIVATE
      HAVE_OBSCONFIG_H
      PLUGIN_VERSION="${PROJECT_VERSION}-test"
  )
  target_link_libraries(
    ${PROJECT_NAME}-bridge-client-test
    PRIVATE Qt6::Core Qt6::Network advapi32 shell32 ole32
  )
  add_test(NAME ${PROJECT_NAME}.bridge-client COMMAND ${PROJECT_NAME}-bridge-client-test)

  add_executable(
    ${PROJECT_NAME}-dock-test
    tests/dock-fullscreen-test.cpp
    src/dock-fullscreen-controller.cpp
    src/dock-fullscreen-controller.hpp
    src/unified-chat-dock-locator.cpp
    src/unified-chat-dock-locator.hpp
  )
  target_compile_features(${PROJECT_NAME}-dock-test PRIVATE cxx_std_17)
  target_link_libraries(${PROJECT_NAME}-dock-test PRIVATE Qt6::Core Qt6::Widgets)
  if(TARGET Qt6::QWindowsIntegrationPlugin)
    add_custom_command(
      TARGET ${PROJECT_NAME}-dock-test
      POST_BUILD
      COMMAND
        ${CMAKE_COMMAND} -E make_directory
        "$<TARGET_FILE_DIR:${PROJECT_NAME}-dock-test>/platforms"
      COMMAND
        ${CMAKE_COMMAND} -E copy_if_different
        "$<TARGET_FILE:Qt6::QWindowsIntegrationPlugin>"
        "$<TARGET_FILE_DIR:${PROJECT_NAME}-dock-test>/platforms/$<TARGET_FILE_NAME:Qt6::QWindowsIntegrationPlugin>"
      VERBATIM
    )
  endif()
  add_test(NAME ${PROJECT_NAME}.dock-fullscreen COMMAND ${PROJECT_NAME}-dock-test)

  add_executable(
    ${PROJECT_NAME}-program-transport-test
    tests/program-transport-test.cpp
    src/program-transport.cpp
    src/program-transport.hpp
  )
  target_compile_features(${PROJECT_NAME}-program-transport-test PRIVATE cxx_std_17)
  target_include_directories(${PROJECT_NAME}-program-transport-test PRIVATE src)
  add_test(NAME ${PROJECT_NAME}.program-transport COMMAND ${PROJECT_NAME}-program-transport-test)

  add_executable(
    ${PROJECT_NAME}-program-audio-ring-reader-test
    tests/program-audio-ring-reader-test.cpp
    src/program-audio-ring-reader.cpp
    src/program-audio-ring-reader.hpp
    src/program-transport.hpp
  )
  target_compile_features(${PROJECT_NAME}-program-audio-ring-reader-test PRIVATE cxx_std_17)
  target_include_directories(
    ${PROJECT_NAME}-program-audio-ring-reader-test
    PRIVATE
      src
      "${CMAKE_CURRENT_SOURCE_DIR}/.."
  )
  add_test(NAME ${PROJECT_NAME}.program-audio-ring-reader COMMAND ${PROJECT_NAME}-program-audio-ring-reader-test)

  add_executable(
    ${PROJECT_NAME}-program-video-control-reader-test
    tests/program-video-control-reader-test.cpp
    src/program-video-control-reader.cpp
    src/program-video-control-reader.hpp
  )
  target_compile_features(${PROJECT_NAME}-program-video-control-reader-test PRIVATE cxx_std_17)
  target_include_directories(
    ${PROJECT_NAME}-program-video-control-reader-test
    PRIVATE
      src
      "${CMAKE_CURRENT_SOURCE_DIR}/.."
  )
  add_test(NAME ${PROJECT_NAME}.program-video-control-reader COMMAND ${PROJECT_NAME}-program-video-control-reader-test)
endif()
