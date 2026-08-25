#pragma once

#include "capacity_model.hpp"

namespace kzys::media {

class JoinTicketBuilder {
public:
    explicit JoinTicketBuilder(CapacityModel model);

    [[nodiscard]] JoinTicket build(
        const ParticipantIdentity& identity,
        RoomMode mode,
        const std::string& media_node_id,
        std::uint32_t participant_count,
        std::uint32_t active_publishers,
        std::uint32_t active_listeners,
        const DeviceBandwidthHint& device_hint = {}) const;

private:
    CapacityModel model_;
};

} // namespace kzys::media
