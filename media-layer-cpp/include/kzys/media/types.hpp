#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace kzys::media {

enum class RoomMode {
    Interactive,
    Webinar,
};

enum class ParticipantRole {
    Host,
    CoHost,
    Publisher,
    Listener,
};

struct ParticipantIdentity {
    std::string room_id;
    std::string participant_id;
    std::string display_name;
    ParticipantRole role{ParticipantRole::Listener};
};

struct DeviceBandwidthHint {
    std::uint32_t uplink_kbps{0};
    std::uint32_t downlink_kbps{0};
    bool battery_saver{false};
    bool is_mobile{false};
    bool is_portrait{false};
};

enum class VideoProfileTier {
    Uhd1080p,
    Hd720p,
    Hd540p,
    Sd360p,
    Sd240p,
    AudioOnly,
};

struct VideoProfile {
    VideoProfileTier tier{VideoProfileTier::Uhd1080p};
    std::uint16_t width{1920};
    std::uint16_t height{1080};
    std::uint16_t fps{30};
    std::uint32_t bitrate_kbps{4500};
};

struct JoinPolicy {
    std::uint32_t max_participants{0};
    std::uint32_t max_publishers{0};
    bool allow_audio{false};
    bool allow_video{false};
    bool allow_screen_share{false};
    bool listener_only{false};
    std::uint32_t target_audio_bitrate_kbps{64};
    VideoProfile publish_video_profile{};
    VideoProfile subscribe_video_profile{};
};

struct JoinTicket {
    std::string room_id;
    std::string participant_id;
    std::string media_node_id;
    std::string signaling_token;
    JoinPolicy policy;
    RoomMode mode{RoomMode::Interactive};
};

struct RoomCapacitySnapshot {
    std::string room_id;
    std::uint32_t participant_count{0};
    std::uint32_t active_publishers{0};
    std::uint32_t active_listeners{0};
    std::uint32_t estimated_bitrate_kbps{0};
    VideoProfile active_video_profile{};
};

struct MediaNodeLoad {
    std::string node_id;
    std::uint32_t active_rooms{0};
    std::uint32_t active_participants{0};
    std::uint32_t active_publishers{0};
    std::uint32_t estimated_cpu_millicores{0};
    std::uint32_t estimated_mbps{0};
    bool draining{false};
};

struct RouteDecision {
    std::string node_id;
    bool accepted{false};
    std::string reason;
};

} // namespace kzys::media
