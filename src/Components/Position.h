#pragma once

#include "ECS/ECS.h"

class Position : public Component {
public:
    Position() = default;
    Position(int x, int y) : xPos(x), yPos(y) {}

    void init() override;
    void update() override;

    int x() const { return xPos; }
    void x(int x) { xPos = x; }
    int y() const { return yPos; }
    void y(int y) { yPos = y; }
    void setPos(int x, int y);

private:
    int xPos;
    int yPos;
};