#pragma once

#include "SDL2/SDL.h"
#include "SDL2/SDL_image.h"

class GameObject {
public:
    GameObject(const char* texturesheet, SDL_Renderer* renderer, int x, int y);
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
    SDL_Renderer *renderer;
};