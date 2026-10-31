cmake_minimum_required(VERSION 3.20)
project(easyphoneNative VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(wxWidgets 3.2 REQUIRED COMPONENTS core base)
find_package(nlohmann_json 3.2.0 REQUIRED)
include(${wxWidgets_USE_FILE})

add_executable(easyphone-native src/main.cpp)
target_link_libraries(easyphone-native PRIVATE
  ${wxWidgets_LIBRARIES}
  nlohmann_json::nlohmann_json
  ${CMAKE_DL_LIBS})
if(MSVC)
  target_compile_options(easyphone-native PRIVATE /W4 /permissive-)
  set_target_properties(easyphone-native PROPERTIES WIN32_EXECUTABLE TRUE)
else()
  target_compile_options(easyphone-native PRIVATE -Wall -Wextra -Wpedantic)
endif()

set(EASYPHONE_ASSET_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../ui/assets")
add_custom_command(TARGET easyphone-native POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:easyphone-native>/assets"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${EASYPHONE_ASSET_DIR}/easyphone-logo-negative.png"
    "$<TARGET_FILE_DIR:easyphone-native>/assets/easyphone-logo-negative.png"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${EASYPHONE_ASSET_DIR}/easyphone-icon.png"
    "$<TARGET_FILE_DIR:easyphone-native>/assets/easyphone-icon.png")

# O pacote Linux inclui as bibliotecas wxGTK usadas pelo launcher local.
# Windows e macOS usam os runtimes fornecidos pelos respectivos toolchains/pacotes.
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  find_library(WX_CORE_RUNTIME NAMES wx_gtk3u_core-3.2 REQUIRED)
  find_library(WX_BASE_RUNTIME NAMES wx_baseu-3.2 REQUIRED)
  find_file(PCRE2_32_RUNTIME NAMES libpcre2-32.so.0
    PATHS "/usr/lib/${CMAKE_LIBRARY_ARCHITECTURE}" "/lib/${CMAKE_LIBRARY_ARCHITECTURE}"
    REQUIRED)
  add_custom_command(TARGET easyphone-native POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:easyphone-native>/runtime-lib"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WX_CORE_RUNTIME}"
      "$<TARGET_FILE_DIR:easyphone-native>/runtime-lib/libwx_gtk3u_core-3.2.so.0"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WX_BASE_RUNTIME}"
      "$<TARGET_FILE_DIR:easyphone-native>/runtime-lib/libwx_baseu-3.2.so.0"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different "${PCRE2_32_RUNTIME}"
      "$<TARGET_FILE_DIR:easyphone-native>/runtime-lib/libpcre2-32.so.0")
endif()

install(TARGETS easyphone-native RUNTIME DESTINATION bin)
install(FILES
  "${EASYPHONE_ASSET_DIR}/easyphone-logo-negative.png"
  "${EASYPHONE_ASSET_DIR}/easyphone-icon.png"
  DESTINATION bin/assets)
