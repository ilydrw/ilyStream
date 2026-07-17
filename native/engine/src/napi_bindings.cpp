#include <napi.h>
#include "ily/engine.h"
#include <string>
#include <vector>

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
    exports.Set("engineCreateSpriteProgram", Napi::Function::New(env, EngineCreateSpriteProgram));
    exports.Set("engineDrawQuad", Napi::Function::New(env, EngineDrawQuad));
    return exports;
}

NODE_API_MODULE(ilystream_napi, Init)
