#pragma once

#include <string>
#include "ECS/ECS.h"
#include "Transform.h"
#include "Sprite.h"
#include "SDL2/SDL.h"

class Tile : public Component {
public:
    Tile() = default;
    Tile(int x, int y, int w, int h, int id);

    void init() override;
    void update() override;
    void draw() override;

    Transform* transform;
    Sprite* sprite;

    int tileId;
    std::string path;
    SDL_Rect tileRect;
};

