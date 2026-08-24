#define STB_IMAGE_IMPLEMENTATION
#include <stb_image.h>
#include "ily/texture_producer.h"
#include <iostream>

namespace ily {

bool ImageProducer::Update() {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_dirty) {
        return false;
    }

    int width = 0;
    int height = 0;
    int channels = 0;

    // Load as 4 channels (RGBA8)
    unsigned char* pixelData = stbi_load(m_filePath.c_str(), &width, &height, &channels, 4);
    if (!pixelData) {
        // Log error and return false
        std::cerr << "[ImageProducer] Failed to load image: " << m_filePath << std::endl;
        return false;
    }

    // Copy to bgfx memory block
    const bgfx::Memory* mem = bgfx::copy(pixelData, width * height * 4);
    stbi_image_free(pixelData);

    if (m_textureHandle != ILY_INVALID_HANDLE) {
        auto tex = m_resourceManager.GetAs<TextureResource>(m_textureHandle);
        if (tex && tex->GetWidth() == static_cast<uint32_t>(width) && tex->GetHeight() == static_cast<uint32_t>(height)) {
            // Update texture on GPU
            bgfx::updateTexture2D(
                tex->GetHandle(),
                0, 0, 0, 0,
                static_cast<uint16_t>(width),
                static_cast<uint16_t>(height),
                mem
            );
        } else {
            // Destroy and recreate because size changed
            m_resourceManager.Destroy(m_textureHandle);
            bgfx::TextureHandle handle = bgfx::createTexture2D(
                static_cast<uint16_t>(width),
                static_cast<uint16_t>(height),
                false, 1,
                bgfx::TextureFormat::RGBA8,
                BGFX_TEXTURE_NONE | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP,
                mem
            );
            auto texResource = std::make_shared<TextureResource>(width, height, bgfx::TextureFormat::RGBA8, handle);
            m_textureHandle = m_resourceManager.Create(ResourceType::Texture, texResource);
        }
    } else {
        // Create new texture on GPU
        bgfx::TextureHandle handle = bgfx::createTexture2D(
            static_cast<uint16_t>(width),
            static_cast<uint16_t>(height),
            false, 1,
            bgfx::TextureFormat::RGBA8,
            BGFX_TEXTURE_NONE | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP,
            mem
        );
        auto texResource = std::make_shared<TextureResource>(width, height, bgfx::TextureFormat::RGBA8, handle);
        m_textureHandle = m_resourceManager.Create(ResourceType::Texture, texResource);
    }

    m_dirty = false;
    return true;
}

} // namespace ily
