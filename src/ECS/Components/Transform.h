#pragma once

#include "ECS/ECS.h"
#include "Vector2D/Vector2D.h"

class Transform : public Component {
public:
    Transform();
    Transform(float x, float y);
    Transform(float x, float y, int h, int w, int s);

    Vector2D position;
    Vector2D velocity;
    int speed;
    int height;
    int width;
    int scale;

    void init() override;
    void update() override;
};