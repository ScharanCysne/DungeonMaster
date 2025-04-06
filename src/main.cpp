#include "Game/Game.h"

Game *game = nullptr;

int main(int argc, const char *argv[]) {

    const int FPS = 60;
    const int frameDelay = 1000 / FPS;

    Uint32 frameStart;
    int frameTime;

    // Create Game object
    game = new Game();
    game->init(
        "Dungeon Master",
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        800,
        600,
        false
    );

    while (game->running()) {
        frameStart = SDL_GetTicks();    // ms

        game->handleEvents();
        game->update();
        game->render();

        frameTime = SDL_GetTicks() - frameStart;

        if(frameDelay > frameTime) {    // moved too fast, wait until delay
            SDL_Delay(frameDelay - frameTime);
        }
    }

    game->clear();
    return 0;
}