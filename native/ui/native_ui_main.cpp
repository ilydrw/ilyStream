#include "native_window.h"

#include <cstdlib>
#include <cstdint>
#include <iostream>
#include <string>

namespace {

std::uint32_t ReadCount(int argc, char** argv, const char* key) {
    const std::string prefix = std::string("--") + key + "=";
    for (int index = 1; index < argc; ++index) {
        const std::string argument = argv[index] ? argv[index] : "";
        if (argument.rfind(prefix, 0) != 0) continue;
        char* end = nullptr;
        const unsigned long value = std::strtoul(argument.c_str() + prefix.size(), &end, 10);
        if (end && *end == '\0' && value <= 1000) return static_cast<std::uint32_t>(value);
    }
    return 0;
}

} // namespace

int main(int argc, char** argv) {
    auto state = ily::ui::CreateInitialState();
    state.connectedServices = ReadCount(argc, argv, "connected");
    state.readyServices = ReadCount(argc, argv, "ready");
    state.needsReview = ReadCount(argc, argv, "review");
    state.realTraffic = ReadCount(argc, argv, "traffic");
    std::string error;
    if (ily::ui::RunNativeWindow(state, error)) return 0;
    std::cerr << "Native UI could not start: " << error << '\n';
    return 1;
}
