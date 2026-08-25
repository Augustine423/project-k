#include "kzys/media/stateless_planner.hpp"

#include <iostream>

using namespace kzys::media;

int main() {
    CapacityModel model(CapacityConfig{
        .max_participants_per_room = 5000,
        .interactive_publishers_cap = 5000,
        .webinar_publishers_cap = 20,
        .target_video_kbps_per_publisher = 900,
        .target_audio_kbps_per_publisher = 64,
        .listener_kbps = 20,
        .default_width = 1920,
        .default_height = 1080,
        .default_fps = 30,
    });

    StatelessMediaPlanner planner(model);
    std::vector<MediaNodeSnapshot> nodes{
        MediaNodeSnapshot{
        .node_id = "node-a",
        .active_rooms = 2,
        .active_participants = 180,
        .active_publishers = 24,
        .estimated_cpu_millicores = 1200,
        .estimated_mbps = 220,
        .draining = false,
        },
        MediaNodeSnapshot{
        .node_id = "node-b",
        .active_rooms = 1,
        .active_participants = 120,
        .active_publishers = 16,
        .estimated_cpu_millicores = 900,
        .estimated_mbps = 160,
        .draining = false,
        },
    };

    const auto decision = planner.plan_join(StatelessJoinRequest{
        .identity = ParticipantIdentity{
            .room_id = "room-123",
            .participant_id = "p-001",
            .display_name = "Host",
            .role = ParticipantRole::Host,
        },
        .room = RoomSnapshot{
            .room_id = "room-123",
            .mode = RoomMode::Interactive,
            .participant_count = 256,
            .active_publishers = 60,
            .active_listeners = 196,
            .locked = false,
        },
        .nodes = nodes,
        .device_hint = DeviceBandwidthHint{
            .uplink_kbps = 6500,
            .downlink_kbps = 7000,
            .battery_saver = false,
            .is_mobile = false,
            .is_portrait = false,
        },
    });

    if (!decision.accepted) {
        std::cout << "route rejected: " << decision.reason << '\n';
        return 1;
    }

    std::cout << "selected node: " << decision.selected_node_id << '\n';
    std::cout << "ticket room: " << decision.ticket.room_id << '\n';
    std::cout << "max participants: " << decision.ticket.policy.max_participants << '\n';
    std::cout << "max publishers: " << decision.ticket.policy.max_publishers << '\n';
    std::cout << "listener only: " << (decision.ticket.policy.listener_only ? "true" : "false") << '\n';
    std::cout << "estimated bitrate kbps: "
              << model.estimate_bitrate_kbps(60, 196, decision.ticket.policy.publish_video_profile) << '\n';
    std::cout << "publish profile: "
              << decision.ticket.policy.publish_video_profile.width << "x"
              << decision.ticket.policy.publish_video_profile.height << " @ "
              << decision.ticket.policy.publish_video_profile.fps << "fps "
              << decision.ticket.policy.publish_video_profile.bitrate_kbps << "kbps\n";
    return 0;
}
