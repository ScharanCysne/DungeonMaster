#include "Game.h"
#include "TextureManager/TextureManager.h"
struct Player {
    int x, y;
    int width, height;
    int speed;
};

SDL_Texture* player_texture = nullptr;

// Initialize player
Player player = {100, 100, 40, 40, 10};

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

    player_texture = TextureManager::LoadTexture("Shoom/PNGs/Shoom_Idle/Shoom_Idle1.png", renderer);
    if (!player_texture) {
        std::cerr << "Failed to load player texture! " << SDL_GetError() << "\n";
        isRunning = false;
    }
}

void Game::handleEvents() {
    SDL_Event e;
    SDL_PollEvent(&e);

    switch (e.type) {
        case SDL_QUIT:
            isRunning = false;
            break;

        case SDL_KEYDOWN:
            switch (e.key.keysym.sym) {
                case SDLK_w: player.y -= player.speed; break;
                case SDLK_s: player.y += player.speed; break;
                case SDLK_a: player.x -= player.speed; break;
                case SDLK_d: player.x += player.speed; break;
            }
            break;

        default:
            break;
    }
}

void Game::update() {

}

void Game::render() {
    // Clear the screen
    SDL_SetRenderDrawColor(renderer, 50, 50, 50, 255);
    SDL_RenderClear(renderer);

    // // Draw the player
    SDL_Rect playerRect = { player.x, player.y, player.width, player.height };
    SDL_RenderCopy(renderer, player_texture, nullptr, &playerRect);

    SDL_RenderPresent(renderer);
}

void Game::clear() {
    SDL_DestroyWindow(window);
    SDL_DestroyRenderer(renderer);
    SDL_Quit();
    isRunning = false;
    std::cout << "Game cleared and resources released." << std::endl;
}

bool Game::running() {
    return isRunning;
}