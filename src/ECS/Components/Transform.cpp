#include "Transform.h"

Transform::Transform() {
    position.x = 0.0f;
    position.y = 0.0f;
}

Transform::Transform(float x, float y) {
    position.x = x;
    position.y = y;
}

Transform::Transform(float x, float y, int h, int w, int s) {
    position.x = x;
    position.y = y;
    height = h;
    width = w;
    scale = s;
}

void Transform::init() {
    velocity.x = 0.0f;
    velocity.y = 0.0f;

    speed = 5;
    height = 64;
    width = 64;
    scale = 1;
}

void Transform::update() {
    position.x += velocity.x * speed;
    position.y += velocity.y * speed;
}
