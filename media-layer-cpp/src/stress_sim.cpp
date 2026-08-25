#include "kzys/media/stateless_planner.hpp"

#include <chrono>
#include <iostream>
#include <random>
#include <string>
#include <vector>

using namespace kzys::media;

int main(int argc, char** argv) {
    const std::uint32_t rooms = argc > 1 ? static_cast<std::uint32_t>(std::stoul(argv[1])) : 1000;
    const std::uint32_t node_count = argc > 2 ? static_cast<std::uint32_t>(std::stoul(argv[2])) : 6;
    const std::uint32_t participants_per_room = argc > 3 ? static_cast<std::uint32_t>(std::stoul(argv[3])) : 5000;
    const std::uint32_t active_publishers = argc > 4 ? static_cast<std::uint32_t>(std::stoul(argv[4])) : 5000;
    const std::uint32_t active_listeners = participants_per_room > active_publishers
        ? participants_per_room - active_publishers
        : 0;

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

    std::mt19937 rng(42);
    std::uniform_int_distribution<std::uint32_t> rooms_dist(0, 6);
    std::uniform_int_distribution<std::uint32_t> participants_dist(0, 1000);
    std::uniform_int_distribution<std::uint32_t> publishers_dist(0, 100);
    std::uniform_int_distribution<std::uint32_t> cpu_dist(200, 2800);
    std::uniform_int_distribution<std::uint32_t> mbps_dist(20, 650);

    std::vector<MediaNodeSnapshot> nodes;
    nodes.reserve(node_count);
    for (std::uint32_t i = 0; i < node_count; ++i) {
        nodes.push_back(MediaNodeSnapshot{
            .node_id = "node-" + std::to_string(i),
            .active_rooms = rooms_dist(rng),
            .active_participants = participants_dist(rng),
            .active_publishers = publishers_dist(rng),
            .estimated_cpu_millicores = cpu_dist(rng),
            .estimated_mbps = mbps_dist(rng),
            .draining = false,
        });
    }

    const auto started = std::chrono::steady_clock::now();
    std::uint32_t accepted = 0;
    std::uint64_t total_estimated_kbps = 0;

    for (std::uint32_t room_index = 0; room_index < rooms; ++room_index) {
        const auto room_id = "room-" + std::to_string(room_index);
        const auto decision = planner.plan_join(StatelessJoinRequest{
            .identity = ParticipantIdentity{
                .room_id = room_id,
                .participant_id = "host-" + std::to_string(room_index),
                .display_name = "Host",
                .role = ParticipantRole::Host,
            },
            .room = RoomSnapshot{
                .room_id = room_id,
                .mode = RoomMode::Interactive,
                .participant_count = participants_per_room,
                .active_publishers = active_publishers,
                .active_listeners = active_listeners,
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
            continue;
        }

        ++accepted;
        total_estimated_kbps += model.estimate_bitrate_kbps(
            active_publishers,
            active_listeners,
            decision.ticket.policy.publish_video_profile);
    }

    const auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - started).count();

    std::cout << "rooms=" << rooms
              << " nodes=" << node_count
              << " participants_per_room=" << participants_per_room
              << " active_publishers=" << active_publishers
              << " accepted=" << accepted
              << " elapsed_ms=" << elapsed_ms
              << " avg_room_kbps=" << (accepted ? (total_estimated_kbps / accepted) : 0)
              << '\n';

    for (const auto& node : nodes) {
        std::cout << node.node_id
                  << " rooms=" << node.active_rooms
                  << " participants=" << node.active_participants
                  << " publishers=" << node.active_publishers
                  << " cpu_mcores=" << node.estimated_cpu_millicores
                  << " mbps=" << node.estimated_mbps
                  << " draining=" << (node.draining ? "true" : "false")
                  << '\n';
    }

    return accepted == rooms ? 0 : 2;
}
