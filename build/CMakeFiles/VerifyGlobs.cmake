# CMAKE generated file: DO NOT EDIT!
# Generated by CMake Version 3.29
cmake_policy(SET CMP0009 NEW)

# SOURCES at src/CMakeLists.txt:4 (file)
file(GLOB_RECURSE NEW_GLOB LIST_DIRECTORIES false "/Users/dungeon_master/src/*.cpp")
set(OLD_GLOB
  "/Users/dungeon_master/src/Game/Game.cpp"
  "/Users/dungeon_master/src/Player/Player.cpp"
  "/Users/dungeon_master/src/TextureManager/TextureManager.cpp"
  "/Users/dungeon_master/src/main.cpp"
  )
if(NOT "${NEW_GLOB}" STREQUAL "${OLD_GLOB}")
  message("-- GLOB mismatch!")
  file(TOUCH_NOCREATE "/Users/dungeon_master/build/CMakeFiles/cmake.verify_globs")
endif()
