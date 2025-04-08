#include "Collider.h"

Collider::Collider() {
    tag = "Collider";
}

Collider::Collider(const char* tag) {
    this->tag = tag;
}

void Collider::init() {
    if (!entity->hasComponent<Transform>())
        entity->addComponent<Transform>();

    transform = &entity->getComponent<Transform>();

    Game::colliders.push_back(this);
}

void Collider::update() {
    collider.x = static_cast<int>(transform->position.x);
    collider.y = static_cast<int>(transform->position.y);
    collider.w = static_cast<int>(transform->width * transform->scale);
    collider.h = static_cast<int>(transform->height * transform->scale);
}