#include "Transform.h"

void Transform::init() {}

void Transform::update() {
    xPos++;
    yPos++;
}

void Transform::setPos(int x, int y) {
    xPos = x;
    yPos = y;
}