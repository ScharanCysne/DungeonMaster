#ifndef __NPC_H__
#define __NPC_H__


#include <string>

struct NPC {
    std::string name;
    std::string role;
    int x, y; // NPC's location
};

#endif // __NPC_H__