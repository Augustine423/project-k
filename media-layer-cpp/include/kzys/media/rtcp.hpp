#pragma once

#include <cstdint>
#include <optional>
#include <span>
#include <vector>

namespace kzys::media {

enum class RtcpPacketType : std::uint8_t {
    SenderReport = 200,
    ReceiverReport = 201,
    SourceDescription = 202,
    Goodbye = 203,
    ApplicationDefined = 204,
    TransportFeedback = 205,
    PayloadFeedback = 206,
    Unknown = 255,
};

enum class RtcpFeedbackKind : std::uint8_t {
    None,
    PictureLossIndication,
    FullIntraRequest,
    TransportLayerNack,
};

struct RtcpPacket {
    std::uint8_t version{2};
    std::uint8_t count_or_fmt{0};
    RtcpPacketType type{RtcpPacketType::Unknown};
    std::uint16_t length_words{0};
    std::uint32_t sender_ssrc{0};
    std::uint32_t media_ssrc{0};
    RtcpFeedbackKind feedback{RtcpFeedbackKind::None};
    std::vector<std::uint8_t> payload;
};

class RtcpCodec {
public:
    [[nodiscard]] static std::optional<RtcpPacket> parse(std::span<const std::uint8_t> bytes);
    [[nodiscard]] static std::vector<std::uint8_t> serialize(const RtcpPacket& packet);
};

} // namespace kzys::media

