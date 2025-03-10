#ifndef __QUEST_H__
#define __QUEST_H__

#include <string>
#include "npc/npc.h"

struct Quest {
    std::string title;
    std::string description;
    NPC giver;
};

#endif // __QUEST_H__