# src/CMakeLists.txt

# HTTPLib
include(FetchContent)
FetchContent_Declare(
  httplib
  GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
  GIT_TAG v0.14.2  # Use the latest version
)
FetchContent_MakeAvailable(httplib)

# Find all source files
file(GLOB_RECURSE SRC_FILES ${CMAKE_CURRENT_SOURCE_DIR}/*/*.cpp)

# Create the library
add_library(Source ${SRC_FILES})

# Include all subdirectories
target_include_directories(Source PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${PROJECT_SOURCE_DIR}/include
)

# Add the main executable
add_executable(main main.cpp)

# Link libraries to the executable
target_link_libraries(
    main PRIVATE Source
)

# Specify include directories for the middleware target
target_include_directories(
    main PRIVATE ${PROJECT_SOURCE_DIR}/include
)
