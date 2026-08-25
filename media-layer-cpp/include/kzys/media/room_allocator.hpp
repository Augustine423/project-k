#pragma once

#include "join_ticket.hpp"
#include <unordered_map>

namespace kzys::media {

class RoomAllocator {
public:
    void register_node(MediaNodeLoad load);
    void remove_node(const std::string& node_id);
    void mark_draining(const std::string& node_id, bool draining);

    [[nodiscard]] RouteDecision choose_node_for_room(
        const std::string& room_id,
        std::uint32_t participant_count,
        std::uint32_t active_publishers,
        std::uint32_t active_listeners) const;

    [[nodiscard]] std::vector<MediaNodeLoad> snapshot() const;

private:
    static std::uint64_t score_node(
        const MediaNodeLoad& node,
        std::uint32_t participant_count,
        std::uint32_t active_publishers,
        std::uint32_t active_listeners);

    std::unordered_map<std::string, MediaNodeLoad> nodes_;
};

} // namespace kzys::media

