cmake_minimum_required(VERSION 3.20)

project(kzys_media_layer LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(kzys_media_layer
    src/capacity_model.cpp
    src/join_ticket.cpp
    src/rtp.cpp
    src/rtcp.cpp
    src/stateless_planner.cpp
    src/session.cpp
    src/room_allocator.cpp
)

target_include_directories(kzys_media_layer
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_options(kzys_media_layer PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/W4 /permissive->
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-Wall -Wextra -Wpedantic>
)

add_executable(kzys_media_layer_demo
    src/main.cpp
)

target_link_libraries(kzys_media_layer_demo PRIVATE kzys_media_layer)
target_link_options(kzys_media_layer_demo PRIVATE
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-static-libstdc++ -static-libgcc>
)

add_executable(kzys_media_layer_stress
    src/stress_sim.cpp
)

target_link_libraries(kzys_media_layer_stress PRIVATE kzys_media_layer)
target_link_options(kzys_media_layer_stress PRIVATE
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-static-libstdc++ -static-libgcc>
)
