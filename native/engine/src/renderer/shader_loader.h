#pragma once
#include <bgfx/bgfx.h>
#include <string>
#include <vector>

namespace ily {

// Helper to compile/load the textured quad sprite shader program
bgfx::ProgramHandle CreateSpriteProgram();

} // namespace ily
