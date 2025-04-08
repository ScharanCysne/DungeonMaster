#include "Tile.h"

Tile::Tile(int x, int y, int w, int h, int id) {
    tileRect.x = x;
    tileRect.y = y;
    tileRect.w = w;
    tileRect.h = h;
    tileId = id;

    switch(tileId) {
        case 0:
            path = "Shoom/PNGs/Shoom_Pop/Shoom_Pop1.png";
            break;
        case 1:
            path = "Shoom/PNGs/Shoom_Pop/Shoom_Pop2.png";
            break;
        case 2:
            path = "Shoom/PNGs/Shoom_Pop/Shoom_Pop3.png";
            break;
        default:
            path = "Shoom/PNGs/Shoom_Pop/Shoom_Pop4.png";
            break;
    }
}

void Tile::init() {
    if (!entity->hasComponent<Transform>()) {
        transform = &entity->addComponent<Transform>(tileRect.x, tileRect.y, tileRect.h, tileRect.w, 1);
    } else {
        transform = &entity->getComponent<Transform>();
        transform->position.x = tileRect.x;
        transform->position.y = tileRect.y;
        transform->width = tileRect.w;
        transform->height = tileRect.h;
    }

    if (!entity->hasComponent<Sprite>()) {
        sprite = &entity->addComponent<Sprite>(path.c_str());
    } else {
        sprite = &entity->getComponent<Sprite>();
        sprite->setTexture(path.c_str());
    }
}

void Tile::update() {

}

void Tile::draw() {

}