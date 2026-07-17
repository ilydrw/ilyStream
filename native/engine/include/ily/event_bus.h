#pragma once

#include <string>
#include <vector>
#include <functional>
#include <unordered_map>
#include <mutex>
#include <memory>

namespace ily {

struct Event {
    std::string type;
    std::string payload; 
};

class EventBus {
public:
    using Listener = std::function<void(const Event&)>;
    using SubscriptionId = uint64_t;

private:
    struct Subscription {
        SubscriptionId id;
        Listener listener;
    };

    std::unordered_map<std::string, std::vector<Subscription>> listeners;
    SubscriptionId nextSubscriptionId = 1;
    mutable std::mutex mutex;

public:
    EventBus() = default;
    ~EventBus() = default;

    // Subscribe to an event type. Returns a SubscriptionId to unsubscribe.
    SubscriptionId Subscribe(const std::string& eventType, Listener listener) {
        std::lock_guard<std::mutex> lock(mutex);
        SubscriptionId id = nextSubscriptionId++;
        listeners[eventType].push_back({id, std::move(listener)});
        return id;
    }

    // Unsubscribe using the SubscriptionId
    bool Unsubscribe(const std::string& eventType, SubscriptionId subId) {
        std::lock_guard<std::mutex> lock(mutex);
        auto it = listeners.find(eventType);
        if (it == listeners.end()) {
            return false;
        }
        auto& list = it->second;
        for (auto listIt = list.begin(); listIt != list.end(); ++listIt) {
            if (listIt->id == subId) {
                list.erase(listIt);
                return true;
            }
        }
        return false;
    }

    // Dispatch an event to all subscribers of its type
    void Dispatch(const Event& event) {
        std::vector<Listener> targets;
        {
            std::lock_guard<std::mutex> lock(mutex);
            auto it = listeners.find(event.type);
            if (it != listeners.end()) {
                for (const auto& sub : it->second) {
                    targets.push_back(sub.listener);
                }
            }
        }

        // Call listeners outside the lock to avoid deadlocks
        for (const auto& listener : targets) {
            if (listener) {
                listener(event);
            }
        }
    }
};

} // namespace ily
