#pragma once

#include "join_ticket.hpp"

#include <vector>

namespace kzys::media {

struct RoomSnapshot {
    std::string room_id;
    RoomMode mode{RoomMode::Interactive};
    std::uint32_t participant_count{0};
    std::uint32_t active_publishers{0};
    std::uint32_t active_listeners{0};
    bool locked{false};
};

struct MediaNodeSnapshot {
    std::string node_id;
    std::uint32_t active_rooms{0};
    std::uint32_t active_participants{0};
    std::uint32_t active_publishers{0};
    std::uint32_t estimated_cpu_millicores{0};
    std::uint32_t estimated_mbps{0};
    bool draining{false};
};

struct StatelessJoinRequest {
    ParticipantIdentity identity;
    RoomSnapshot room;
    std::vector<MediaNodeSnapshot> nodes;
    DeviceBandwidthHint device_hint{};
};

struct StatelessJoinDecision {
    bool accepted{false};
    std::string reason;
    JoinTicket ticket;
    VideoProfile publish_profile{};
    VideoProfile subscribe_profile{};
    std::string selected_node_id;
};

class StatelessMediaPlanner {
public:
    explicit StatelessMediaPlanner(CapacityModel model);

    [[nodiscard]] StatelessJoinDecision plan_join(const StatelessJoinRequest& request) const;

    [[nodiscard]] VideoProfile choose_publish_profile(const DeviceBandwidthHint& hint) const;
    [[nodiscard]] VideoProfile choose_subscribe_profile(const DeviceBandwidthHint& hint) const;

private:
    [[nodiscard]] std::string pick_node(
        const RoomSnapshot& room,
        const std::vector<MediaNodeSnapshot>& nodes) const;

    CapacityModel model_;
};

} // namespace kzys::media

