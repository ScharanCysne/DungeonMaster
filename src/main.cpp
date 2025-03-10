#include "crow_all.h"

#include "decision_tree/decision_tree.h"
#include "dungeon/dungeon.h"
#include "npc/npc.h"
#include "quest/quest.h"
#include "world/world.h"


// Simple Game Master AI class


int main() {
    WorldGenerator generator(20, 10, 12345);
    DecisionTree decisionTree;
    GameMaster gameMaster;

    crow::SimpleApp app;

    CROW_ROUTE(app, "/world").methods("GET"_method)([&generator]() {
        return crow::response(generator.getWorldJSON());
    });

    CROW_ROUTE(app, "/decisions").methods("GET"_method)([&decisionTree]() {
        return crow::response(decisionTree.getDecisionTreeJSON());
    });

    CROW_ROUTE(app, "/npcs").methods("GET"_method)([&generator]() {
        return crow::response(generator.getNPCsJSON());
    });

    CROW_ROUTE(app, "/quests").methods("GET"_method)([&generator]() {
        return crow::response(generator.getQuestsJSON());
    });

    CROW_ROUTE(app, "/chat").methods("POST"_method)([&gameMaster, &decisionTree](const crow::request& req) {
        auto data = crow::json::load(req.body);
        if (!data)
            return crow::response(400, "Invalid JSON");

        std::string input = data["message"].s();
        std::string response = gameMaster.getResponse(input);
        int decisionId = decisionTree.addDecision(0, input);

        crow::json::wvalue res;
        res["response"] = response;
        res["decisionId"] = decisionId;
        return crow::response(res);
    });

    app.port(18080).multithreaded().run();

    return 0;
}