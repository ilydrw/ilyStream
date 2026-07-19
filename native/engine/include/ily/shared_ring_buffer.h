#pragma once
#include <cstdint>
#include <atomic>

namespace ily {

constexpr uint32_t RING_BUFFER_SLOTS = 3;
// 4K BGRA: 3840 * 2160 * 4 = 33,177,600 bytes
constexpr uint32_t MAX_FRAME_BYTES = 3840 * 2160 * 4;

struct FrameSlot {
    std::atomic<uint64_t> sequence;
    uint32_t width;
    uint32_t height;
    uint64_t timestamp_ns;
    // Align pixels to 16 bytes for SIMD friendliness
    alignas(16) uint8_t pixels[MAX_FRAME_BYTES];
};

struct SharedRingBuffer {
    std::atomic<uint64_t> writeSequence;
    FrameSlot slots[RING_BUFFER_SLOTS];
};

} // namespace ily
