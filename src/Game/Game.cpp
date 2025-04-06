#include "Game.h"
#include "TextureManager/TextureManager.h"
#include "Map/Map.h"
#include "Components/Components.h"

SDL_Renderer* Game::renderer = nullptr;

Map *map = nullptr;
Manager manager;
auto& player(manager.addEntity());

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

    // Create player
    player.addComponent<Position>(300, 50);
    player.addComponent<Sprite>("Shoom/PNGs/Shoom_Idle/Shoom_Idle1.png");
}

void Game::handleEvents() {
    SDL_Event e;
    SDL_PollEvent(&e);

    switch (e.type) {
        case SDL_QUIT:
            isRunning = false;
            break;

        // case SDL_KEYDOWN:
        //     switch (e.key.keysym.sym) {
        //         case SDLK_w: playerObject.y -= playerObject.speed; break;
        //         case SDLK_s: playerObject.y += playerObject.speed; break;
        //         case SDLK_a: playerObject.x -= playerObject.speed; break;
        //         case SDLK_d: playerObject.x += playerObject.speed; break;
        //     }
        //     break;

        default:
            break;
    }
}

void Game::update() {
    manager.refresh();
    manager.update();
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