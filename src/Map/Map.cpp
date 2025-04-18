#include "Map.h"
#include "TextureManager/TextureManager.h"

int lvl[20][25] = {
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,1,2,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,1,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
    { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
};

Map::Map(){
    srcRect.x = 0;
    srcRect.y = 0;
    srcRect.h = 64;
    srcRect.w = 64;

    destRect.x = 0;
    destRect.y = 0;
    destRect.h = 64;
    destRect.w = 64;

    LoadMap(lvl);
}

Map::~Map() {

}

void Map::LoadMap(int arr[20][25]) {
    for(int i = 0; i < 20; i++) {
        for(int j = 0; j < 25; j++) {
            map[i][j] = arr[i][j];
        }
    }
}

void Map::DrawMap() {
    int type = 0;
    SDL_Rect tile;

    for(int i = 0; i < 20; i++) {
        for(int j = 0; j < 25; j++) {
            type = map[i][j];

            tile.x = j * 32;
            tile.y = i * 32;
            tile.w = 32;
            tile.h = 32;

            switch(type) {
                case 0:
                    SDL_SetRenderDrawColor(Game::renderer, 0, 240, 50, 255);
                    break;
                case 1:
                    SDL_SetRenderDrawColor(Game::renderer, 0, 0, 0, 255);
                    break;
                case 2:
                    SDL_SetRenderDrawColor(Game::renderer, 111, 111, 111, 255);
                    break;
                default:
                    break;
                }

            SDL_RenderFillRect(Game::renderer, &tile);
            tile.x += 64;
        }
        tile.x = 0;
        tile.y += 64;
    }
}