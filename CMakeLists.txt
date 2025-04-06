# Top-level CMakeLists.txt

cmake_minimum_required(VERSION 3.15)
project(dungeon_master VERSION 1.0 LANGUAGES CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED YES)
set(CMAKE_CXX_EXTENSIONS NO)

# Find SDL2 package
find_package(SDL2 REQUIRED)
find_package(SDL2_image REQUIRED)
find_package(SDL2_ttf REQUIRED)

include_directories(
    ${SDL2_INCLUDE_DIRS}
    ${SDL2_IMAGE_INCLUDE_DIRS}
    ${SDL2_TTF_INCLUDE_DIRS}
    /opt/homebrew/Cellar
    /opt/homebrew/include
    /opt/homebrew/include/SDL2
)

link_directories(
    /opt/homebrew/lib
)

# Add subdirectories
add_subdirectory(src)
