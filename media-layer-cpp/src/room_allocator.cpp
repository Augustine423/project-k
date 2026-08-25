#include "kzys/media/room_allocator.hpp"

#include <algorithm>
#include <limits>
#include <utility>

namespace kzys::media {

void RoomAllocator::register_node(MediaNodeLoad load) {
    nodes_[load.node_id] = std::move(load);
}

void RoomAllocator::remove_node(const std::string& node_id) {
    nodes_.erase(node_id);
}

void RoomAllocator::mark_draining(const std::string& node_id, bool draining) {
    auto it = nodes_.find(node_id);
    if (it != nodes_.end()) {
        it->second.draining = draining;
    }
}

RouteDecision RoomAllocator::choose_node_for_room(
    const std::string& room_id,
    std::uint32_t participant_count,
    std::uint32_t active_publishers,
    std::uint32_t active_listeners) const {
    if (nodes_.empty()) {
        return {.node_id = {}, .accepted = false, .reason = "no media nodes registered"};
    }

    const MediaNodeLoad* best = nullptr;
    std::uint64_t best_score = std::numeric_limits<std::uint64_t>::max();

    for (const auto& [node_id, node] : nodes_) {
        (void)node_id;
        if (node.draining) continue;
        const auto score = score_node(node, participant_count, active_publishers, active_listeners);
        if (!best || score < best_score) {
            best = &node;
            best_score = score;
        }
    }

    if (!best) {
        return {.node_id = {}, .accepted = false, .reason = "all nodes are draining"};
    }

    RouteDecision decision{};
    decision.node_id = best->node_id;
    decision.accepted = true;
    decision.reason = "selected";
    (void)room_id;
    return decision;
}

std::vector<MediaNodeLoad> RoomAllocator::snapshot() const {
    std::vector<MediaNodeLoad> result;
    result.reserve(nodes_.size());
    for (const auto& [_, node] : nodes_) {
        result.push_back(node);
    }
    std::sort(result.begin(), result.end(), [](const auto& a, const auto& b) {
        return a.node_id < b.node_id;
    });
    return result;
}

std::uint64_t RoomAllocator::score_node(
    const MediaNodeLoad& node,
    std::uint32_t participant_count,
    std::uint32_t active_publishers,
    std::uint32_t active_listeners) {
    const std::uint64_t room_penalty = static_cast<std::uint64_t>(node.active_rooms + 1) * 1'000'000ULL;
    const std::uint64_t participant_penalty = static_cast<std::uint64_t>(node.active_participants + participant_count) * 10'000ULL;
    const std::uint64_t publisher_penalty = static_cast<std::uint64_t>(node.active_publishers + active_publishers) * 100ULL;
    const std::uint64_t listener_penalty = static_cast<std::uint64_t>(active_listeners);
    const std::uint64_t cpu_penalty = static_cast<std::uint64_t>(node.estimated_cpu_millicores) * 10ULL;
    const std::uint64_t bw_penalty = static_cast<std::uint64_t>(node.estimated_mbps) * 5ULL;
    return room_penalty + participant_penalty + publisher_penalty + listener_penalty + cpu_penalty + bw_penalty;
}

} // namespace kzys::media

