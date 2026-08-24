#pragma once
#include "ily/resource_manager.h"
#include "ily/resources.h"
#include <string>
#include <mutex>
#include <memory>

namespace ily {

class ITextureProducer : public IResource {
public:
    virtual ~ITextureProducer() override = default;
    virtual ResourceHandle GetTextureHandle() const = 0;
    virtual bool Update() = 0; // Updates/reloads texture, returns true if updated
};

class ColorProducer : public ITextureProducer {
private:
    ResourceManager& m_resourceManager;
    ResourceHandle m_textureHandle = ILY_INVALID_HANDLE;
    uint32_t m_color = 0xFFFFFFFF; // RGBA8
    bool m_dirty = true;
    mutable std::mutex m_mutex;

    void PackColor(uint8_t* outPixel) const {
        outPixel[0] = static_cast<uint8_t>((m_color >> 24) & 0xFF);
        outPixel[1] = static_cast<uint8_t>((m_color >> 16) & 0xFF);
        outPixel[2] = static_cast<uint8_t>((m_color >> 8) & 0xFF);
        outPixel[3] = static_cast<uint8_t>(m_color & 0xFF);
    }

public:
    ColorProducer(ResourceManager& rm, uint32_t color) 
        : m_resourceManager(rm), m_color(color) {}

    ~ColorProducer() override {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_textureHandle != ILY_INVALID_HANDLE) {
            m_resourceManager.Destroy(m_textureHandle);
        }
    }

    ResourceType GetType() const override { return ResourceType::Producer; }

    ResourceHandle GetTextureHandle() const override {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_textureHandle;
    }

    void SetColor(uint32_t color) {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_color != color) {
            m_color = color;
            m_dirty = true;
        }
    }

    bool Update() override {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_dirty) {
            if (m_textureHandle == ILY_INVALID_HANDLE) {
                // Create a 1x1 solid color texture on the GPU
                uint8_t pixel[4];
                PackColor(pixel);
                const bgfx::Memory* mem = bgfx::copy(pixel, sizeof(pixel));
                bgfx::TextureHandle handle = bgfx::createTexture2D(
                    1, 1, false, 1,
                    bgfx::TextureFormat::RGBA8,
                    BGFX_TEXTURE_NONE | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP,
                    mem
                );
                auto texResource = std::make_shared<TextureResource>(1, 1, bgfx::TextureFormat::RGBA8, handle);
                m_textureHandle = m_resourceManager.Create(ResourceType::Texture, texResource);
            } else {
                // Update existing texture
                auto tex = m_resourceManager.GetAs<TextureResource>(m_textureHandle);
                if (tex) {
                    uint8_t pixel[4];
                    PackColor(pixel);
                    const bgfx::Memory* mem = bgfx::copy(pixel, sizeof(pixel));
                    bgfx::updateTexture2D(
                        tex->GetHandle(),
                        0, 0, 0, 0, 1, 1,
                        mem
                    );
                }
            }
            m_dirty = false;
            return true;
        }
        return false;
    }
};

class ImageProducer : public ITextureProducer {
private:
    ResourceManager& m_resourceManager;
    ResourceHandle m_textureHandle = ILY_INVALID_HANDLE;
    std::string m_filePath;
    bool m_dirty = true;
    mutable std::mutex m_mutex;

public:
    ImageProducer(ResourceManager& rm, const std::string& filePath) 
        : m_resourceManager(rm), m_filePath(filePath) {}

    ~ImageProducer() override {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_textureHandle != ILY_INVALID_HANDLE) {
            m_resourceManager.Destroy(m_textureHandle);
        }
    }

    ResourceType GetType() const override { return ResourceType::Producer; }

    ResourceHandle GetTextureHandle() const override {
        std::lock_guard<std::mutex> lock(m_mutex);
        return m_textureHandle;
    }

    void SetFilePath(const std::string& filePath) {
        std::lock_guard<std::mutex> lock(m_mutex);
        if (m_filePath != filePath) {
            m_filePath = filePath;
            m_dirty = true;
        }
    }

    bool Update() override;
};

} // namespace ily
