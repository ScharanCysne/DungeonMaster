b:
	cd build && cmake .. && cmake --build .

run:
	cp build/src/main main && ./main