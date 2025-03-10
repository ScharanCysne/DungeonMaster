#ifndef __WORLD_H__
#define __WORLD_H__

#include <string>
#include <vector>

#include "crow_all.h"
#include "FastNoiseLite.h"

struct Location {
    std::string name;
    int x, y;
    std::string type; // "City" or "Dungeon"
};

// Biome types
enum class Biome { PLAINS, FOREST, MOUNTAINS, DESERT, WATER };

// Struct to represent a map tile
struct Tile {
    Biome biome;
};

class WorldGenerator {
public:
    WorldGenerator(int width, int height, unsigned int seed)
        : width(width), height(height), rng(seed), noise() {
        noise.SetNoiseType(FastNoiseLite::NoiseType_Perlin);
        noise.SetSeed(seed);
        generateWorld();
        generateNPCs();
        generateQuests();
    }

    std::string getWorldJSON() const {
        crow::json::wvalue worldData;
        std::vector<crow::json::wvalue> mapData;

        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                crow::json::wvalue tile;
                tile["x"] = x;
                tile["y"] = y;
                tile["biome"] = getBiomeString(world[y * width + x].biome);
                mapData.push_back(std::move(tile));
            }
        }

        worldData["map"] = std::move(mapData);

        std::vector<crow::json::wvalue> locationData;
        for (const auto& loc : locations) {
            crow::json::wvalue locJson;
            locJson["name"] = loc.name;
            locJson["x"] = loc.x;
            locJson["y"] = loc.y;
            locJson["type"] = loc.type;
            locationData.push_back(std::move(locJson));
        }

        worldData["locations"] = std::move(locationData);
        return worldData.dump();
    }

    std::string getNPCsJSON() const {
        crow::json::wvalue npcsData;
        std::vector<crow::json::wvalue> npcList;
        for (const auto& npc : npcs) {
            crow::json::wvalue npcJson;
            npcJson["name"] = npc.name;
            npcJson["role"] = npc.role;
            npcJson["x"] = npc.x;
            npcJson["y"] = npc.y;
            npcList.push_back(std::move(npcJson));
        }
        npcsData["npcs"] = std::move(npcList);
        return npcsData.dump();
    }

    std::string getQuestsJSON() const {
        crow::json::wvalue questsData;
        std::vector<crow::json::wvalue> questList;
        for (const auto& quest : quests) {
            crow::json::wvalue questJson;
            questJson["title"] = quest.title;
            questJson["description"] = quest.description;
            questList.push_back(std::move(questJson));
        }
        questsData["quests"] = std::move(questList);
        return questsData.dump();
    }

private:
    int width, height;
    std::vector<Tile> world;
    std::vector<Location> locations;
    std::vector<NPC> npcs;
    std::vector<Quest> quests;
    std::mt19937 rng;
    FastNoiseLite noise;

    void generateWorld() {
        world.resize(width * height);

        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                float noiseValue = noise.GetNoise((float)x, (float)y);
                world[y * width + x].biome = determineBiome(noiseValue);
            }
        }
        generateLocations();
    }

    void generateNPCs() {
        npcs.push_back({"Eldrin", "Blacksmith", 5, 5});
        npcs.push_back({"Miranda", "Merchant", 10, 2});
        npcs.push_back({"Thalor", "Guild Leader", 8, 7});
    }

    void generateQuests() {
        quests.push_back({"Lost Relic", "Find the ancient relic hidden in the dungeons.", "Thalor"});
        quests.push_back({"Supply Run", "Deliver supplies to the nearby village.", "Miranda"});
    }

    Biome determineBiome(float noiseValue) const {
        if (noiseValue < -0.3) return Biome::WATER;
        if (noiseValue < 0.0) return Biome::PLAINS;
        if (noiseValue < 0.3) return Biome::FOREST;
        if (noiseValue < 0.6) return Biome::MOUNTAINS;
        return Biome::DESERT;
    }

    void generateLocations() {
        std::uniform_int_distribution<int> xDist(0, width - 1);
        std::uniform_int_distribution<int> yDist(0, height - 1);

        for (int i = 0; i < (width * height) / 50; ++i) { // 2% chance for cities
            locations.push_back({"City" + std::to_string(i), xDist(rng), yDist(rng), "City"});
        }
        for (int i = 0; i < (width * height) / 100; ++i) { // 1% chance for dungeons
            locations.push_back({"Dungeon" + std::to_string(i), xDist(rng), yDist(rng), "Dungeon"});
        }
    }

    std::string getBiomeString(Biome biome) const {
        switch (biome) {
            case Biome::PLAINS: return "Plains";
            case Biome::FOREST: return "Forest";
            case Biome::MOUNTAINS: return "Mountains";
            case Biome::DESERT: return "Desert";
            case Biome::WATER: return "Water";
            default: return "Unknown";
        }
    }
};

#endif // __WORLD_H__