# CMAKE generated file: DO NOT EDIT!
# Generated by "Unix Makefiles" Generator, CMake Version 3.29

# Delete rule output on recipe failure.
.DELETE_ON_ERROR:

#=============================================================================
# Special targets provided by cmake.

# Disable implicit rules so canonical targets will work.
.SUFFIXES:

# Disable VCS-based implicit rules.
% : %,v

# Disable VCS-based implicit rules.
% : RCS/%

# Disable VCS-based implicit rules.
% : RCS/%,v

# Disable VCS-based implicit rules.
% : SCCS/s.%

# Disable VCS-based implicit rules.
% : s.%

.SUFFIXES: .hpux_make_needs_suffix_list

# Command-line flag to silence nested $(MAKE).
$(VERBOSE)MAKESILENT = -s

#Suppress display of executed commands.
$(VERBOSE).SILENT:

# A target that is always out of date.
cmake_force:
.PHONY : cmake_force

#=============================================================================
# Set environment variables for the build.

# The shell in which to execute make rules.
SHELL = /bin/sh

# The CMake executable.
CMAKE_COMMAND = /opt/homebrew/Cellar/cmake/3.29.3/bin/cmake

# The command to remove a file.
RM = /opt/homebrew/Cellar/cmake/3.29.3/bin/cmake -E rm -f

# Escaping for special characters.
EQUALS = =

# The top-level source directory on which CMake was run.
CMAKE_SOURCE_DIR = /Users/dungeon_master

# The top-level build directory on which CMake was run.
CMAKE_BINARY_DIR = /Users/dungeon_master/build

# Include any dependencies generated for this target.
include src/CMakeFiles/dungeon_master.dir/depend.make
# Include any dependencies generated by the compiler for this target.
include src/CMakeFiles/dungeon_master.dir/compiler_depend.make

# Include the progress variables for this target.
include src/CMakeFiles/dungeon_master.dir/progress.make

# Include the compile flags for this target's objects.
include src/CMakeFiles/dungeon_master.dir/flags.make

src/CMakeFiles/dungeon_master.dir/Game/Game.cpp.o: src/CMakeFiles/dungeon_master.dir/flags.make
src/CMakeFiles/dungeon_master.dir/Game/Game.cpp.o: /Users/dungeon_master/src/Game/Game.cpp
src/CMakeFiles/dungeon_master.dir/Game/Game.cpp.o: src/CMakeFiles/dungeon_master.dir/compiler_depend.ts
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green --progress-dir=/Users/dungeon_master/build/CMakeFiles --progress-num=$(CMAKE_PROGRESS_1) "Building CXX object src/CMakeFiles/dungeon_master.dir/Game/Game.cpp.o"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -MD -MT src/CMakeFiles/dungeon_master.dir/Game/Game.cpp.o -MF CMakeFiles/dungeon_master.dir/Game/Game.cpp.o.d -o CMakeFiles/dungeon_master.dir/Game/Game.cpp.o -c /Users/dungeon_master/src/Game/Game.cpp

src/CMakeFiles/dungeon_master.dir/Game/Game.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green "Preprocessing CXX source to CMakeFiles/dungeon_master.dir/Game/Game.cpp.i"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E /Users/dungeon_master/src/Game/Game.cpp > CMakeFiles/dungeon_master.dir/Game/Game.cpp.i

src/CMakeFiles/dungeon_master.dir/Game/Game.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green "Compiling CXX source to assembly CMakeFiles/dungeon_master.dir/Game/Game.cpp.s"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S /Users/dungeon_master/src/Game/Game.cpp -o CMakeFiles/dungeon_master.dir/Game/Game.cpp.s

src/CMakeFiles/dungeon_master.dir/Player/Player.cpp.o: src/CMakeFiles/dungeon_master.dir/flags.make
src/CMakeFiles/dungeon_master.dir/Player/Player.cpp.o: /Users/dungeon_master/src/Player/Player.cpp
src/CMakeFiles/dungeon_master.dir/Player/Player.cpp.o: src/CMakeFiles/dungeon_master.dir/compiler_depend.ts
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green --progress-dir=/Users/dungeon_master/build/CMakeFiles --progress-num=$(CMAKE_PROGRESS_2) "Building CXX object src/CMakeFiles/dungeon_master.dir/Player/Player.cpp.o"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -MD -MT src/CMakeFiles/dungeon_master.dir/Player/Player.cpp.o -MF CMakeFiles/dungeon_master.dir/Player/Player.cpp.o.d -o CMakeFiles/dungeon_master.dir/Player/Player.cpp.o -c /Users/dungeon_master/src/Player/Player.cpp

src/CMakeFiles/dungeon_master.dir/Player/Player.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green "Preprocessing CXX source to CMakeFiles/dungeon_master.dir/Player/Player.cpp.i"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E /Users/dungeon_master/src/Player/Player.cpp > CMakeFiles/dungeon_master.dir/Player/Player.cpp.i

src/CMakeFiles/dungeon_master.dir/Player/Player.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green "Compiling CXX source to assembly CMakeFiles/dungeon_master.dir/Player/Player.cpp.s"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S /Users/dungeon_master/src/Player/Player.cpp -o CMakeFiles/dungeon_master.dir/Player/Player.cpp.s

src/CMakeFiles/dungeon_master.dir/main.cpp.o: src/CMakeFiles/dungeon_master.dir/flags.make
src/CMakeFiles/dungeon_master.dir/main.cpp.o: /Users/dungeon_master/src/main.cpp
src/CMakeFiles/dungeon_master.dir/main.cpp.o: src/CMakeFiles/dungeon_master.dir/compiler_depend.ts
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green --progress-dir=/Users/dungeon_master/build/CMakeFiles --progress-num=$(CMAKE_PROGRESS_3) "Building CXX object src/CMakeFiles/dungeon_master.dir/main.cpp.o"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -MD -MT src/CMakeFiles/dungeon_master.dir/main.cpp.o -MF CMakeFiles/dungeon_master.dir/main.cpp.o.d -o CMakeFiles/dungeon_master.dir/main.cpp.o -c /Users/dungeon_master/src/main.cpp

src/CMakeFiles/dungeon_master.dir/main.cpp.i: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green "Preprocessing CXX source to CMakeFiles/dungeon_master.dir/main.cpp.i"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -E /Users/dungeon_master/src/main.cpp > CMakeFiles/dungeon_master.dir/main.cpp.i

src/CMakeFiles/dungeon_master.dir/main.cpp.s: cmake_force
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green "Compiling CXX source to assembly CMakeFiles/dungeon_master.dir/main.cpp.s"
	cd /Users/dungeon_master/build/src && /Library/Developer/CommandLineTools/usr/bin/c++ $(CXX_DEFINES) $(CXX_INCLUDES) $(CXX_FLAGS) -S /Users/dungeon_master/src/main.cpp -o CMakeFiles/dungeon_master.dir/main.cpp.s

# Object files for target dungeon_master
dungeon_master_OBJECTS = \
"CMakeFiles/dungeon_master.dir/Game/Game.cpp.o" \
"CMakeFiles/dungeon_master.dir/Player/Player.cpp.o" \
"CMakeFiles/dungeon_master.dir/main.cpp.o"

# External object files for target dungeon_master
dungeon_master_EXTERNAL_OBJECTS =

src/dungeon_master: src/CMakeFiles/dungeon_master.dir/Game/Game.cpp.o
src/dungeon_master: src/CMakeFiles/dungeon_master.dir/Player/Player.cpp.o
src/dungeon_master: src/CMakeFiles/dungeon_master.dir/main.cpp.o
src/dungeon_master: src/CMakeFiles/dungeon_master.dir/build.make
src/dungeon_master: /opt/homebrew/Cellar/sdl2/2.32.4/lib/libSDL2.dylib
src/dungeon_master: src/CMakeFiles/dungeon_master.dir/link.txt
	@$(CMAKE_COMMAND) -E cmake_echo_color "--switch=$(COLOR)" --green --bold --progress-dir=/Users/dungeon_master/build/CMakeFiles --progress-num=$(CMAKE_PROGRESS_4) "Linking CXX executable dungeon_master"
	cd /Users/dungeon_master/build/src && $(CMAKE_COMMAND) -E cmake_link_script CMakeFiles/dungeon_master.dir/link.txt --verbose=$(VERBOSE)

# Rule to build all files generated by this target.
src/CMakeFiles/dungeon_master.dir/build: src/dungeon_master
.PHONY : src/CMakeFiles/dungeon_master.dir/build

src/CMakeFiles/dungeon_master.dir/clean:
	cd /Users/dungeon_master/build/src && $(CMAKE_COMMAND) -P CMakeFiles/dungeon_master.dir/cmake_clean.cmake
.PHONY : src/CMakeFiles/dungeon_master.dir/clean

src/CMakeFiles/dungeon_master.dir/depend:
	cd /Users/dungeon_master/build && $(CMAKE_COMMAND) -E cmake_depends "Unix Makefiles" /Users/dungeon_master /Users/dungeon_master/src /Users/dungeon_master/build /Users/dungeon_master/build/src /Users/dungeon_master/build/src/CMakeFiles/dungeon_master.dir/DependInfo.cmake "--color=$(COLOR)"
.PHONY : src/CMakeFiles/dungeon_master.dir/depend

