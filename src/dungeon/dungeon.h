#ifndef __DUNGEON_H__
#define __DUNGEON_H__

#include <string>
#include <vector>

class GameMaster {
public:
    std::string getResponse(const std::string& playerInput) {
        // Remember past interactions
        history.push_back(playerInput);

        // Context-aware responses
        if (playerInput.find("hello") != std::string::npos) {
            return "Greetings, traveler! What do you seek?";
        } else if (playerInput.find("help") != std::string::npos) {
            return "I can guide you on your journey. Ask about locations or dangers ahead.";
        } else if (playerInput.find("where am I") != std::string::npos) {
            return "You are in a vast land filled with mystery. Seek the cities for shelter, but beware the dungeons.";
        } else if (playerInput.find("who are you") != std::string::npos) {
            return "I am the Game Master, the keeper of knowledge and fate in this world.";
        } else if (playerInput.find("tell me about my journey") != std::string::npos) {
            return summarizeJourney();
        } else {
            return "Your words are strange to me. Speak of the land or your needs.";
        }
    }

private:
    std::vector<std::string> history;

    std::string summarizeJourney() {
        if (history.empty()) {
            return "You have just begun your journey. The world awaits you.";
        }
        std::string summary = "You have spoken of: ";
        for (const auto& entry : history) {
            summary += "'" + entry + "', ";
        }
        return summary.substr(0, summary.length() - 2) + ". Your path unfolds before you.";
    }
};

#endif // __DUNGEON_H__