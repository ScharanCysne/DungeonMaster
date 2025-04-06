#pragma once

#include "ECS/ECS.h"

class Position : public Component {
public:
    int x() const { return xPos; }
    int y() const { return yPos; }

    void init() override;
    void update() override;
    void setPos(int x, int y);
private:
    int xPos;
    int yPos;
};