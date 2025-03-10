#ifndef __DECISION_TREE_H__
#define __DECISION_TREE_H__

struct DecisionNode {
    int id;
    std::string description;
    int parentId;
    std::vector<int> children;
};

class DecisionTree {
public:
    DecisionTree() {
        root.id = 0;
        root.description = "Game Start";
        root.parentId = -1;
        decisions[0] = root;
    }

    int addDecision(int parentId, const std::string& description) {
        int id = decisions.size();
        DecisionNode node{id, description, parentId, {}};
        decisions[parentId].children.push_back(id);
        decisions[id] = node;
        return id;
    }

    std::string getDecisionTreeJSON() const {
        crow::json::wvalue treeJson;
        std::vector<crow::json::wvalue> nodes;

        for (const auto& [id, node] : decisions) {
            crow::json::wvalue nodeJson;
            nodeJson["id"] = node.id;
            nodeJson["description"] = node.description;
            nodeJson["parentId"] = node.parentId;
            nodeJson["children"] = node.children;
            nodes.push_back(std::move(nodeJson));
        }

        treeJson["decisions"] = std::move(nodes);
        return treeJson.dump();
    }

private:
    DecisionNode root;
    std::unordered_map<int, DecisionNode> decisions;
};


#endif // __DECISION_TREE_H__