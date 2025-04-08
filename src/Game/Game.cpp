#include "Game.h"
#include "TextureManager/TextureManager.h"
#include "ECS/Components/Components.h"
#include "Map/Map.h"
#include "Vector2D/Vector2D.h"
#include "Collision/Collision.h"

// Global variables
SDL_Renderer* Game::renderer = nullptr;
SDL_Event Game::event;
std::vector<Collider*> Game::colliders;

// Initialization of static variables
Map *map = nullptr;
Manager manager;

auto& player = manager.addEntity();
auto& wall = manager.addEntity();

auto& tile0 = manager.addEntity();
auto& tile1 = manager.addEntity();
auto& tile2 = manager.addEntity();

Game::Game() {

}

Game::~Game() {

}

void Game::init(const char* title, int xpos, int ypos, int width, int height, bool fullscreen) {
    int flags = SDL_WINDOW_SHOWN;
    if (fullscreen) {
        flags = SDL_WINDOW_FULLSCREEN;
    }

    if (SDL_Init(SDL_INIT_EVERYTHING) < 0) {
        std::cerr << "SDL could not initialize! " << SDL_GetError() << "\n";
        isRunning = false;
    } else {
        window = SDL_CreateWindow(title, xpos, ypos, width, height, flags);
        if (!window) {
            std::cerr << "Window could not be created! " << SDL_GetError() << "\n";
            isRunning = false;
        }

        renderer = SDL_CreateRenderer(window, -1, 0);
        if (!renderer) {
            std::cerr << "Renderer could not be created! " << SDL_GetError() << "\n";
            isRunning = false;
        }

        isRunning = true;
    }

    map = new Map();

    // Create tiles
    tile0.addComponent<Tile>(0, 0, 64, 64, 0);
    tile1.addComponent<Tile>(64, 0, 64, 64, 1);
    tile2.addComponent<Tile>(128, 0, 64, 64, 2);

    tile0.addComponent<Collider>("Pop");

    // Create player
    player.addComponent<Transform>(300, 50);
    player.addComponent<Sprite>("Shoom/PNGs/Shoom_Idle/Shoom_Idle1.png");
    player.addComponent<KeyboardController>();
    player.addComponent<Collider>("Player");
}

void Game::handleEvents() {
    SDL_PollEvent(&event);

    switch (event.type) {
        case SDL_QUIT:
            isRunning = false;
            break;
        default:
            break;
    }
}

void Game::update() {
    manager.refresh();
    manager.update();

    for (auto& cc : colliders) {
        if(Collision::AABB(player.getComponent<Collider>(), *cc)) {
            player.getComponent<Transform>().velocity *= -1;
            std::cout << "Hit!" << std::endl;
        }
    }
}

void Game::render() {
    SDL_RenderClear(renderer);

    map->DrawMap();
    manager.draw();

    SDL_RenderPresent(renderer);
}

void Game::clear() {
    isRunning = false;

    SDL_DestroyWindow(window);
    SDL_DestroyRenderer(renderer);
    SDL_Quit();

    std::cout << "Game cleared and resources released." << std::endl;
}

bool Game::running() {
    return isRunning;
}