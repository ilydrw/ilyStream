#include <napi.h>
#include "ily/engine.h"
#include <string>
#include <vector>

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
    }

    IlyResult res = IlyEngineSetLayers(Uint64ToResourceHandle(engineVal),
                                       count > 0 ? layers.data() : nullptr, count);
    return Napi::Number::New(env, static_cast<double>(res));
}

// engineReadPixels(engineHandle: BigInt, buffer: Buffer) ->
// { result, width, height }. buffer is filled with tightly packed RGBA8.
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
    IlyResult res = IlyEngineReadPixels(Uint64ToResourceHandle(engineVal),
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
    IlyResult res = IlyEngineGetSharedOutputTexture(
        Uint64ToResourceHandle(engineVal), &nativeHandle, &width, &height);
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
    exports.Set("engineCreateScreenCapture", Napi::Function::New(env, EngineCreateScreenCapture));
    exports.Set("listScreenCaptureDisplays", Napi::Function::New(env, ListScreenCaptureDisplays));
    exports.Set("engineUpdateTexture", Napi::Function::New(env, EngineUpdateTexture));
    exports.Set("engineCreateSpriteProgram", Napi::Function::New(env, EngineCreateSpriteProgram));
    exports.Set("engineDrawQuad", Napi::Function::New(env, EngineDrawQuad));

    // Compositor present surface
    exports.Set("engineSetLayers", Napi::Function::New(env, EngineSetLayers));
    exports.Set("engineGetSharedOutputTexture", Napi::Function::New(env, EngineGetSharedOutputTexture));
    exports.Set("engineGetOutputColorConfig", Napi::Function::New(env, EngineGetOutputColorConfig));
    exports.Set("engineReadPixels", Napi::Function::New(env, EngineReadPixels));
    return exports;
}

NODE_API_MODULE(ilystream_napi, Init)
