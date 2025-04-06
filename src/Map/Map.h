#pragma once

#include "Game/Game.h"

class Map {
public:
    Map();
    ~Map();

    void LoadMap(int arr[20][25]);
    void DrawMap();

private:
    SDL_Rect srcRect;
    SDL_Rect destRect;

    SDL_Texture* mapTexture;
    int map[20][25];
};