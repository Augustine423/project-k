cmake_minimum_required(VERSION 3.16)
project(kzys-media-core CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(CURL REQUIRED)
find_package(Threads REQUIRED)

add_executable(media-core src/main.cpp)
target_include_directories(media-core PRIVATE ${CURL_INCLUDE_DIRS})
target_link_libraries(media-core PRIVATE CURL::libcurl hiredis Threads::Threads)

install(TARGETS media-core RUNTIME DESTINATION bin)
