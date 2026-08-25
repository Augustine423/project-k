#include "kzys/media/capacity_model.hpp"

#include <algorithm>

namespace kzys::media {

namespace {

VideoProfile rotate_if_needed(VideoProfile profile, bool portrait) {
    if (!portrait || profile.tier == VideoProfileTier::AudioOnly) {
        return profile;
    }

    std::swap(profile.width, profile.height);
    return profile;
}

VideoProfile pick_profile(
    std::uint32_t bandwidth_kbps,
    std::uint16_t default_width,
    std::uint16_t default_height,
    std::uint16_t default_fps,
    bool portrait) {
    if (bandwidth_kbps == 0) {
        return rotate_if_needed(VideoProfile{
            .tier = VideoProfileTier::Uhd1080p,
            .width = default_width,
            .height = default_height,
            .fps = default_fps,
            .bitrate_kbps = 4500,
        }, portrait);
    }

    if (bandwidth_kbps < 500) {
        return rotate_if_needed(VideoProfile{
            .tier = VideoProfileTier::Sd240p,
            .width = 426,
            .height = 240,
            .fps = 12,
            .bitrate_kbps = 240,
        }, portrait);
    }
    if (bandwidth_kbps < 900) {
        return rotate_if_needed(VideoProfile{
            .tier = VideoProfileTier::Sd240p,
            .width = 426,
            .height = 240,
            .fps = 15,
            .bitrate_kbps = 320,
        }, portrait);
    }
    if (bandwidth_kbps < 1500) {
        return rotate_if_needed(VideoProfile{
            .tier = VideoProfileTier::Sd360p,
            .width = 640,
            .height = 360,
            .fps = 20,
            .bitrate_kbps = 600,
        }, portrait);
    }
    if (bandwidth_kbps < 2500) {
        return rotate_if_needed(VideoProfile{
            .tier = VideoProfileTier::Hd540p,
            .width = 960,
            .height = 540,
            .fps = 24,
            .bitrate_kbps = 1000,
        }, portrait);
    }
    if (bandwidth_kbps < 4000) {
        return rotate_if_needed(VideoProfile{
            .tier = VideoProfileTier::Hd720p,
            .width = 1280,
            .height = 720,
            .fps = 30,
            .bitrate_kbps = 1800,
        }, portrait);
    }
    return rotate_if_needed(VideoProfile{
        .tier = VideoProfileTier::Uhd1080p,
        .width = default_width,
        .height = default_height,
        .fps = default_fps,
        .bitrate_kbps = 4500,
    }, portrait);
}

} // namespace

CapacityModel::CapacityModel(CapacityConfig config) : config_(config) {}

const CapacityConfig& CapacityModel::config() const noexcept {
    return config_;
}

JoinPolicy CapacityModel::policy_for(
    RoomMode mode,
    std::uint32_t participant_count,
    const DeviceBandwidthHint& device_hint) const {
    JoinPolicy policy{};
    policy.max_participants = config_.max_participants_per_room;
    policy.target_audio_bitrate_kbps = config_.target_audio_kbps_per_publisher;

    const auto publish_profile = select_video_profile(device_hint, true);
    const auto subscribe_profile = select_video_profile(device_hint, false);
    policy.publish_video_profile = publish_profile;
    policy.subscribe_video_profile = subscribe_profile;

    if (mode == RoomMode::Webinar) {
        policy.max_publishers = config_.webinar_publishers_cap;
        policy.allow_audio = true;
        policy.allow_video = publish_profile.tier != VideoProfileTier::AudioOnly;
        policy.allow_screen_share = publish_profile.tier == VideoProfileTier::Uhd1080p
            || publish_profile.tier == VideoProfileTier::Hd720p;
        policy.listener_only = true;
        return policy;
    }

    policy.max_publishers = config_.interactive_publishers_cap;
    policy.allow_audio = true;
    policy.allow_video = publish_profile.tier != VideoProfileTier::AudioOnly;
    policy.allow_screen_share = publish_profile.tier == VideoProfileTier::Uhd1080p
        || publish_profile.tier == VideoProfileTier::Hd720p;
    policy.listener_only = participant_count >= config_.interactive_publishers_cap;
    return policy;
}

VideoProfile CapacityModel::select_video_profile(
    const DeviceBandwidthHint& device_hint,
    bool publishing) const {
    const auto budget = publishing
        ? device_hint.uplink_kbps
        : device_hint.downlink_kbps;

    auto profile = pick_profile(
        budget,
        config_.default_width,
        config_.default_height,
        config_.default_fps,
        device_hint.is_portrait && device_hint.is_mobile);

    if (device_hint.battery_saver && profile.tier != VideoProfileTier::AudioOnly) {
        profile = {
            .tier = VideoProfileTier::Sd360p,
            .width = 640,
            .height = 360,
            .fps = 15,
            .bitrate_kbps = 450,
        };
    }

    return profile;
}

std::uint32_t CapacityModel::estimate_bitrate_kbps(
    std::uint32_t publishers,
    std::uint32_t listeners,
    const VideoProfile& profile) const {
    const auto video = publishers * profile.bitrate_kbps;
    const auto audio = publishers * config_.target_audio_kbps_per_publisher;
    const auto viewer = listeners * config_.listener_kbps;
    return video + audio + viewer;
}

} // namespace kzys::media
