#pragma once

#include <cstdint>
#include <optional>
#include <span>
#include <vector>

namespace kzys::media {

struct RtpPacket {
    std::uint8_t version{2};
    bool padding{false};
    bool extension{false};
    std::uint8_t csrc_count{0};
    bool marker{false};
    std::uint8_t payload_type{0};
    std::uint16_t sequence_number{0};
    std::uint32_t timestamp{0};
    std::uint32_t ssrc{0};
    std::vector<std::uint8_t> payload;
};

class RtpCodec {
public:
    [[nodiscard]] static std::optional<RtpPacket> parse(std::span<const std::uint8_t> bytes);
    [[nodiscard]] static std::vector<std::uint8_t> serialize(const RtpPacket& packet);
};

} // namespace kzys::media

