#include <SDL2/SDL.h>
#include <iostream>

struct Player {
    int x, y;
    int width, height;
    int speed;
};

void handleInput(Player &player, SDL_Event &e) {
    if (e.type == SDL_KEYDOWN) {
        switch (e.key.keysym.sym) {
            case SDLK_w: player.y -= player.speed; break;
            case SDLK_s: player.y += player.speed; break;
            case SDLK_a: player.x -= player.speed; break;
            case SDLK_d: player.x += player.speed; break;
        }
    }
}

void update() {

}

void render(SDL_Renderer* renderer, const Player& player) {
    // Clear the screen
    SDL_SetRenderDrawColor(renderer, 50, 50, 50, 255);
    SDL_RenderClear(renderer);

    // Draw the player
    SDL_Rect playerRect = { player.x, player.y, player.width, player.height };
    SDL_SetRenderDrawColor(renderer, 200, 100, 50, 255);
    SDL_RenderFillRect(renderer, &playerRect);

    SDL_RenderPresent(renderer);
}

int main() {
    if (SDL_Init(SDL_INIT_VIDEO) < 0) {
        std::cerr << "SDL could not initialize! " << SDL_GetError() << "\n";
        return 1;
    }

    SDL_Window* window = SDL_CreateWindow(
        "Dungeon Master",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        800,
        600,
        SDL_WINDOW_SHOWN
    );

    if (!window) {
        std::cerr << "Window could not be created! " << SDL_GetError() << "\n";
        SDL_Quit();
        return 1;
    }

    SDL_Renderer* renderer = SDL_CreateRenderer(window, -1, 0);
    if (!renderer) {
        std::cerr << "Renderer could not be created! " << SDL_GetError() << "\n";
        SDL_DestroyWindow(window);
        SDL_Quit();
        return 1;
    }

    // Initialize player
    Player player = {100, 100, 40, 40, 10};

    // Basic game loop to keep window open
    bool running = true;
    SDL_Event e;

    while (running) {
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_QUIT)
                running = false;
            handleInput(player, e);
        }

        update();
        render(renderer, player);
    }

    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}