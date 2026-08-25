#include "kzys/media/rtp.hpp"

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

void write_u16(std::vector<std::uint8_t>& out, std::uint16_t value) {
    out.push_back(static_cast<std::uint8_t>((value >> 8) & 0xff));
    out.push_back(static_cast<std::uint8_t>(value & 0xff));
}

void write_u32(std::vector<std::uint8_t>& out, std::uint32_t value) {
    out.push_back(static_cast<std::uint8_t>((value >> 24) & 0xff));
    out.push_back(static_cast<std::uint8_t>((value >> 16) & 0xff));
    out.push_back(static_cast<std::uint8_t>((value >> 8) & 0xff));
    out.push_back(static_cast<std::uint8_t>(value & 0xff));
}

} // namespace

std::optional<RtpPacket> RtpCodec::parse(std::span<const std::uint8_t> bytes) {
    if (bytes.size() < 12) return std::nullopt;

    const auto b0 = bytes[0];
    const auto b1 = bytes[1];
    RtpPacket packet{};
    packet.version = static_cast<std::uint8_t>((b0 >> 6) & 0x03);
    if (packet.version != 2) return std::nullopt;

    packet.padding = (b0 & 0x20) != 0;
    packet.extension = (b0 & 0x10) != 0;
    packet.csrc_count = static_cast<std::uint8_t>(b0 & 0x0f);
    packet.marker = (b1 & 0x80) != 0;
    packet.payload_type = static_cast<std::uint8_t>(b1 & 0x7f);
    packet.sequence_number = read_u16(bytes.data() + 2);
    packet.timestamp = read_u32(bytes.data() + 4);
    packet.ssrc = read_u32(bytes.data() + 8);

    std::size_t header_size = 12 + static_cast<std::size_t>(packet.csrc_count) * 4;
    if (bytes.size() < header_size) return std::nullopt;

    if (packet.extension) {
        if (bytes.size() < header_size + 4) return std::nullopt;
        const auto ext_length_words = read_u16(bytes.data() + header_size + 2);
        header_size += 4 + static_cast<std::size_t>(ext_length_words) * 4;
        if (bytes.size() < header_size) return std::nullopt;
    }

    packet.payload.assign(bytes.begin() + static_cast<std::ptrdiff_t>(header_size), bytes.end());
    return packet;
}

std::vector<std::uint8_t> RtpCodec::serialize(const RtpPacket& packet) {
    std::vector<std::uint8_t> out;
    out.reserve(12 + packet.payload.size());

    std::uint8_t b0 = static_cast<std::uint8_t>((packet.version & 0x03) << 6);
    if (packet.padding) b0 |= 0x20;
    if (packet.extension) b0 |= 0x10;
    b0 |= static_cast<std::uint8_t>(packet.csrc_count & 0x0f);

    std::uint8_t b1 = static_cast<std::uint8_t>(packet.payload_type & 0x7f);
    if (packet.marker) b1 |= 0x80;

    out.push_back(b0);
    out.push_back(b1);
    write_u16(out, packet.sequence_number);
    write_u32(out, packet.timestamp);
    write_u32(out, packet.ssrc);
    out.insert(out.end(), packet.payload.begin(), packet.payload.end());
    return out;
}

} // namespace kzys::media
