#include "TextureManager.h"

std::string getAssetPath(const std::string& filename) {
    return "../assets/" + filename;
}

SDL_Texture* TextureManager::LoadTexture(const char *filename, SDL_Renderer *renderer) {
    SDL_Surface *tempSurface = IMG_Load(getAssetPath(filename).c_str());

    if (!tempSurface) {
        std::cerr << "Failed to load image: " << filename << " " << IMG_GetError() << "\n";
        return nullptr;
    }
    SDL_Texture *texture = SDL_CreateTextureFromSurface(renderer, tempSurface);
    SDL_FreeSurface(tempSurface);

    return texture;
}