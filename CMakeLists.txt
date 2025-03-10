# Top-level CMakeLists.txt

cmake_minimum_required(VERSION 3.15)
project(project_name VERSION 1.0 LANGUAGES CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED YES)
set(CMAKE_CXX_EXTENSIONS NO)

# Find Boost package
find_package(Boost REQUIRED)
include_directories(${Boost_INCLUDE_DIRS})

# Add subdirectories
add_subdirectory(src)
