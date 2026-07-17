#include "shader_loader.h"
#include <iostream>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#include <d3dcommon.h>

typedef HRESULT (WINAPI *pfn_D3DCompile)(
    LPCVOID pSrcData,
    SIZE_T SrcDataSize,
    LPCSTR pSourceName,
    const void* pDefines, // D3D_SHADER_MACRO
    void* pInclude,       // ID3DInclude
    LPCSTR pEntryPoint,
    LPCSTR pTarget,
    UINT Flags1,
    UINT Flags2,
    ID3DBlob** ppCode,
    ID3DBlob** ppErrorMsgs
);

static std::vector<uint8_t> CompileHLSL(const std::string& source, const std::string& entryPoint, const std::string& target) {
    HMODULE d3dcompiler = LoadLibraryA("d3dcompiler_47.dll");
    if (!d3dcompiler) {
        d3dcompiler = LoadLibraryA("d3dcompiler.dll");
    }
    if (!d3dcompiler) {
        std::cerr << "[ShaderLoader] Failed to load d3dcompiler DLL" << std::endl;
        return {};
    }

    auto pD3DCompile = (pfn_D3DCompile)GetProcAddress(d3dcompiler, "D3DCompile");
    if (!pD3DCompile) {
        std::cerr << "[ShaderLoader] Failed to get D3DCompile proc address" << std::endl;
        FreeLibrary(d3dcompiler);
        return {};
    }

    ID3DBlob* codeBlob = nullptr;
    ID3DBlob* errorBlob = nullptr;
    HRESULT hr = pD3DCompile(
        source.c_str(),
        source.size(),
        nullptr,
        nullptr,
        nullptr,
        entryPoint.c_str(),
        target.c_str(),
        1 << 15, // D3DCOMPILE_OPTIMIZATION_LEVEL3
        0,
        &codeBlob,
        &errorBlob
    );

    if (FAILED(hr)) {
        if (errorBlob) {
            std::string errStr((char*)errorBlob->GetBufferPointer(), errorBlob->GetBufferSize());
            std::cerr << "[ShaderLoader] HLSL compilation failed: " << errStr << std::endl;
            errorBlob->Release();
        } else {
            std::cerr << "[ShaderLoader] HLSL compilation failed with HRESULT: " << hr << std::endl;
        }
        FreeLibrary(d3dcompiler);
        return {};
    }

    std::vector<uint8_t> bytecode;
    if (codeBlob) {
        bytecode.assign((uint8_t*)codeBlob->GetBufferPointer(), (uint8_t*)codeBlob->GetBufferPointer() + codeBlob->GetBufferSize());
        codeBlob->Release();
    }

    if (errorBlob) {
        errorBlob->Release();
    }
    FreeLibrary(d3dcompiler);
    return bytecode;
}

static std::vector<uint8_t> BuildBgfxShaderBinary(const std::vector<uint8_t>& dxbcBytecode, bool isFragmentShader) {
    std::vector<uint8_t> binary;
    
    // Magic: VSH version 11 or FSH version 11
    uint32_t magic = isFragmentShader ? 0x0B485346 : 0x0B485356;
    binary.insert(binary.end(), (uint8_t*)&magic, (uint8_t*)&magic + 4);
    
    // hashIn (4 bytes)
    uint32_t hashIn = 0;
    binary.insert(binary.end(), (uint8_t*)&hashIn, (uint8_t*)&hashIn + 4);
    
    // hashOut (4 bytes)
    uint32_t hashOut = 0;
    binary.insert(binary.end(), (uint8_t*)&hashOut, (uint8_t*)&hashOut + 4);
    
    // count (2 bytes)
    uint16_t count = isFragmentShader ? 1 : 0;
    binary.insert(binary.end(), (uint8_t*)&count, (uint8_t*)&count + 2);
    
    if (isFragmentShader) {
        // Uniform 0: "s_texColor"
        uint8_t nameSize = 10;
        binary.push_back(nameSize);
        
        const char* name = "s_texColor";
        binary.insert(binary.end(), name, name + nameSize);
        
        // type (1 byte) -> Sampler (0) | kUniformSamplerBit (0x20) | kUniformFragmentBit (0x10) = 0x30
        uint8_t type = 0x30;
        binary.push_back(type);
        
        // num (1 byte)
        uint8_t num = 1;
        binary.push_back(num);
        
        // regIndex (2 bytes)
        uint16_t regIndex = 0;
        binary.insert(binary.end(), (uint8_t*)&regIndex, (uint8_t*)&regIndex + 2);
        
        // regCount (2 bytes)
        uint16_t regCount = 1;
        binary.insert(binary.end(), (uint8_t*)&regCount, (uint8_t*)&regCount + 2);
        
        // texInfo (2 bytes)
        uint16_t texInfo = 0;
        binary.insert(binary.end(), (uint8_t*)&texInfo, (uint8_t*)&texInfo + 2);
        
        // texFormat (2 bytes)
        uint16_t texFormat = 0;
        binary.insert(binary.end(), (uint8_t*)&texFormat, (uint8_t*)&texFormat + 2);
    }
    
    // shaderSize (4 bytes)
    uint32_t shaderSize = static_cast<uint32_t>(dxbcBytecode.size());
    binary.insert(binary.end(), (uint8_t*)&shaderSize, (uint8_t*)&shaderSize + 4);
    
    // shaderCode (shaderSize bytes)
    binary.insert(binary.end(), dxbcBytecode.begin(), dxbcBytecode.end());
    
    return binary;
}
#endif

namespace ily {

bgfx::ProgramHandle CreateSpriteProgram() {
#ifdef _WIN32
    std::string vsSource = R"(
        struct VS_INPUT {
            float3 pos : POSITION;
            float2 texcoord0 : TEXCOORD0;
            float4 color : COLOR0;
        };

        struct VS_OUTPUT {
            float4 pos : SV_POSITION;
            float2 texcoord0 : TEXCOORD0;
            float4 color : COLOR0;
        };

        VS_OUTPUT main(VS_INPUT input) {
            VS_OUTPUT output;
            output.pos = float4(input.pos, 1.0);
            output.texcoord0 = input.texcoord0;
            output.color = input.color;
            return output;
        }
    )";

    std::string fsSource = R"(
        Texture2D s_texColor : register(t0);
        SamplerState s_texColorSampler : register(s0);

        struct PS_INPUT {
            float4 pos : SV_POSITION;
            float2 texcoord0 : TEXCOORD0;
            float4 color : COLOR0;
        };

        float4 main(PS_INPUT input) : SV_TARGET {
            return s_texColor.Sample(s_texColorSampler, input.texcoord0) * input.color;
        }
    )";

    auto vsBytecode = CompileHLSL(vsSource, "main", "vs_4_0");
    auto fsBytecode = CompileHLSL(fsSource, "main", "ps_4_0");

    if (vsBytecode.empty() || fsBytecode.empty()) {
        std::cerr << "[ShaderLoader] Failed to compile HLSL bytecode" << std::endl;
        return BGFX_INVALID_HANDLE;
    }

    auto vsBgfx = BuildBgfxShaderBinary(vsBytecode, false);
    auto fsBgfx = BuildBgfxShaderBinary(fsBytecode, true);

    const bgfx::Memory* vsMem = bgfx::copy(vsBgfx.data(), static_cast<uint32_t>(vsBgfx.size()));
    const bgfx::Memory* fsMem = bgfx::copy(fsBgfx.data(), static_cast<uint32_t>(fsBgfx.size()));

    bgfx::ShaderHandle vsh = bgfx::createShader(vsMem);
    bgfx::ShaderHandle fsh = bgfx::createShader(fsMem);

    if (!bgfx::isValid(vsh) || !bgfx::isValid(fsh)) {
        std::cerr << "[ShaderLoader] Failed to create bgfx shader handles" << std::endl;
        return BGFX_INVALID_HANDLE;
    }

    bgfx::ProgramHandle program = bgfx::createProgram(vsh, fsh, true);
    if (!bgfx::isValid(program)) {
        std::cerr << "[ShaderLoader] Failed to create bgfx program" << std::endl;
    }
    return program;
#else
    // Fallback/stub for non-Windows platforms
    std::cerr << "[ShaderLoader] Runtime HLSL shader compilation is only supported on Windows" << std::endl;
    return BGFX_INVALID_HANDLE;
#endif
}

} // namespace ily
