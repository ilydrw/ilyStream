#include <napi.h>
#include "ily/engine.h"
#include <cmath>
#include <cstring>
#include <string>
#include <vector>

#if defined(_WIN32)
#include <windows.h>
#include <wincrypt.h>
#elif defined(__APPLE__)
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#endif

static constexpr size_t kMaxSecureStoreBytes = 1024 * 1024;

#if defined(__APPLE__)
static std::string HexEncode(const uint8_t* bytes, size_t length) {
    static constexpr char kHex[] = "0123456789abcdef";
    std::string result;
    result.reserve(length * 2);
    for (size_t index = 0; index < length; ++index) {
        result.push_back(kHex[(bytes[index] >> 4) & 0x0F]);
        result.push_back(kHex[bytes[index] & 0x0F]);
    }
    return result;
}

static CFStringRef MacSecureStoreService() {
    return CFStringCreateWithCString(
        kCFAllocatorDefault, "com.ilystream.secure-store", kCFStringEncodingUTF8);
}
#endif

static IlyColorDescription ParseColorDescription(
    const Napi::Object& object,
    const IlyColorDescription& fallback) {
    IlyColorDescription color = fallback;
    if (object.Has("primaries")) {
        color.primaries = static_cast<IlyColorPrimaries>(object.Get("primaries").As<Napi::Number>().Uint32Value());
    }
    if (object.Has("transfer")) {
        color.transfer = static_cast<IlyTransferFunction>(object.Get("transfer").As<Napi::Number>().Uint32Value());
    }
    if (object.Has("matrix")) {
        color.matrix = static_cast<IlyMatrixCoefficients>(object.Get("matrix").As<Napi::Number>().Uint32Value());
    }
    if (object.Has("range")) {
        color.range = static_cast<IlyColorRange>(object.Get("range").As<Napi::Number>().Uint32Value());
    }
    return color;
}

static Napi::Object ColorDescriptionToObject(Napi::Env env, const IlyColorDescription& color) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("primaries", Napi::Number::New(env, color.primaries));
    result.Set("transfer", Napi::Number::New(env, color.transfer));
    result.Set("matrix", Napi::Number::New(env, color.matrix));
    result.Set("range", Napi::Number::New(env, color.range));
    return result;
}

static Napi::Object OutputColorConfigToObject(Napi::Env env, const IlyOutputColorConfig& config) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("format", Napi::Number::New(env, config.format));
    result.Set("color", ColorDescriptionToObject(env, config.color));
    result.Set("sdrWhiteNits", Napi::Number::New(env, config.sdrWhiteNits));
    result.Set("hdrNominalPeakNits", Napi::Number::New(env, config.hdrNominalPeakNits));
    return result;
}

static Napi::Value InitSystem(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    IlyResult res = IlyInitializeSystem();
    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Value ShutdownSystem(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    IlyShutdownSystem();
    return env.Undefined();
}

static Napi::Value GetPlatformCapabilities(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    IlyPlatformCapabilities capabilities{};
    capabilities.structSize = sizeof(IlyPlatformCapabilities);
    const IlyResult result = IlyGetPlatformCapabilities(&capabilities);
    if (result != ILY_SUCCESS) {
        Napi::Error::New(env, "Unable to query native platform capabilities").ThrowAsJavaScriptException();
        return env.Null();
    }

    const uint32_t flags = capabilities.flags;
    Napi::Object output = Napi::Object::New(env);
    output.Set("version", Napi::Number::New(env, capabilities.version));
    output.Set("flags", Napi::Number::New(env, flags));
    output.Set("screenCapture", Napi::Boolean::New(env, (flags & ILY_PLATFORM_CAPABILITY_SCREEN_CAPTURE) != 0));
    output.Set("cameraCapture", Napi::Boolean::New(env, (flags & ILY_PLATFORM_CAPABILITY_CAMERA_CAPTURE) != 0));
    output.Set("sharedTextures", Napi::Boolean::New(env, (flags & ILY_PLATFORM_CAPABILITY_SHARED_TEXTURES) != 0));
    output.Set("programExport", Napi::Boolean::New(env, (flags & ILY_PLATFORM_CAPABILITY_PROGRAM_EXPORT) != 0));
    output.Set("nativeAudio", Napi::Boolean::New(env, (flags & ILY_PLATFORM_CAPABILITY_NATIVE_AUDIO) != 0));
    output.Set("virtualCamera", Napi::Boolean::New(env, (flags & ILY_PLATFORM_CAPABILITY_VIRTUAL_CAMERA) != 0));
    output.Set("obsIntegration", Napi::Boolean::New(env, (flags & ILY_PLATFORM_CAPABILITY_OBS_INTEGRATION) != 0));
    output.Set("secureStore", Napi::Boolean::New(env, (flags & ILY_PLATFORM_CAPABILITY_SECURE_STORE) != 0));
    return output;
}

static Napi::Value SecureStoreIsAvailable(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
#if defined(_WIN32) || defined(__APPLE__)
    return Napi::Boolean::New(env, true);
#else
    return Napi::Boolean::New(env, false);
#endif
}

static Napi::Value SecureStoreEncrypt(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected a string").ThrowAsJavaScriptException();
        return env.Null();
    }
    const std::string value = info[0].As<Napi::String>().Utf8Value();
    if (value.size() > kMaxSecureStoreBytes) return env.Null();

#if defined(_WIN32)
    DATA_BLOB input{};
    input.pbData = reinterpret_cast<BYTE*>(const_cast<char*>(value.data()));
    input.cbData = static_cast<DWORD>(value.size());
    DATA_BLOB encrypted{};
    if (!CryptProtectData(&input, L"ilyStream credential", nullptr, nullptr, nullptr,
                          CRYPTPROTECT_UI_FORBIDDEN, &encrypted)) {
        return env.Null();
    }
    Napi::Buffer<uint8_t> result = Napi::Buffer<uint8_t>::Copy(
        env, encrypted.pbData, encrypted.cbData);
    LocalFree(encrypted.pbData);
    return result;
#elif defined(__APPLE__)
    uint8_t accountBytes[16]{};
    if (SecRandomCopyBytes(kSecRandomDefault, sizeof(accountBytes), accountBytes) != errSecSuccess) {
        return env.Null();
    }
    const std::string account = HexEncode(accountBytes, sizeof(accountBytes));
    CFStringRef service = MacSecureStoreService();
    CFStringRef accountRef = CFStringCreateWithCString(
        kCFAllocatorDefault, account.c_str(), kCFStringEncodingUTF8);
    CFDataRef password = CFDataCreate(
        kCFAllocatorDefault, reinterpret_cast<const UInt8*>(value.data()), value.size());
    const void* keys[] = { kSecClass, kSecAttrService, kSecAttrAccount, kSecValueData };
    const void* values[] = { kSecClassGenericPassword, service, accountRef, password };
    CFDictionaryRef query = CFDictionaryCreate(
        kCFAllocatorDefault, keys, values, 4, &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks);
    const OSStatus status = SecItemAdd(query, nullptr);
    CFRelease(query);
    CFRelease(password);
    CFRelease(accountRef);
    CFRelease(service);
    if (status != errSecSuccess) return env.Null();
    return Napi::Buffer<uint8_t>::Copy(
        env, reinterpret_cast<const uint8_t*>(account.data()), account.size());
#else
    return env.Null();
#endif
}

static Napi::Value SecureStoreDecrypt(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected an encrypted buffer").ThrowAsJavaScriptException();
        return env.Null();
    }
    const Napi::Buffer<uint8_t> encrypted = info[0].As<Napi::Buffer<uint8_t>>();
    if (encrypted.Length() > kMaxSecureStoreBytes) return env.Null();

#if defined(_WIN32)
    DATA_BLOB input{};
    input.pbData = const_cast<BYTE*>(encrypted.Data());
    input.cbData = static_cast<DWORD>(encrypted.Length());
    DATA_BLOB decrypted{};
    if (!CryptUnprotectData(&input, nullptr, nullptr, nullptr, nullptr,
                            CRYPTPROTECT_UI_FORBIDDEN, &decrypted)) {
        return env.Null();
    }
    Napi::String result = Napi::String::New(
        env, reinterpret_cast<const char*>(decrypted.pbData), decrypted.cbData);
    LocalFree(decrypted.pbData);
    return result;
#elif defined(__APPLE__)
    CFStringRef service = MacSecureStoreService();
    CFStringRef account = CFStringCreateWithBytes(
        kCFAllocatorDefault, encrypted.Data(), encrypted.Length(), kCFStringEncodingUTF8, false);
    if (!account) {
        CFRelease(service);
        return env.Null();
    }
    const void* keys[] = { kSecClass, kSecAttrService, kSecAttrAccount,
                           kSecReturnData, kSecMatchLimit };
    const void* values[] = { kSecClassGenericPassword, service, account,
                             kCFBooleanTrue, kSecMatchLimitOne };
    CFDictionaryRef query = CFDictionaryCreate(
        kCFAllocatorDefault, keys, values, 5, &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks);
    CFTypeRef resultRef = nullptr;
    const OSStatus status = SecItemCopyMatching(query, &resultRef);
    CFRelease(query);
    CFRelease(account);
    CFRelease(service);
    if (status != errSecSuccess || !resultRef || CFGetTypeID(resultRef) != CFDataGetTypeID()) {
        if (resultRef) CFRelease(resultRef);
        return env.Null();
    }
    const auto* bytes = CFDataGetBytePtr(static_cast<CFDataRef>(resultRef));
    const CFIndex length = CFDataGetLength(static_cast<CFDataRef>(resultRef));
    Napi::String output = Napi::String::New(
        env, reinterpret_cast<const char*>(bytes), static_cast<size_t>(length));
    CFRelease(resultRef);
    return output;
#else
    return env.Null();
#endif
}

static Napi::Value CreateEngine(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Object expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Object configObj = info[0].As<Napi::Object>();
    IlyEngineConfig config{};
    config.width = configObj.Get("width").As<Napi::Number>().Uint32Value();
    config.height = configObj.Get("height").As<Napi::Number>().Uint32Value();
    config.fps = configObj.Get("fps").As<Napi::Number>().Uint32Value();
    config.enableValidation = configObj.Has("enableValidation") ? configObj.Get("enableValidation").As<Napi::Boolean>().Value() : false;
    config.linearBlending = configObj.Has("linearBlending") ? configObj.Get("linearBlending").As<Napi::Boolean>().Value() : true;
    config.outputColor = IlyDefaultSdrOutputColor();
    if (configObj.Has("outputColor") && configObj.Get("outputColor").IsObject()) {
        Napi::Object output = configObj.Get("outputColor").As<Napi::Object>();
        if (output.Has("format")) {
            config.outputColor.format = static_cast<IlyPixelFormat>(output.Get("format").As<Napi::Number>().Uint32Value());
        }
        if (output.Has("color") && output.Get("color").IsObject()) {
            config.outputColor.color = ParseColorDescription(
                output.Get("color").As<Napi::Object>(), config.outputColor.color);
        }
        if (output.Has("sdrWhiteNits")) {
            config.outputColor.sdrWhiteNits = output.Get("sdrWhiteNits").As<Napi::Number>().FloatValue();
        }
        if (output.Has("hdrNominalPeakNits")) {
            config.outputColor.hdrNominalPeakNits = output.Get("hdrNominalPeakNits").As<Napi::Number>().FloatValue();
        }
    }

    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    IlyResult res = IlyCreateEngine(&config, &engineHandle);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to create engine, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::BigInt::New(env, ResourceHandleToUint64(engineHandle));
}

static Napi::Value DestroyEngine(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "BigInt engine handle expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t handleVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    IlyResult res = IlyDestroyEngine(Uint64ToResourceHandle(handleVal));
    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Value EngineUpdate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected (BigInt, Number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t handleVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    float dt = info[1].As<Napi::Number>().FloatValue();
    IlyResult res = IlyEngineUpdate(Uint64ToResourceHandle(handleVal), dt);
    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Value EngineRender(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "BigInt engine handle expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t handleVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    IlyResult res = IlyEngineRender(Uint64ToResourceHandle(handleVal));
    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Value EngineSetSceneJson(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsString()) {
        Napi::TypeError::New(env, "Expected (BigInt, String)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t handleVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    std::string sceneJson = info[1].As<Napi::String>().Utf8Value();
    IlyResult res = IlyEngineSetSceneJson(Uint64ToResourceHandle(handleVal), sceneJson.c_str());
    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Value EngineGetSceneJson(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "BigInt engine handle expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t handleVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    ResourceHandle engineHandle = Uint64ToResourceHandle(handleVal);

    uint32_t bufferSize = 0;
    IlyResult res = IlyEngineGetSceneJson(engineHandle, nullptr, &bufferSize);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to get scene JSON size, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }

    std::vector<char> buffer(bufferSize);
    res = IlyEngineGetSceneJson(engineHandle, buffer.data(), &bufferSize);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to retrieve scene JSON, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::String::New(env, buffer.data());
}

static Napi::Value EngineRegisterSource(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4 || !info[0].IsBigInt() || !info[1].IsString() || !info[2].IsString() || !info[3].IsString()) {
        Napi::TypeError::New(env, "Expected (BigInt, String, String, String)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t handleVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    std::string sourceId = info[1].As<Napi::String>().Utf8Value();
    std::string name = info[2].As<Napi::String>().Utf8Value();
    std::string type = info[3].As<Napi::String>().Utf8Value();

    ResourceHandle outSourceHandle = ILY_INVALID_HANDLE;
    IlyResult res = IlyEngineRegisterSource(Uint64ToResourceHandle(handleVal), sourceId.c_str(), name.c_str(), type.c_str(), &outSourceHandle);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to register source, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::BigInt::New(env, ResourceHandleToUint64(outSourceHandle));
}

static Napi::Value EngineUnregisterSource(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsBigInt()) {
        Napi::TypeError::New(env, "Expected (BigInt, BigInt)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint64_t sourceVal = info[1].As<Napi::BigInt>().Uint64Value(&lossless);

    IlyResult res = IlyEngineUnregisterSource(Uint64ToResourceHandle(engineVal), Uint64ToResourceHandle(sourceVal));
    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Value EngineLoadTexture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsString()) {
        Napi::TypeError::New(env, "Expected (BigInt, String)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    std::string filePath = info[1].As<Napi::String>().Utf8Value();

    ResourceHandle outTextureHandle = ILY_INVALID_HANDLE;
    IlyResult res = IlyEngineLoadTexture(Uint64ToResourceHandle(engineVal), filePath.c_str(), &outTextureHandle);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to load texture, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::BigInt::New(env, ResourceHandleToUint64(outTextureHandle));
}

static Napi::Value EngineCreateColorTexture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected (BigInt, Number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint32_t color = info[1].As<Napi::Number>().Uint32Value();

    ResourceHandle outTextureHandle = ILY_INVALID_HANDLE;
    IlyResult res = IlyEngineCreateColorTexture(Uint64ToResourceHandle(engineVal), color, &outTextureHandle);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to create color texture, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::BigInt::New(env, ResourceHandleToUint64(outTextureHandle));
}

// engineCreateTextureFromPixels(engine: BigInt, width, height, rgba: Buffer) -> BigInt
static Napi::Value EngineCreateTextureFromPixels(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4 || !info[0].IsBigInt() || !info[1].IsNumber() ||
        !info[2].IsNumber() || !info[3].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (BigInt, Number, Number, Buffer)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint32_t width = info[1].As<Napi::Number>().Uint32Value();
    uint32_t height = info[2].As<Napi::Number>().Uint32Value();
    Napi::Buffer<uint8_t> buf = info[3].As<Napi::Buffer<uint8_t>>();

    ResourceHandle outTex = ILY_INVALID_HANDLE;
    IlyResult res = IlyEngineCreateTextureFromPixels(
        Uint64ToResourceHandle(engineVal), width, height,
        buf.Data(), static_cast<uint32_t>(buf.Length()), &outTex);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to create texture from pixels, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }
    return Napi::BigInt::New(env, ResourceHandleToUint64(outTex));
}

// engineCreateTextureFromPixelsEx(engine: BigInt, desc: Object, pixels: Buffer) -> BigInt
static Napi::Value EngineCreateTextureFromPixelsEx(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsBigInt() || !info[1].IsObject() || !info[2].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (BigInt, Object, Buffer)").ThrowAsJavaScriptException();
        return env.Null();
    }

    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    Napi::Object object = info[1].As<Napi::Object>();
    Napi::Buffer<uint8_t> buffer = info[2].As<Napi::Buffer<uint8_t>>();

    IlyTextureDesc desc{};
    desc.width = object.Get("width").As<Napi::Number>().Uint32Value();
    desc.height = object.Get("height").As<Napi::Number>().Uint32Value();
    desc.format = object.Has("format")
        ? static_cast<IlyPixelFormat>(object.Get("format").As<Napi::Number>().Uint32Value())
        : ILY_PIXEL_FORMAT_RGBA8;
    desc.color = IlySrgbFullColor();
    if (object.Has("color") && object.Get("color").IsObject()) {
        desc.color = ParseColorDescription(object.Get("color").As<Napi::Object>(), desc.color);
    }
    desc.alphaMode = object.Has("alphaMode")
        ? static_cast<IlyAlphaMode>(object.Get("alphaMode").As<Napi::Number>().Uint32Value())
        : ILY_ALPHA_STRAIGHT;

    ResourceHandle outTexture = ILY_INVALID_HANDLE;
    IlyResult result = IlyEngineCreateTextureFromPixelsEx(
        Uint64ToResourceHandle(engineVal),
        &desc,
        buffer.Data(),
        static_cast<uint32_t>(buffer.Length()),
        &outTexture);
    if (result != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to create described texture, code: " + std::to_string(result)).ThrowAsJavaScriptException();
        return env.Null();
    }
    return Napi::BigInt::New(env, ResourceHandleToUint64(outTexture));
}

// engineCreateSharedTexture(engine: BigInt, desc: Object, handle: Buffer) -> BigInt
//
// `handle` carries the raw platform handle bytes, matching the shape
// engineGetSharedOutputTexture hands out and the one Electron's
// textureInfo.handle.ntHandle arrives in.
static Napi::Value EngineCreateSharedTexture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsBigInt() || !info[1].IsObject() || !info[2].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (BigInt, Object, Buffer)").ThrowAsJavaScriptException();
        return env.Null();
    }

    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    Napi::Object object = info[1].As<Napi::Object>();
    Napi::Buffer<uint8_t> handleBuffer = info[2].As<Napi::Buffer<uint8_t>>();

    if (handleBuffer.Length() < sizeof(void*)) {
        Napi::TypeError::New(env, "Shared handle buffer is too small").ThrowAsJavaScriptException();
        return env.Null();
    }

    void* sharedHandle = nullptr;
    std::memcpy(&sharedHandle, handleBuffer.Data(), sizeof(sharedHandle));
    if (!sharedHandle) {
        Napi::TypeError::New(env, "Shared handle is null").ThrowAsJavaScriptException();
        return env.Null();
    }

    IlyTextureDesc desc{};
    desc.width = object.Get("width").As<Napi::Number>().Uint32Value();
    desc.height = object.Get("height").As<Napi::Number>().Uint32Value();
    desc.format = object.Has("format")
        ? static_cast<IlyPixelFormat>(object.Get("format").As<Napi::Number>().Uint32Value())
        : ILY_PIXEL_FORMAT_BGRA8;
    desc.color = IlySrgbFullColor();
    if (object.Has("color") && object.Get("color").IsObject()) {
        desc.color = ParseColorDescription(object.Get("color").As<Napi::Object>(), desc.color);
    }
    desc.alphaMode = object.Has("alphaMode")
        ? static_cast<IlyAlphaMode>(object.Get("alphaMode").As<Napi::Number>().Uint32Value())
        : ILY_ALPHA_STRAIGHT;

    ResourceHandle outTexture = ILY_INVALID_HANDLE;
    IlyResult result = IlyEngineCreateSharedTexture(
        Uint64ToResourceHandle(engineVal),
        &desc,
        sharedHandle,
        &outTexture);
    if (result != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to import shared texture, code: " + std::to_string(result)).ThrowAsJavaScriptException();
        return env.Null();
    }
    return Napi::BigInt::New(env, ResourceHandleToUint64(outTexture));
}

// engineUpdateTexture(engine: BigInt, texture: BigInt, rgba: Buffer) -> IlyResult code
static Napi::Value EngineUpdateTexture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsBigInt() || !info[1].IsBigInt() || !info[2].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (BigInt, BigInt, Buffer)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint64_t textureVal = info[1].As<Napi::BigInt>().Uint64Value(&lossless);
    Napi::Buffer<uint8_t> buf = info[2].As<Napi::Buffer<uint8_t>>();

    IlyResult res = IlyEngineUpdateTexture(
        Uint64ToResourceHandle(engineVal), Uint64ToResourceHandle(textureVal),
        buf.Data(), static_cast<uint32_t>(buf.Length()));
    return Napi::Number::New(env, static_cast<double>(res));
}

// engineCreateScreenCapture(engine: BigInt, monitorIndex: Number, targetFps: Number) -> BigInt
static Napi::Value EngineCreateScreenCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsBigInt() || !info[1].IsNumber() || !info[2].IsNumber()) {
        Napi::TypeError::New(env, "Expected (BigInt, Number, Number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint32_t monitorIndex = info[1].As<Napi::Number>().Uint32Value();
    uint32_t targetFps = info[2].As<Napi::Number>().Uint32Value();

    ResourceHandle outTex = ILY_INVALID_HANDLE;
    char sharedMemName[256] = {0};
    IlyResult res = IlyEngineCreateScreenCapture(
        Uint64ToResourceHandle(engineVal), monitorIndex, targetFps, &outTex, sharedMemName, sizeof(sharedMemName));
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to create screen capture, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("texture", Napi::BigInt::New(env, ResourceHandleToUint64(outTex)));
    result.Set("sharedMemoryName", Napi::String::New(env, sharedMemName));
    IlyScreenCaptureInfo captureInfo{};
    if (IlyEngineGetScreenCaptureInfo(Uint64ToResourceHandle(engineVal), outTex, &captureInfo) == ILY_SUCCESS) {
        Napi::Object description = Napi::Object::New(env);
        description.Set("width", Napi::Number::New(env, captureInfo.width));
        description.Set("height", Napi::Number::New(env, captureInfo.height));
        description.Set("format", Napi::Number::New(env, captureInfo.format));
        description.Set("color", ColorDescriptionToObject(env, captureInfo.color));
        description.Set("hdr", Napi::Boolean::New(env, captureInfo.hdr));
        description.Set("sdrWhiteNits", Napi::Number::New(env, captureInfo.sdrWhiteNits));
        description.Set("maxLuminance", Napi::Number::New(env, captureInfo.maxLuminance));
        description.Set("maxFullFrameLuminance", Napi::Number::New(env, captureInfo.maxFullFrameLuminance));
        result.Set("description", description);
    }
    return result;
}

static Napi::Value ListScreenCaptureDisplays(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    uint32_t count = 0;
    IlyResult queryResult = IlyEngineGetScreenCaptureDisplays(nullptr, &count);
    if (queryResult != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to enumerate screen capture displays").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::vector<IlyScreenCaptureDisplayInfo> displays(count);
    IlyResult listResult = IlyEngineGetScreenCaptureDisplays(displays.data(), &count);
    if (listResult != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to read screen capture displays").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array result = Napi::Array::New(env, count);
    for (uint32_t index = 0; index < count; ++index) {
        const auto& display = displays[index];
        Napi::Object item = Napi::Object::New(env);
        item.Set("index", Napi::Number::New(env, display.index));
        item.Set("deviceName", Napi::String::New(env, display.deviceName));
        item.Set("left", Napi::Number::New(env, display.left));
        item.Set("top", Napi::Number::New(env, display.top));
        item.Set("right", Napi::Number::New(env, display.right));
        item.Set("bottom", Napi::Number::New(env, display.bottom));
        item.Set("hdr", Napi::Boolean::New(env, display.hdr));
        result.Set(index, item);
    }
    return result;
}

static Napi::Value EngineCreateCameraCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 5
        || !info[0].IsBigInt()
        || !info[1].IsString()
        || !info[2].IsNumber()
        || !info[3].IsNumber()
        || !info[4].IsNumber()) {
        Napi::TypeError::New(
            env,
            "Expected (BigInt, String, Number, Number, Number)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    bool lossless;
    const uint64_t engineValue =
        info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    const std::string deviceIdentity =
        info[1].As<Napi::String>().Utf8Value();
    const uint32_t width = info[2].As<Napi::Number>().Uint32Value();
    const uint32_t height = info[3].As<Napi::Number>().Uint32Value();
    const uint32_t targetFps = info[4].As<Napi::Number>().Uint32Value();

    ResourceHandle textureHandle = ILY_INVALID_HANDLE;
    const ResourceHandle engineHandle = Uint64ToResourceHandle(engineValue);
    const IlyResult result = IlyEngineCreateCameraCapture(
        engineHandle,
        deviceIdentity.c_str(),
        width,
        height,
        targetFps,
        &textureHandle);
    if (result != ILY_SUCCESS) {
        Napi::Error::New(
            env,
            "Failed to create camera capture, code: " + std::to_string(result))
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    IlyCameraCaptureInfo captureInfo{};
    if (IlyEngineGetCameraCaptureInfo(
            engineHandle, textureHandle, &captureInfo) != ILY_SUCCESS) {
        IlyEngineDestroyTexture(engineHandle, textureHandle);
        Napi::Error::New(env, "Failed to read camera capture description")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object description = Napi::Object::New(env);
    description.Set("width", Napi::Number::New(env, captureInfo.width));
    description.Set("height", Napi::Number::New(env, captureInfo.height));
    description.Set(
        "frameRateNumerator",
        Napi::Number::New(env, captureInfo.frameRateNumerator));
    description.Set(
        "frameRateDenominator",
        Napi::Number::New(env, captureInfo.frameRateDenominator));
    description.Set("format", Napi::Number::New(env, captureInfo.format));
    description.Set("color", ColorDescriptionToObject(env, captureInfo.color));
    description.Set(
        "gpuFrames", Napi::Boolean::New(env, captureInfo.gpuFrames));
    description.Set(
        "deviceName", Napi::String::New(env, captureInfo.deviceName));

    Napi::Object value = Napi::Object::New(env);
    value.Set(
        "texture",
        Napi::BigInt::New(env, ResourceHandleToUint64(textureHandle)));
    value.Set("description", description);
    return value;
}

static Napi::Value ListCameraCaptureDevices(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    uint32_t count = 0;
    IlyResult queryResult =
        IlyEngineGetCameraCaptureDevices(nullptr, &count);
    if (queryResult != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to enumerate camera capture devices")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    std::vector<IlyCameraCaptureDeviceInfo> devices(count);
    IlyResult listResult =
        IlyEngineGetCameraCaptureDevices(devices.data(), &count);
    if (listResult != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to read camera capture devices")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array result = Napi::Array::New(env, count);
    for (uint32_t index = 0; index < count; ++index) {
        const auto& device = devices[index];
        Napi::Object item = Napi::Object::New(env);
        item.Set(
            "friendlyName", Napi::String::New(env, device.friendlyName));
        item.Set(
            "symbolicLink", Napi::String::New(env, device.symbolicLink));
        result.Set(index, item);
    }
    return result;
}

static Napi::Value EngineCreateSpriteProgram(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "BigInt engine handle expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);

    ResourceHandle outProgramHandle = ILY_INVALID_HANDLE;
    IlyResult res = IlyEngineCreateSpriteProgram(Uint64ToResourceHandle(engineVal), &outProgramHandle);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to create sprite program, code: " + std::to_string(res)).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::BigInt::New(env, ResourceHandleToUint64(outProgramHandle));
}

// Unpack a JS transform object ({position,rotation,scale,anchor,pivot,crop,
// visibility,opacity}) into an IlyTransform.
static void UnpackTransform(const Napi::Object& tObj, IlyTransform& transform) {
    Napi::Object posObj = tObj.Get("position").As<Napi::Object>();
    transform.position.x = posObj.Get("x").As<Napi::Number>().FloatValue();
    transform.position.y = posObj.Get("y").As<Napi::Number>().FloatValue();
    transform.position.z = posObj.Get("z").As<Napi::Number>().FloatValue();

    Napi::Object rotObj = tObj.Get("rotation").As<Napi::Object>();
    transform.rotation.x = rotObj.Get("x").As<Napi::Number>().FloatValue();
    transform.rotation.y = rotObj.Get("y").As<Napi::Number>().FloatValue();
    transform.rotation.z = rotObj.Get("z").As<Napi::Number>().FloatValue();

    Napi::Object scaleObj = tObj.Get("scale").As<Napi::Object>();
    transform.scale.x = scaleObj.Get("x").As<Napi::Number>().FloatValue();
    transform.scale.y = scaleObj.Get("y").As<Napi::Number>().FloatValue();
    transform.scale.z = scaleObj.Get("z").As<Napi::Number>().FloatValue();

    Napi::Object anchorObj = tObj.Get("anchor").As<Napi::Object>();
    transform.anchor.x = anchorObj.Get("x").As<Napi::Number>().FloatValue();
    transform.anchor.y = anchorObj.Get("y").As<Napi::Number>().FloatValue();

    Napi::Object pivotObj = tObj.Get("pivot").As<Napi::Object>();
    transform.pivot.x = pivotObj.Get("x").As<Napi::Number>().FloatValue();
    transform.pivot.y = pivotObj.Get("y").As<Napi::Number>().FloatValue();

    Napi::Object cropObj = tObj.Get("crop").As<Napi::Object>();
    transform.crop.left = cropObj.Get("left").As<Napi::Number>().FloatValue();
    transform.crop.top = cropObj.Get("top").As<Napi::Number>().FloatValue();
    transform.crop.right = cropObj.Get("right").As<Napi::Number>().FloatValue();
    transform.crop.bottom = cropObj.Get("bottom").As<Napi::Number>().FloatValue();

    transform.visibility = tObj.Get("visibility").As<Napi::Boolean>().Value();
    transform.opacity = tObj.Get("opacity").As<Napi::Number>().FloatValue();
}

// engineSetLayers(engineHandle: BigInt, layers: Array<{texture, transform,
// opacity, blendMode}>) -> IlyResult code
static Napi::Value EngineSetLayers(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsArray()) {
        Napi::TypeError::New(env, "Expected (BigInt, Array)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    Napi::Array arr = info[1].As<Napi::Array>();
    uint32_t count = arr.Length();

    std::vector<IlyLayer> layers(count);
    for (uint32_t i = 0; i < count; ++i) {
        Napi::Object lo = arr.Get(i).As<Napi::Object>();
        IlyLayer& layer = layers[i];
        uint64_t texVal = lo.Get("texture").As<Napi::BigInt>().Uint64Value(&lossless);
        layer.texture = Uint64ToResourceHandle(texVal);
        UnpackTransform(lo.Get("transform").As<Napi::Object>(), layer.transform);
        layer.opacity = lo.Has("opacity") ? lo.Get("opacity").As<Napi::Number>().FloatValue() : 1.0f;
        layer.blendMode = static_cast<IlyBlendMode>(
            lo.Has("blendMode") ? lo.Get("blendMode").As<Napi::Number>().Uint32Value()
                                : static_cast<uint32_t>(ILY_BLEND_ALPHA));

        // Optional chroma key: { keyR, keyG, keyB, similarity, smoothness,
        // spill }, all normalized 0..1. Presence of the object enables keying.
        layer.chromaKey = IlyChromaKey{};
        if (lo.Has("chromaKey") && lo.Get("chromaKey").IsObject()) {
            Napi::Object ck = lo.Get("chromaKey").As<Napi::Object>();
            auto readClamped = [&ck](const char* name, float fallback) -> float {
                if (!ck.Has(name)) return fallback;
                const float value = ck.Get(name).As<Napi::Number>().FloatValue();
                return value < 0.0f ? 0.0f : (value > 1.0f ? 1.0f : value);
            };
            layer.chromaKey.enabled = true;
            layer.chromaKey.keyR = readClamped("keyR", 0.0f);
            layer.chromaKey.keyG = readClamped("keyG", 1.0f);
            layer.chromaKey.keyB = readClamped("keyB", 0.0f);
            layer.chromaKey.similarity = readClamped("similarity", 0.4f);
            layer.chromaKey.smoothness = readClamped("smoothness", 0.1f);
            layer.chromaKey.spill = readClamped("spill", 0.1f);
        }

        // Optional color adjust: { matrix: number[12], alpha }. matrix is the
        // row-major 3x4 CSS-filter composition (rows R,G,B; [3] = offset).
        // Presence of a well-formed matrix enables the adjustment; any
        // non-finite entry disables it rather than feeding NaN to the GPU.
        layer.colorAdjust = IlyColorAdjust{};
        if (lo.Has("colorAdjust") && lo.Get("colorAdjust").IsObject()) {
            Napi::Object ca = lo.Get("colorAdjust").As<Napi::Object>();
            if (ca.Has("matrix") && ca.Get("matrix").IsArray()) {
                Napi::Array matrix = ca.Get("matrix").As<Napi::Array>();
                if (matrix.Length() == 12) {
                    bool finite = true;
                    for (uint32_t j = 0; j < 12; ++j) {
                        const float value = matrix.Get(j).As<Napi::Number>().FloatValue();
                        if (!std::isfinite(value)) { finite = false; break; }
                        layer.colorAdjust.matrix[j] = value;
                    }
                    float alpha = ca.Has("alpha") ? ca.Get("alpha").As<Napi::Number>().FloatValue() : 1.0f;
                    if (!std::isfinite(alpha)) alpha = 1.0f;
                    layer.colorAdjust.alpha = alpha < 0.0f ? 0.0f : (alpha > 1.0f ? 1.0f : alpha);
                    layer.colorAdjust.enabled = finite;
                }
            }
        }

        // Optional rounded-corner mask radius in output pixels (0 disables).
        layer.cornerRadius = 0.0f;
        if (lo.Has("cornerRadius") && lo.Get("cornerRadius").IsNumber()) {
            const float radius = lo.Get("cornerRadius").As<Napi::Number>().FloatValue();
            if (std::isfinite(radius) && radius > 0.0f) {
                layer.cornerRadius = radius;
            }
        }

        // Optional Gaussian blur sigma in output pixels (0 disables). The
        // engine downsamples the blur intermediate for large sigmas, so the
        // clamp is the pipeline's overall ceiling (64px), not the kernel's
        // per-texel reach; guard the input here too.
        layer.blurSigma = 0.0f;
        if (lo.Has("blurSigma") && lo.Get("blurSigma").IsNumber()) {
            const float sigma = lo.Get("blurSigma").As<Napi::Number>().FloatValue();
            if (std::isfinite(sigma) && sigma > 0.0f) {
                layer.blurSigma = sigma > 64.0f ? 64.0f : sigma;
            }
        }

        // Optional focus-circle sharp-region mask in output pixels:
        // { x, y, radius }, content-local from the quad's top-left in texcoord
        // orientation (flips need no adjustment — the SDF mirrors with the
        // quad). The engine draws it as a sharp overlay over the blurred base.
        layer.circleMask = IlyCircleMask{};
        if (lo.Has("circleMask") && lo.Get("circleMask").IsObject()) {
            Napi::Object cm = lo.Get("circleMask").As<Napi::Object>();
            const float cx = cm.Has("x") ? cm.Get("x").As<Napi::Number>().FloatValue() : 0.0f;
            const float cy = cm.Has("y") ? cm.Get("y").As<Napi::Number>().FloatValue() : 0.0f;
            const float cr = cm.Has("radius") ? cm.Get("radius").As<Napi::Number>().FloatValue() : 0.0f;
            if (std::isfinite(cx) && std::isfinite(cy) && std::isfinite(cr) && cr > 0.0f) {
                layer.circleMask.enabled = true;
                layer.circleMask.x = cx;
                layer.circleMask.y = cy;
                layer.circleMask.radius = cr;
            }
        }

        // Optional image-mask texture handle (OBS-style alpha mask). Absent or
        // invalid disables the mask; the engine binds it as a second sampler.
        layer.maskTexture = ILY_INVALID_HANDLE;
        if (lo.Has("maskTexture") && lo.Get("maskTexture").IsBigInt()) {
            layer.maskTexture = Uint64ToResourceHandle(
                lo.Get("maskTexture").As<Napi::BigInt>().Uint64Value(&lossless));
        }

        // Optional mask transform [offsetU, offsetV, scaleU, scaleV] mapping the
        // quad's UV into the layout rect the masks are positioned in. Defaults to
        // identity (the quad fills the rect); a non-identity scale must stay
        // positive so the shader's layout-size division is well-defined.
        layer.maskTransform[0] = 0.0f;
        layer.maskTransform[1] = 0.0f;
        layer.maskTransform[2] = 1.0f;
        layer.maskTransform[3] = 1.0f;
        if (lo.Has("maskTransform") && lo.Get("maskTransform").IsArray()) {
            Napi::Array mt = lo.Get("maskTransform").As<Napi::Array>();
            if (mt.Length() == 4) {
                float values[4];
                bool ok = true;
                for (uint32_t j = 0; j < 4; ++j) {
                    values[j] = mt.Get(j).As<Napi::Number>().FloatValue();
                    if (!std::isfinite(values[j])) { ok = false; break; }
                }
                if (ok && values[2] > 0.0f && values[3] > 0.0f) {
                    layer.maskTransform[0] = values[0];
                    layer.maskTransform[1] = values[1];
                    layer.maskTransform[2] = values[2];
                    layer.maskTransform[3] = values[3];
                }
            }
        }
    }

    const uint32_t outputIndex =
        info.Length() > 2 && info[2].IsNumber() ? info[2].As<Napi::Number>().Uint32Value() : 0;
    IlyResult res = IlyEngineSetLayersForOutput(Uint64ToResourceHandle(engineVal), outputIndex,
                                       count > 0 ? layers.data() : nullptr, count);
    return Napi::Number::New(env, static_cast<double>(res));
}

// engineReadPixels(engineHandle: BigInt, buffer: Buffer) ->
// { result, width, height }. buffer is filled with tightly packed RGBA8.
// engineCreateOutput(engineHandle: BigInt, width, height) -> Number (output index)
static Napi::Value EngineCreateOutput(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsBigInt() || !info[1].IsNumber() || !info[2].IsNumber()) {
        Napi::TypeError::New(env, "Expected (BigInt, Number, Number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    const uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint32_t outputIndex = 0;
    const IlyResult res = IlyEngineCreateOutput(
        Uint64ToResourceHandle(engineVal),
        info[1].As<Napi::Number>().Uint32Value(),
        info[2].As<Napi::Number>().Uint32Value(),
        &outputIndex);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to create engine output, code: " + std::to_string(res))
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    return Napi::Number::New(env, outputIndex);
}

// engineDestroyOutput(engineHandle: BigInt, outputIndex: Number) -> Number
static Napi::Value EngineDestroyOutput(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsNumber()) {
        Napi::TypeError::New(env, "Expected (BigInt, Number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    const uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    const IlyResult res = IlyEngineDestroyOutput(
        Uint64ToResourceHandle(engineVal), info[1].As<Napi::Number>().Uint32Value());
    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Value EngineReadPixels(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (BigInt, Buffer)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    Napi::Buffer<uint8_t> buf = info[1].As<Napi::Buffer<uint8_t>>();

    uint32_t width = 0;
    uint32_t height = 0;
    const uint32_t outputIndex =
        info.Length() > 2 && info[2].IsNumber() ? info[2].As<Napi::Number>().Uint32Value() : 0;
    IlyResult res = IlyEngineReadPixelsForOutput(Uint64ToResourceHandle(engineVal), outputIndex,
                                                 buf.Data(), static_cast<uint32_t>(buf.Length()),
                                                 &width, &height);

    Napi::Object result = Napi::Object::New(env);
    result.Set("result", Napi::Number::New(env, static_cast<double>(res)));
    result.Set("width", Napi::Number::New(env, width));
    result.Set("height", Napi::Number::New(env, height));
    return result;
}

// engineGetSharedOutputTexture(engineHandle: BigInt) ->
// { handle: Buffer, width, height, pixelFormat: "rgba" }
static Napi::Value EngineGetSharedOutputTexture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "BigInt engine handle expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    void* nativeHandle = nullptr;
    uint32_t width = 0;
    uint32_t height = 0;
    const uint32_t outputIndex =
        info.Length() > 1 && info[1].IsNumber() ? info[1].As<Napi::Number>().Uint32Value() : 0;
    IlyResult res = IlyEngineGetSharedOutputTextureForOutput(
        Uint64ToResourceHandle(engineVal), outputIndex, &nativeHandle, &width, &height);
    if (res != ILY_SUCCESS || !nativeHandle) {
        Napi::Error::New(
            env, "Shared output texture unavailable, code: " + std::to_string(res))
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    const uint8_t* handleBytes = reinterpret_cast<const uint8_t*>(&nativeHandle);
    Napi::Object result = Napi::Object::New(env);
    result.Set("handle", Napi::Buffer<uint8_t>::Copy(env, handleBytes, sizeof(nativeHandle)));
    result.Set("width", Napi::Number::New(env, width));
    result.Set("height", Napi::Number::New(env, height));
    result.Set("pixelFormat", Napi::String::New(env, "rgba"));
    IlyOutputColorConfig outputColor{};
    if (IlyEngineGetOutputColorConfig(Uint64ToResourceHandle(engineVal), &outputColor) == ILY_SUCCESS) {
        result.Set("color", OutputColorConfigToObject(env, outputColor));
    }
    return result;
}

// engineGetProgramExportDescriptor(engineHandle: BigInt) -> versioned
// two-slot keyed-mutex Program export metadata. The handle buffers here belong
// to this process; use engineDuplicateProgramExportHandles for OBS.
static Napi::Value EngineGetProgramExportDescriptor(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "BigInt engine handle expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    bool lossless = false;
    const uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless) {
        Napi::TypeError::New(env, "Invalid engine handle").ThrowAsJavaScriptException();
        return env.Null();
    }

    IlyProgramExportDescriptor descriptor{};
    const IlyResult res = IlyEngineGetProgramExportDescriptor(
        Uint64ToResourceHandle(engineVal), &descriptor);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(
            env, "Program export unavailable, code: " + std::to_string(res))
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("structSize", Napi::Number::New(env, descriptor.structSize));
    result.Set("version", Napi::Number::New(env, descriptor.version));
    result.Set("generation", Napi::BigInt::New(env, descriptor.generation));
    result.Set("frameSequence", Napi::BigInt::New(env, descriptor.frameSequence));
    result.Set("adapterLuid", Napi::BigInt::New(env, descriptor.adapterLuid));
    result.Set("width", Napi::Number::New(env, descriptor.width));
    result.Set("height", Napi::Number::New(env, descriptor.height));
    result.Set("format", Napi::Number::New(env, descriptor.format));
    result.Set("slotCount", Napi::Number::New(env, descriptor.slotCount));
    result.Set("latestSlot", Napi::Number::New(env, descriptor.latestSlot));
    result.Set("producerAcquireKey", Napi::BigInt::New(env, descriptor.producerAcquireKey));
    result.Set("consumerAcquireKey", Napi::BigInt::New(env, descriptor.consumerAcquireKey));
    result.Set("controlBlockVersion", Napi::Number::New(env, descriptor.controlBlockVersion));
    result.Set("controlBlockSize", Napi::Number::New(env, descriptor.controlBlockSize));

    Napi::Array handles = Napi::Array::New(env, descriptor.slotCount);
    for (uint32_t index = 0; index < descriptor.slotCount; ++index) {
        const uintptr_t nativeHandle = static_cast<uintptr_t>(
            descriptor.sharedHandleValues[index]);
        const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&nativeHandle);
        handles.Set(index, Napi::Buffer<uint8_t>::Copy(env, bytes, sizeof(nativeHandle)));
    }
    result.Set("sharedHandles", handles);
    const uintptr_t controlHandle = static_cast<uintptr_t>(
        descriptor.controlMappingHandleValue);
    result.Set(
        "controlMappingHandle",
        Napi::Buffer<uint8_t>::Copy(
            env,
            reinterpret_cast<const uint8_t*>(&controlHandle),
            sizeof(controlHandle)));
    return result;
}

static Napi::Value EngineSetProgramExportEnabled(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsBoolean()) {
        Napi::TypeError::New(env, "Expected (BigInt, Boolean)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless = false;
    const uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    if (!lossless) {
        Napi::TypeError::New(env, "Invalid engine handle").ThrowAsJavaScriptException();
        return env.Null();
    }
    const IlyResult result = IlyEngineSetProgramExportEnabled(
        Uint64ToResourceHandle(engineVal), info[1].As<Napi::Boolean>().Value());
    return Napi::Number::New(env, static_cast<double>(result));
}

// engineDuplicateProgramExportHandles(engine, targetPid, generation,
// slotCount) -> { textureHandles: BigInt[2], controlHandle: BigInt, ... }.
// The caller must authenticate and strictly validate targetPid. The target
// process owns and closes the results.
static Napi::Value EngineDuplicateProgramExportHandles(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4 || !info[0].IsBigInt() || !info[1].IsNumber() ||
        !info[2].IsBigInt() || !info[3].IsNumber()) {
        Napi::TypeError::New(
            env, "Expected (BigInt, Number, BigInt, Number)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    bool engineLossless = false;
    bool generationLossless = false;
    const uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&engineLossless);
    const uint32_t targetPid = info[1].As<Napi::Number>().Uint32Value();
    const uint64_t generation = info[2].As<Napi::BigInt>().Uint64Value(&generationLossless);
    const uint32_t slotCount = info[3].As<Napi::Number>().Uint32Value();
    if (!engineLossless || !generationLossless || targetPid == 0 ||
        slotCount != ILY_PROGRAM_EXPORT_SLOT_COUNT) {
        Napi::TypeError::New(env, "Invalid Program export duplication request")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    IlyProgramExportDuplicatedHandles handles{};
    const IlyResult res = IlyEngineDuplicateProgramExportHandles(
        Uint64ToResourceHandle(engineVal),
        targetPid,
        generation,
        slotCount,
        &handles);
    if (res != ILY_SUCCESS) {
        Napi::Error::New(
            env, "Program export handle duplication failed, code: " + std::to_string(res))
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object result = Napi::Object::New(env);
    result.Set("structSize", Napi::Number::New(env, handles.structSize));
    result.Set("version", Napi::Number::New(env, handles.version));
    result.Set("generation", Napi::BigInt::New(env, handles.generation));
    result.Set("slotCount", Napi::Number::New(env, handles.slotCount));
    Napi::Array textures = Napi::Array::New(env, ILY_PROGRAM_EXPORT_SLOT_COUNT);
    for (uint32_t index = 0; index < ILY_PROGRAM_EXPORT_SLOT_COUNT; ++index) {
        textures.Set(index, Napi::BigInt::New(env, handles.textureHandleValues[index]));
    }
    result.Set("textureHandles", textures);
    result.Set("controlHandle", Napi::BigInt::New(env, handles.controlHandleValue));
    return result;
}

static Napi::Value EngineGetOutputColorConfig(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBigInt()) {
        Napi::TypeError::New(env, "BigInt engine handle expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    IlyOutputColorConfig config{};
    IlyResult result = IlyEngineGetOutputColorConfig(Uint64ToResourceHandle(engineVal), &config);
    if (result != ILY_SUCCESS) {
        Napi::Error::New(env, "Failed to get output color config, code: " + std::to_string(result)).ThrowAsJavaScriptException();
        return env.Null();
    }
    return OutputColorConfigToObject(env, config);
}

static Napi::Value EngineDrawQuad(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 5 || !info[0].IsBigInt() || !info[1].IsBigInt() || !info[2].IsObject() || !info[3].IsNumber() || !info[4].IsNumber()) {
        Napi::TypeError::New(env, "Expected (BigInt, BigInt, Object, Number, Number)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint64_t textureVal = info[1].As<Napi::BigInt>().Uint64Value(&lossless);

    Napi::Object tObj = info[2].As<Napi::Object>();
    IlyTransform transform{};
    
    // Unpack transform
    Napi::Object posObj = tObj.Get("position").As<Napi::Object>();
    transform.position.x = posObj.Get("x").As<Napi::Number>().FloatValue();
    transform.position.y = posObj.Get("y").As<Napi::Number>().FloatValue();
    transform.position.z = posObj.Get("z").As<Napi::Number>().FloatValue();

    Napi::Object rotObj = tObj.Get("rotation").As<Napi::Object>();
    transform.rotation.x = rotObj.Get("x").As<Napi::Number>().FloatValue();
    transform.rotation.y = rotObj.Get("y").As<Napi::Number>().FloatValue();
    transform.rotation.z = rotObj.Get("z").As<Napi::Number>().FloatValue();

    Napi::Object scaleObj = tObj.Get("scale").As<Napi::Object>();
    transform.scale.x = scaleObj.Get("x").As<Napi::Number>().FloatValue();
    transform.scale.y = scaleObj.Get("y").As<Napi::Number>().FloatValue();
    transform.scale.z = scaleObj.Get("z").As<Napi::Number>().FloatValue();

    Napi::Object anchorObj = tObj.Get("anchor").As<Napi::Object>();
    transform.anchor.x = anchorObj.Get("x").As<Napi::Number>().FloatValue();
    transform.anchor.y = anchorObj.Get("y").As<Napi::Number>().FloatValue();

    Napi::Object pivotObj = tObj.Get("pivot").As<Napi::Object>();
    transform.pivot.x = pivotObj.Get("x").As<Napi::Number>().FloatValue();
    transform.pivot.y = pivotObj.Get("y").As<Napi::Number>().FloatValue();

    Napi::Object cropObj = tObj.Get("crop").As<Napi::Object>();
    transform.crop.left = cropObj.Get("left").As<Napi::Number>().FloatValue();
    transform.crop.top = cropObj.Get("top").As<Napi::Number>().FloatValue();
    transform.crop.right = cropObj.Get("right").As<Napi::Number>().FloatValue();
    transform.crop.bottom = cropObj.Get("bottom").As<Napi::Number>().FloatValue();

    transform.visibility = tObj.Get("visibility").As<Napi::Boolean>().Value();
    transform.opacity = tObj.Get("opacity").As<Napi::Number>().FloatValue();

    float opacity = info[3].As<Napi::Number>().FloatValue();
    IlyBlendMode blendMode = static_cast<IlyBlendMode>(info[4].As<Napi::Number>().Uint32Value());

    IlyResult res = IlyEngineDrawQuad(
        Uint64ToResourceHandle(engineVal),
        Uint64ToResourceHandle(textureVal),
        &transform,
        opacity,
        blendMode
    );

    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Value EngineDestroyTexture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBigInt() || !info[1].IsBigInt()) {
        Napi::TypeError::New(env, "Expected (BigInt, BigInt)").ThrowAsJavaScriptException();
        return env.Null();
    }
    bool lossless;
    uint64_t engineVal = info[0].As<Napi::BigInt>().Uint64Value(&lossless);
    uint64_t textureVal = info[1].As<Napi::BigInt>().Uint64Value(&lossless);

    IlyResult res = IlyEngineDestroyTexture(Uint64ToResourceHandle(engineVal), Uint64ToResourceHandle(textureVal));
    return Napi::Number::New(env, static_cast<double>(res));
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("initializeSystem", Napi::Function::New(env, InitSystem));
    exports.Set("shutdownSystem", Napi::Function::New(env, ShutdownSystem));
    exports.Set("getPlatformCapabilities", Napi::Function::New(env, GetPlatformCapabilities));
    exports.Set("secureStoreIsAvailable", Napi::Function::New(env, SecureStoreIsAvailable));
    exports.Set("secureStoreEncrypt", Napi::Function::New(env, SecureStoreEncrypt));
    exports.Set("secureStoreDecrypt", Napi::Function::New(env, SecureStoreDecrypt));
    exports.Set("createEngine", Napi::Function::New(env, CreateEngine));
    exports.Set("destroyEngine", Napi::Function::New(env, DestroyEngine));
    exports.Set("engineUpdate", Napi::Function::New(env, EngineUpdate));
    exports.Set("engineRender", Napi::Function::New(env, EngineRender));
    exports.Set("engineSetSceneJson", Napi::Function::New(env, EngineSetSceneJson));
    exports.Set("engineGetSceneJson", Napi::Function::New(env, EngineGetSceneJson));
    exports.Set("engineRegisterSource", Napi::Function::New(env, EngineRegisterSource));
    exports.Set("engineUnregisterSource", Napi::Function::New(env, EngineUnregisterSource));
    
    // New texture pipeline bindings
    exports.Set("engineLoadTexture", Napi::Function::New(env, EngineLoadTexture));
    exports.Set("engineDestroyTexture", Napi::Function::New(env, EngineDestroyTexture));
    exports.Set("engineCreateColorTexture", Napi::Function::New(env, EngineCreateColorTexture));
    exports.Set("engineCreateTextureFromPixels", Napi::Function::New(env, EngineCreateTextureFromPixels));
    exports.Set("engineCreateTextureFromPixelsEx", Napi::Function::New(env, EngineCreateTextureFromPixelsEx));
    exports.Set("engineCreateSharedTexture", Napi::Function::New(env, EngineCreateSharedTexture));
    exports.Set("engineCreateScreenCapture", Napi::Function::New(env, EngineCreateScreenCapture));
    exports.Set("listScreenCaptureDisplays", Napi::Function::New(env, ListScreenCaptureDisplays));
    exports.Set("engineCreateCameraCapture", Napi::Function::New(env, EngineCreateCameraCapture));
    exports.Set("listCameraCaptureDevices", Napi::Function::New(env, ListCameraCaptureDevices));
    exports.Set("engineUpdateTexture", Napi::Function::New(env, EngineUpdateTexture));
    exports.Set("engineCreateSpriteProgram", Napi::Function::New(env, EngineCreateSpriteProgram));
    exports.Set("engineDrawQuad", Napi::Function::New(env, EngineDrawQuad));

    // Compositor present surface
    exports.Set("engineSetLayers", Napi::Function::New(env, EngineSetLayers));
    exports.Set("engineCreateOutput", Napi::Function::New(env, EngineCreateOutput));
    exports.Set("engineDestroyOutput", Napi::Function::New(env, EngineDestroyOutput));
    exports.Set("engineGetSharedOutputTexture", Napi::Function::New(env, EngineGetSharedOutputTexture));
    exports.Set("engineGetProgramExportDescriptor", Napi::Function::New(env, EngineGetProgramExportDescriptor));
    exports.Set("engineSetProgramExportEnabled", Napi::Function::New(env, EngineSetProgramExportEnabled));
    exports.Set("engineDuplicateProgramExportHandles", Napi::Function::New(env, EngineDuplicateProgramExportHandles));
    exports.Set("engineGetOutputColorConfig", Napi::Function::New(env, EngineGetOutputColorConfig));
    exports.Set("engineReadPixels", Napi::Function::New(env, EngineReadPixels));
    return exports;
}

NODE_API_MODULE(ilystream_napi, Init)
