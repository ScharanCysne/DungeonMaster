#pragma once

#include <string>
#include "SDL2/SDL.h"
#include "ECS/ECS.h"
#include "Transform.h"

class Collider : public Component {
public:
    Collider();
    Collider(const char* tag);

    std::string tag;

    SDL_Rect collider;

    Transform* transform;

    void init() override;
    void update() override;
};