#include "Sprite.h"
#include "TextureManager/TextureManager.h"

Sprite::Sprite(const char* path) {
    setTexture(path);
}

void Sprite::setTexture(const char* path) {
    texture = TextureManager::LoadTexture(path);
}

void Sprite::init() {
    srcRect.x = 0;
    srcRect.y = 0;
    srcRect.w = 64;
    srcRect.h = 64;

    destRect.x = 0;
    destRect.y = 0;
    destRect.w = 64;
    destRect.h = 64;

    transform = &entity->getComponent<Transform>();
}

void Sprite::draw() {
    TextureManager::Draw(texture, srcRect, destRect);
}

void Sprite::update() {
    destRect.x = transform->x();
    destRect.y = transform->y();
}