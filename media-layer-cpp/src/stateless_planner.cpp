#include "kzys/media/stateless_planner.hpp"

#include <algorithm>
#include <limits>
#include <utility>

namespace kzys::media {

StatelessMediaPlanner::StatelessMediaPlanner(CapacityModel model)
    : model_(std::move(model)) {}

VideoProfile StatelessMediaPlanner::choose_publish_profile(const DeviceBandwidthHint& hint) const {
    return model_.select_video_profile(hint, true);
}

VideoProfile StatelessMediaPlanner::choose_subscribe_profile(const DeviceBandwidthHint& hint) const {
    return model_.select_video_profile(hint, false);
}

StatelessJoinDecision StatelessMediaPlanner::plan_join(const StatelessJoinRequest& request) const {
    StatelessJoinDecision decision{};

    if (request.room.locked && request.identity.role != ParticipantRole::Host && request.identity.role != ParticipantRole::CoHost) {
        decision.accepted = false;
        decision.reason = "room locked";
        return decision;
    }

    const auto selected_node = pick_node(request.room, request.nodes);
    if (selected_node.empty()) {
        decision.accepted = false;
        decision.reason = "no media node available";
        return decision;
    }

    auto policy = model_.policy_for(request.room.mode, request.room.participant_count, request.device_hint);
    policy.listener_only = policy.listener_only || request.identity.role == ParticipantRole::Listener;

    decision.accepted = true;
    decision.selected_node_id = selected_node;
    decision.publish_profile = choose_publish_profile(request.device_hint);
    decision.subscribe_profile = choose_subscribe_profile(request.device_hint);
    policy.publish_video_profile = decision.publish_profile;
    policy.subscribe_video_profile = decision.subscribe_profile;

    decision.ticket.room_id = request.room.room_id;
    decision.ticket.participant_id = request.identity.participant_id;
    decision.ticket.media_node_id = selected_node;
    decision.ticket.signaling_token = request.room.room_id + ":" + request.identity.participant_id;
    decision.ticket.policy = policy;
    decision.ticket.mode = request.room.mode;
    decision.reason = "selected";
    return decision;
}

std::string StatelessMediaPlanner::pick_node(
    const RoomSnapshot& room,
    const std::vector<MediaNodeSnapshot>& nodes) const {
    if (nodes.empty()) return {};

    const MediaNodeSnapshot* best = nullptr;
    std::uint64_t best_score = std::numeric_limits<std::uint64_t>::max();

    for (const auto& node : nodes) {
        if (node.draining) continue;

        const std::uint64_t room_penalty = static_cast<std::uint64_t>(node.active_rooms + 1) * 1'000'000ULL;
        const std::uint64_t participant_penalty = static_cast<std::uint64_t>(node.active_participants + room.participant_count) * 10'000ULL;
        const std::uint64_t publisher_penalty = static_cast<std::uint64_t>(node.active_publishers + room.active_publishers) * 100ULL;
        const std::uint64_t cpu_penalty = static_cast<std::uint64_t>(node.estimated_cpu_millicores) * 10ULL;
        const std::uint64_t bw_penalty = static_cast<std::uint64_t>(node.estimated_mbps) * 5ULL;
        const auto score = room_penalty + participant_penalty + publisher_penalty + cpu_penalty + bw_penalty;
        if (!best || score < best_score) {
            best = &node;
            best_score = score;
        }
    }

    return best ? best->node_id : std::string{};
}

} // namespace kzys::media

