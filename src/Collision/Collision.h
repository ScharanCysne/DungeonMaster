#pragma once

#include <algorithm>
#include "SDL2/SDL.h"

class Collision {
public:
    static bool AABB(const SDL_Rect& rectA, const SDL_Rect& rectB);
    static bool PointInRect(int x, int y, const SDL_Rect& rect);
    static bool CircleInRect(int circleX, int circleY, int radius, const SDL_Rect& rect);
    static bool CircleInCircle(int x1, int y1, int radius1, int x2, int y2, int radius2);
};