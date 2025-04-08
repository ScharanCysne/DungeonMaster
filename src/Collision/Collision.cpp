#include "Collision.h"
#include "ECS/Components/Collider.h"

bool Collision::AABB(const SDL_Rect& rectA, const SDL_Rect& rectB) {
    return (
        rectA.x + rectA.w >= rectB.x &&
        rectA.x <= rectB.x + rectB.w &&
        rectA.y + rectA.h >= rectB.y &&
        rectA.y <= rectB.y + rectB.h
    );
}

bool Collision::AABB(const Collider& collA, const Collider& collB) {
    return AABB(collA.collider, collB.collider);
}

bool Collision::PointInRect(int x, int y, const SDL_Rect& rect) {
    return (x >= rect.x && x <= rect.x + rect.w &&
            y >= rect.y && y <= rect.y + rect.h);
}

bool Collision::CircleInRect(int circleX, int circleY, int radius, const SDL_Rect& rect) {
    int closestX = std::max(rect.x, std::min(circleX, rect.x + rect.w));
    int closestY = std::max(rect.y, std::min(circleY, rect.y + rect.h));

    int distanceX = circleX - closestX;
    int distanceY = circleY - closestY;

    return (distanceX * distanceX + distanceY * distanceY) < (radius * radius);
}

bool Collision::CircleInCircle(int x1, int y1, int radius1, int x2, int y2, int radius2) {
    int distanceX = x1 - x2;
    int distanceY = y1 - y2;
    int distanceSquared = distanceX * distanceX + distanceY * distanceY;
    int radiusSum = radius1 + radius2;

    return distanceSquared < (radiusSum * radiusSum);
}