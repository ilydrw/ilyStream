#include "native_window.h"

#include <iostream>

int main() {
    std::string error;
    if (ily::ui::RunNativeWindow(ily::ui::CreateInitialState(), error)) return 0;
    std::cerr << "Native UI could not start: " << error << '\n';
    return 1;
}
