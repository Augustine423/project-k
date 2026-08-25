#pragma once

#include "types.hpp"

namespace kzys::media {

struct CapacityConfig {
    std::uint32_t max_participants_per_room{5000};
    std::uint32_t interactive_publishers_cap{5000};
    std::uint32_t webinar_publishers_cap{20};
    std::uint32_t target_video_kbps_per_publisher{900};
    std::uint32_t target_audio_kbps_per_publisher{64};
    std::uint32_t listener_kbps{20};
    std::uint16_t default_width{1920};
    std::uint16_t default_height{1080};
    std::uint16_t default_fps{30};
};

class CapacityModel {
public:
    explicit CapacityModel(CapacityConfig config);

    [[nodiscard]] const CapacityConfig& config() const noexcept;

    [[nodiscard]] JoinPolicy policy_for(
        RoomMode mode,
        std::uint32_t participant_count,
        const DeviceBandwidthHint& device_hint = {}) const;

    [[nodiscard]] VideoProfile select_video_profile(
        const DeviceBandwidthHint& device_hint,
        bool publishing) const;

    [[nodiscard]] std::uint32_t estimate_bitrate_kbps(
        std::uint32_t publishers,
        std::uint32_t listeners,
        const VideoProfile& profile) const;

private:
    CapacityConfig config_;
};

} // namespace kzys::media
