#include "kzys/media/join_ticket.hpp"

#include <utility>

namespace kzys::media {

JoinTicketBuilder::JoinTicketBuilder(CapacityModel model) : model_(std::move(model)) {}

JoinTicket JoinTicketBuilder::build(
    const ParticipantIdentity& identity,
    RoomMode mode,
    const std::string& media_node_id,
    std::uint32_t participant_count,
    std::uint32_t active_publishers,
    std::uint32_t active_listeners,
    const DeviceBandwidthHint& device_hint) const {
    auto policy = model_.policy_for(mode, participant_count, device_hint);
    policy.listener_only = policy.listener_only || identity.role == ParticipantRole::Listener;
    policy.publish_video_profile = model_.select_video_profile(device_hint, true);
    policy.subscribe_video_profile = model_.select_video_profile(device_hint, false);
    if (device_hint.uplink_kbps > 0 && device_hint.uplink_kbps < 500
        && identity.role != ParticipantRole::Host
        && identity.role != ParticipantRole::CoHost) {
        policy.listener_only = true;
        policy.allow_video = false;
    }

    JoinTicket ticket{};
    ticket.room_id = identity.room_id;
    ticket.participant_id = identity.participant_id;
    ticket.media_node_id = media_node_id;
    ticket.signaling_token = identity.room_id + ":" + identity.participant_id;
    ticket.policy = policy;
    ticket.mode = mode;
    (void)active_publishers;
    (void)active_listeners;
    return ticket;
}

} // namespace kzys::media

