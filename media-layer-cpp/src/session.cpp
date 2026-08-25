#include <algorithm>
#include "kzys/media/session.hpp"

#include <utility>

namespace kzys::media {

MediaSession::MediaSession(CapacityModel model)
    : model_(std::move(model)), ticket_builder_(model_) {}

void MediaSession::set_room(std::string room_id, RoomMode mode) {
    room_id_ = std::move(room_id);
    mode_ = mode;
}

const std::string& MediaSession::room_id() const noexcept {
    return room_id_;
}

RoomMode MediaSession::mode() const noexcept {
    return mode_;
}

JoinTicket MediaSession::join(
    const ParticipantIdentity& identity,
    const std::string& media_node_id,
    const DeviceBandwidthHint& device_hint) {
    if (room_id_.empty()) {
        room_id_ = identity.room_id;
    }

    auto ticket = ticket_builder_.build(
        identity,
        mode_,
        media_node_id,
        static_cast<std::uint32_t>(participants_.size() + 1),
        static_cast<std::uint32_t>(std::count_if(participants_.begin(), participants_.end(), [](const auto& entry) {
            return entry.second.publishing;
        })),
        static_cast<std::uint32_t>(participants_.size()),
        device_hint);

    ParticipantState state{};
    state.identity = identity;
    state.hint = device_hint;
    state.publish_profile = ticket.policy.publish_video_profile;
    state.subscribe_profile = ticket.policy.subscribe_video_profile;
    state.publishing = !ticket.policy.listener_only && identity.role != ParticipantRole::Listener;
    participants_[identity.participant_id] = state;
    return ticket;
}

void MediaSession::leave(const std::string& participant_id) {
    participants_.erase(participant_id);
}

void MediaSession::update_bandwidth(const std::string& participant_id, DeviceBandwidthHint device_hint) {
    auto it = participants_.find(participant_id);
    if (it == participants_.end()) return;
    it->second.hint = device_hint;
    it->second.publish_profile = model_.select_video_profile(device_hint, true);
    it->second.subscribe_profile = model_.select_video_profile(device_hint, false);
    it->second.publishing = it->second.publishing && it->second.publish_profile.tier != VideoProfileTier::AudioOnly;
}

std::optional<VideoProfile> MediaSession::profile_for(const std::string& participant_id) const {
    auto it = participants_.find(participant_id);
    if (it == participants_.end()) return std::nullopt;
    return it->second.publish_profile;
}

MediaSessionStats MediaSession::snapshot() const {
    MediaSessionStats stats{};
    stats.room_id = room_id_;
    stats.participants = static_cast<std::uint32_t>(participants_.size());

    std::uint32_t publishers = 0;
    std::uint32_t listeners = 0;
    std::uint32_t max_width = 0;
    std::uint32_t max_height = 0;
    std::uint32_t max_bitrate = 0;
    for (const auto& [_, participant] : participants_) {
        if (participant.publishing) {
            ++publishers;
            max_width = std::max<std::uint32_t>(max_width, participant.publish_profile.width);
            max_height = std::max<std::uint32_t>(max_height, participant.publish_profile.height);
            max_bitrate = std::max<std::uint32_t>(max_bitrate, participant.publish_profile.bitrate_kbps);
        } else {
            ++listeners;
        }
    }

    stats.publishers = publishers;
    stats.listeners = listeners;
    stats.active_video_profile = VideoProfile{
        .tier = max_width >= 1920 ? VideoProfileTier::Uhd1080p
            : max_width >= 1280 ? VideoProfileTier::Hd720p
            : max_width >= 960 ? VideoProfileTier::Hd540p
            : max_width >= 640 ? VideoProfileTier::Sd360p
            : VideoProfileTier::Sd240p,
        .width = static_cast<std::uint16_t>(max_width),
        .height = static_cast<std::uint16_t>(max_height),
        .fps = 30,
        .bitrate_kbps = max_bitrate,
    };
    stats.estimated_bitrate_kbps = model_.estimate_bitrate_kbps(
        publishers,
        listeners,
        stats.active_video_profile);
    stats.inbound_rtp_packets = inbound_rtp_packets_;
    stats.outbound_rtp_packets = outbound_rtp_packets_;
    stats.dropped_packets = dropped_packets_;
    return stats;
}

std::optional<RtpPacket> MediaSession::ingest_rtp(
    const std::string& participant_id,
    const RtpPacket& packet) {
    auto it = participants_.find(participant_id);
    if (it == participants_.end()) {
        ++dropped_packets_;
        return std::nullopt;
    }

    ++inbound_rtp_packets_;
    if (!it->second.publishing) {
        ++dropped_packets_;
        return std::nullopt;
    }

    auto outgoing = packet;
    outgoing.payload_type = packet.payload_type;
    ++outbound_rtp_packets_;
    return outgoing;
}

std::optional<RtcpPacket> MediaSession::ingest_rtcp(
    const std::string& participant_id,
    const RtcpPacket& packet) {
    if (participants_.find(participant_id) == participants_.end()) {
        ++dropped_packets_;
        return std::nullopt;
    }

    switch (packet.feedback) {
        case RtcpFeedbackKind::PictureLossIndication:
        case RtcpFeedbackKind::FullIntraRequest:
        case RtcpFeedbackKind::TransportLayerNack:
            ++outbound_rtp_packets_;
            break;
        case RtcpFeedbackKind::None:
            break;
    }

    return packet;
}

JoinTicketBuilder& MediaSession::builder() {
    return ticket_builder_;
}

const JoinTicketBuilder& MediaSession::builder() const {
    return ticket_builder_;
}

} // namespace kzys::media
