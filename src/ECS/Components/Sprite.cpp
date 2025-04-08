#include "Sprite.h"
#include "TextureManager/TextureManager.h"

Sprite::Sprite(const char* path) {
    setTexture(path);
}

Sprite::~Sprite() {
    SDL_DestroyTexture(texture);
}

void Sprite::setTexture(const char* path) {
    texture = TextureManager::LoadTexture(path);
}

void Sprite::init() {
    transform = &entity->getComponent<Transform>();

    srcRect.x = 0;
    srcRect.y = 0;
    srcRect.w = transform->width;
    srcRect.h = transform->height;
}

void Sprite::draw() {
    TextureManager::Draw(texture, srcRect, destRect);
}

void Sprite::update() {
    destRect.x = static_cast<int>(transform->position.x);
    destRect.y = static_cast<int>(transform->position.y);
    destRect.w = static_cast<int>(transform->width * transform->scale);
    destRect.h = static_cast<int>(transform->height * transform->scale);
}