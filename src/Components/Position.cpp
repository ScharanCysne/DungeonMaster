#include "Position.h"

void Position::init() {
    xPos = 0;
    yPos = 0;
}

void Position::update() {
    xPos++;
    yPos++;
}

void Position::setPos(int x, int y) {
    xPos = x;
    yPos = y;
}