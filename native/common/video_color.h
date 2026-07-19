#pragma once

#include <algorithm>
#include <cstdint>

namespace ily::color {

struct Yuv8 {
    uint8_t y;
    uint8_t u;
    uint8_t v;
};

inline int RoundShift16(int value) {
    return value >= 0
        ? (value + 32768) >> 16
        : -(((-value) + 32768) >> 16);
}

inline uint8_t ClampByte(int value) {
    return static_cast<uint8_t>(std::clamp(value, 0, 255));
}

inline uint8_t Bt709LimitedY(uint8_t red, uint8_t green, uint8_t blue) {
    return ClampByte(16 + RoundShift16(
        11966 * static_cast<int>(red) +
        40254 * static_cast<int>(green) +
        4064 * static_cast<int>(blue)));
}

inline void Bt709LimitedChroma(
    uint8_t red,
    uint8_t green,
    uint8_t blue,
    uint8_t* outU,
    uint8_t* outV) {
    if (outU) {
        *outU = ClampByte(128 + RoundShift16(
            -6596 * static_cast<int>(red) -
            22189 * static_cast<int>(green) +
            28785 * static_cast<int>(blue)));
    }
    if (outV) {
        *outV = ClampByte(128 + RoundShift16(
            28785 * static_cast<int>(red) -
            26145 * static_cast<int>(green) -
            2640 * static_cast<int>(blue)));
    }
}

inline Yuv8 RgbToBt709Limited(uint8_t red, uint8_t green, uint8_t blue) {
    Yuv8 result{Bt709LimitedY(red, green, blue), 128, 128};
    Bt709LimitedChroma(red, green, blue, &result.u, &result.v);
    return result;
}

} // namespace ily::color
