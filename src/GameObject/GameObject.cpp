#include "GameObject.h"
#include "TextureManager/TextureManager.h"

GameObject::GameObject(const char* texturesheet, int x, int y) {
    this->objTexture = TextureManager::LoadTexture(texturesheet);
    this->xpos = x;
    this->ypos = y;
}

GameObject::~GameObject() {
    Clean();
}

void GameObject::Update() {
    xpos++;
    ypos++;

    srcRect.x = 0;
    srcRect.y = 0;
    srcRect.h = 64;
    srcRect.w = 64;

    destRect.x = xpos;
    destRect.y = ypos;
    destRect.h = 64;
    destRect.w = 64;
}

void GameObject::Render() {
    SDL_RenderCopy(Game::renderer, objTexture, &srcRect, &destRect);
}

void GameObject::Clean() {
    SDL_DestroyTexture(objTexture);
}