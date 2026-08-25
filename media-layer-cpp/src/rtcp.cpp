#include "kzys/media/rtcp.hpp"

#include <cstddef>
#include <algorithm>

namespace kzys::media {

namespace {

std::uint16_t read_u16(const std::uint8_t* data) {
    return static_cast<std::uint16_t>((static_cast<std::uint16_t>(data[0]) << 8) | data[1]);
}

std::uint32_t read_u32(const std::uint8_t* data) {
    return (static_cast<std::uint32_t>(data[0]) << 24)
        | (static_cast<std::uint32_t>(data[1]) << 16)
        | (static_cast<std::uint32_t>(data[2]) << 8)
        | static_cast<std::uint32_t>(data[3]);
}

RtcpFeedbackKind feedback_kind_for(std::uint8_t count_or_fmt, RtcpPacketType type) {
    if (type == RtcpPacketType::PayloadFeedback) {
        if (count_or_fmt == 1) return RtcpFeedbackKind::PictureLossIndication;
        if (count_or_fmt == 4) return RtcpFeedbackKind::FullIntraRequest;
    }
    if (type == RtcpPacketType::TransportFeedback && count_or_fmt == 1) {
        return RtcpFeedbackKind::TransportLayerNack;
    }
    return RtcpFeedbackKind::None;
}

} // namespace

std::optional<RtcpPacket> RtcpCodec::parse(std::span<const std::uint8_t> bytes) {
    if (bytes.size() < 8) return std::nullopt;
    const auto b0 = bytes[0];
    const auto b1 = bytes[1];
    RtcpPacket packet{};
    packet.version = static_cast<std::uint8_t>((b0 >> 6) & 0x03);
    if (packet.version != 2) return std::nullopt;
    packet.count_or_fmt = static_cast<std::uint8_t>(b0 & 0x1f);
    packet.type = static_cast<RtcpPacketType>(b1);
    packet.length_words = read_u16(bytes.data() + 2);
    packet.sender_ssrc = read_u32(bytes.data() + 4);
    packet.feedback = feedback_kind_for(packet.count_or_fmt, packet.type);

    const auto declared_bytes = static_cast<std::size_t>(packet.length_words + 1) * 4;
    if (bytes.size() < declared_bytes) return std::nullopt;

    if (declared_bytes > 8) {
        packet.payload.assign(
            bytes.begin() + 8,
            bytes.begin() + static_cast<std::ptrdiff_t>(declared_bytes));
        if (packet.payload.size() >= 4) {
            packet.media_ssrc = read_u32(packet.payload.data());
        }
    }

    return packet;
}

std::vector<std::uint8_t> RtcpCodec::serialize(const RtcpPacket& packet) {
    const auto payload_size = packet.payload.size();
    const auto padded_payload_size = (payload_size + 3) & ~static_cast<std::size_t>(3);
    const auto total_size = 8 + padded_payload_size;
    const auto words = static_cast<std::uint16_t>((total_size / 4) - 1);
    std::vector<std::uint8_t> out(total_size, 0);

    std::uint8_t b0 = static_cast<std::uint8_t>((packet.version & 0x03) << 6);
    b0 |= static_cast<std::uint8_t>(packet.count_or_fmt & 0x1f);
    out[0] = b0;
    out[1] = static_cast<std::uint8_t>(packet.type);
    out[2] = static_cast<std::uint8_t>((words >> 8) & 0xff);
    out[3] = static_cast<std::uint8_t>(words & 0xff);
    out[4] = static_cast<std::uint8_t>((packet.sender_ssrc >> 24) & 0xff);
    out[5] = static_cast<std::uint8_t>((packet.sender_ssrc >> 16) & 0xff);
    out[6] = static_cast<std::uint8_t>((packet.sender_ssrc >> 8) & 0xff);
    out[7] = static_cast<std::uint8_t>(packet.sender_ssrc & 0xff);
    std::copy(packet.payload.begin(), packet.payload.end(), out.begin() + 8);
    return out;
}

} // namespace kzys::media
