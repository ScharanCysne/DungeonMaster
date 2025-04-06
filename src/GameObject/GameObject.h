#pragma once

#include "SDL2/SDL.h"
#include "SDL2/SDL_image.h"

#include "Game/Game.h"

class GameObject {
public:
    GameObject(const char* texturesheet, int x, int y);
    ~GameObject();

    void Update();
    void Render();
    void Clean();

private:
    int xpos;
    int ypos;

    SDL_Texture *objTexture;
    SDL_Rect srcRect;
    SDL_Rect destRect;
};