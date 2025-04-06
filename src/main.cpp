#include <iostream>
#include <SDL2/SDL.h>

#include "Game/Game.h"

struct Player {
    int x, y;
    int width, height;
    int speed;
};

Game *game = nullptr;

int main(int argc, const char *argv[]) {
    // Create Game object
    game = new Game();
    game->init(
        "Dungeon Master",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        800,
        600,
        true
    );


    // // Initialize player
    // Player player = {100, 100, 40, 40, 10};

    while (game->running()) {
        game->handleEvents();
        game->update();
        game->render();
    }

    game->clear();
    return 0;
}