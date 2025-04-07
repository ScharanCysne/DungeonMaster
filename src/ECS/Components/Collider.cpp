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
}

void Collider::update() {
    collider.x = (int) transform->position.x;
    collider.y = (int) transform->position.y;
    collider.w = (int) transform->width * transform->scale;
    collider.h = (int) transform->height * transform->scale;
}