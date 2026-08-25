#pragma once

#include "capacity_model.hpp"
#include "join_ticket.hpp"
#include "rtcp.hpp"
#include "rtp.hpp"

#include <string>
#include <unordered_map>

namespace kzys::media {

struct MediaSessionStats {
    std::string room_id;
    std::uint32_t participants{0};
    std::uint32_t publishers{0};
    std::uint32_t listeners{0};
    std::uint32_t estimated_bitrate_kbps{0};
    VideoProfile active_video_profile{};
    std::uint64_t inbound_rtp_packets{0};
    std::uint64_t outbound_rtp_packets{0};
    std::uint64_t dropped_packets{0};
};

class MediaSession {
public:
    explicit MediaSession(CapacityModel model);

    void set_room(std::string room_id, RoomMode mode);
    [[nodiscard]] const std::string& room_id() const noexcept;
    [[nodiscard]] RoomMode mode() const noexcept;

    [[nodiscard]] JoinTicket join(
        const ParticipantIdentity& identity,
        const std::string& media_node_id,
        const DeviceBandwidthHint& device_hint = {});

    void leave(const std::string& participant_id);
    void update_bandwidth(const std::string& participant_id, DeviceBandwidthHint device_hint);

    [[nodiscard]] std::optional<VideoProfile> profile_for(const std::string& participant_id) const;
    [[nodiscard]] MediaSessionStats snapshot() const;

    [[nodiscard]] std::optional<RtpPacket> ingest_rtp(
        const std::string& participant_id,
        const RtpPacket& packet);

    [[nodiscard]] std::optional<RtcpPacket> ingest_rtcp(
        const std::string& participant_id,
        const RtcpPacket& packet);

private:
    struct ParticipantState {
        ParticipantIdentity identity;
        DeviceBandwidthHint hint;
        VideoProfile publish_profile{};
        VideoProfile subscribe_profile{};
        bool publishing{false};
    };

    [[nodiscard]] JoinTicketBuilder& builder();
    [[nodiscard]] const JoinTicketBuilder& builder() const;

    CapacityModel model_;
    JoinTicketBuilder ticket_builder_;
    std::string room_id_;
    RoomMode mode_{RoomMode::Interactive};
    std::unordered_map<std::string, ParticipantState> participants_;
    std::uint64_t inbound_rtp_packets_{0};
    std::uint64_t outbound_rtp_packets_{0};
    std::uint64_t dropped_packets_{0};
};

} // namespace kzys::media

