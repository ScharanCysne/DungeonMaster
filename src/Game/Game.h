#pragma once

#include <iostream>
#include <vector>
#include "SDL2/SDL.h"
#include "SDL2/SDL_image.h"

class Collider;

class Game {
public:
    Game();
    ~Game();

    void init(const char* title, int xpos, int ypos, int width, int height, bool fullscreen);

    void handleEvents();
    void update();
    void render();
    void clear();
    bool running();

    static SDL_Renderer* renderer;
    static SDL_Event event;
    static std::vector<Collider*> colliders;

private:
    bool isRunning;
    SDL_Window *window;
};
