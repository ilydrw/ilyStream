#pragma once
#include "ily/resource_manager.h"
#include <bgfx/bgfx.h>

namespace ily {

class TextureResource : public IResource {
private:
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    bgfx::TextureFormat::Enum m_format = bgfx::TextureFormat::RGBA8;
    bgfx::TextureHandle m_handle = BGFX_INVALID_HANDLE;
    IlyColorDescription m_color = IlySrgbFullColor();
    IlyAlphaMode m_alphaMode = ILY_ALPHA_STRAIGHT;
    float m_sdrWhiteNits = 0.0f;

public:
    TextureResource(
        uint32_t width,
        uint32_t height,
        bgfx::TextureFormat::Enum format,
        bgfx::TextureHandle handle,
        IlyColorDescription color = IlySrgbFullColor(),
        IlyAlphaMode alphaMode = ILY_ALPHA_STRAIGHT,
        float sdrWhiteNits = 0.0f)
        : m_width(width),
          m_height(height),
          m_format(format),
          m_handle(handle),
          m_color(color),
          m_alphaMode(alphaMode),
          m_sdrWhiteNits(sdrWhiteNits) {}

    ~TextureResource() override {
        if (bgfx::isValid(m_handle)) {
            bgfx::destroy(m_handle);
        }
    }

    ResourceType GetType() const override { return ResourceType::Texture; }

    uint32_t GetWidth() const { return m_width; }
    uint32_t GetHeight() const { return m_height; }
    bgfx::TextureFormat::Enum GetFormat() const { return m_format; }
    bgfx::TextureHandle GetHandle() const { return m_handle; }
    const IlyColorDescription& GetColorDescription() const { return m_color; }
    IlyAlphaMode GetAlphaMode() const { return m_alphaMode; }
    float GetSdrWhiteNits() const { return m_sdrWhiteNits; }
};

class ShaderResource : public IResource {
private:
    bgfx::ProgramHandle m_program = BGFX_INVALID_HANDLE;

public:
    ShaderResource(bgfx::ProgramHandle program) : m_program(program) {}

    ~ShaderResource() override {
        if (bgfx::isValid(m_program)) {
            bgfx::destroy(m_program);
        }
    }

    ResourceType GetType() const override { return ResourceType::Shader; }

    bgfx::ProgramHandle GetProgram() const { return m_program; }
};

} // namespace ily
