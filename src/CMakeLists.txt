# src/CMakeLists.txt

# Recursively collect all .cpp files in src/
file(GLOB_RECURSE SOURCES CONFIGURE_DEPENDS *.cpp)

# Define the executable
add_executable(dungeon_master ${SOURCES})

# Link SDL2
target_link_libraries(dungeon_master
    ${SDL2_LIBRARIES}
    ${SDL2_IMAGE_LIBRARIES}
    ${SDL2_TTF_LIBRARIES}
)

# Add include directories
target_include_directories(dungeon_master
    PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}
)