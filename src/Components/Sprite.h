#pragma once

#include "Components.h"
#include "SDL2/SDL.h"


class Sprite : public Component {
public:
    Sprite() = default;
    Sprite(const char* path);

    void init() override;
    void draw() override;
    void update() override;

private:
    Position* position;
    SDL_Texture* texture;

    SDL_Rect srcRect;
    SDL_Rect destRect;
};