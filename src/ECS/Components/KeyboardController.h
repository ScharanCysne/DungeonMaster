#pragma once

#include "Game/Game.h"
#include "ECS/ECS.h"
#include "Transform.h"

class KeyboardController : public Component {
public:
    Transform* transform;

    void init() override;
    void update() override;
};