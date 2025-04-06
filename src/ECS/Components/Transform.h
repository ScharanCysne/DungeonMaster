#pragma once

#include "ECS/ECS.h"
#include "Vector2D/Vector2D.h"

class Transform : public Component {
public:
    Transform();
    Transform(float x, float y);

    Vector2D position;

    void init() override;
    void update() override;
};