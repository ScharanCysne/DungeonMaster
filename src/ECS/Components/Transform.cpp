#include "Transform.h"

Transform::Transform() {
    position.x = 0.0f;
    position.y = 0.0f;
}

Transform::Transform(float x, float y) {
    position.x = x;
    position.y = y;
}

void Transform::init() {
    velocity.x = 0.0f;
    velocity.y = 0.0f;
    speed = 5;
}

void Transform::update() {
    position.x += velocity.x * speed;
    position.y += velocity.y * speed;
}
