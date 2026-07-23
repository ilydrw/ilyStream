$input v_texcoord0, v_color0

#include <bgfx_shader.sh>

SAMPLER2D(s_texColor, 0);
uniform vec4 u_sourceColor;
// Chroma key (matches the app's canvas compositor math, gamma-space):
// u_chromaKey    = (keyR, keyG, keyB, similarity)
// u_chromaParams = (smoothness, spill, enabled, unused)
uniform vec4 u_chromaKey;
uniform vec4 u_chromaParams;
// Color adjust (matches the app's CSS-filter enhancement chain, composed into
// one gamma-space 3x4 matrix by the host):
// u_colorMatR/G/B = matrix rows (mR, mG, mB, offset)
// u_colorAdjust   = (enabled, alphaMul, unused, unused)
uniform vec4 u_colorMatR;
uniform vec4 u_colorMatG;
uniform vec4 u_colorMatB;
uniform vec4 u_colorAdjust;
// Rounded corners (matches the canvas roundRect clip):
// u_cornerRadius = (radiusPx, quadWidthPx, quadHeightPx, enabled)
// u_cornerRect   = quad texcoord bounds (u0, v0, u1, v1) — the vertex UVs
//                  span the crop rect, so quad-local UVs are recovered here.
uniform vec4 u_cornerRadius;
uniform vec4 u_cornerRect;
// Circle mask (sharp region of the focus-circle effect):
// u_circleMask = (centerX, centerY, radius, enabled), quad-local pixels from
// the quad's top-left in texcoord orientation. Reuses u_cornerRadius.yz for
// the quad's pixel size and u_cornerRect for the texcoord bounds.
uniform vec4 u_circleMask;
// Image mask (OBS-style): a second texture whose alpha cuts the layer, stretched
// across the quad (matching the canvas destination-in over the layout rect).
// u_maskParams = (enabled, unused, unused, unused). Alpha-mode only, matching
// the broadcast compositor. Sampled in quad-local UV via u_cornerRect.
SAMPLER2D(s_maskTex, 1);
uniform vec4 u_maskParams;

vec3 linearToSrgb(vec3 value)
{
	value = max(value, vec3_splat(0.0));
	vec3 low = value * 12.92;
	vec3 high = 1.055 * pow(value, vec3_splat(1.0 / 2.4)) - 0.055;
	return mix(low, high, step(vec3_splat(0.0031308), value));
}

vec3 srgbToLinear(vec3 value)
{
	vec3 low = value / 12.92;
	vec3 high = pow(max((value + 0.055) / 1.055, vec3_splat(0.0)), vec3_splat(2.4));
	return mix(low, high, step(vec3_splat(0.04045), value));
}

vec3 bt709ToLinear(vec3 value)
{
	vec3 low = value / 4.5;
	vec3 high = pow(max((value + 0.099) / 1.099, vec3_splat(0.0)), vec3_splat(1.0 / 0.45));
	return mix(low, high, step(vec3_splat(0.081), value));
}

vec3 pqToLinear(vec3 value)
{
	const float m1 = 0.1593017578125;
	const float m2 = 78.84375;
	const float c1 = 0.8359375;
	const float c2 = 18.8515625;
	const float c3 = 18.6875;
	vec3 powered = pow(max(value, vec3_splat(0.0)), vec3_splat(1.0 / m2));
	vec3 numerator = max(powered - c1, vec3_splat(0.0));
	vec3 denominator = max(c2 - c3 * powered, vec3_splat(0.000001));
	return pow(numerator / denominator, vec3_splat(1.0 / m1)) * u_sourceColor.w;
}

vec3 hlgToLinear(vec3 value)
{
	const float a = 0.17883277;
	const float b = 0.28466892;
	const float c = 0.55991073;
	vec3 low = (value * value) / 3.0;
	vec3 high = (exp((value - c) / a) + b) / 12.0;
	return mix(low, high, step(vec3_splat(0.5), value)) * u_sourceColor.w;
}

vec3 bt2020ToBt709(vec3 value)
{
	return vec3(
		1.660491 * value.r - 0.587641 * value.g - 0.072850 * value.b,
		-0.124550 * value.r + 1.132900 * value.g - 0.008349 * value.b,
		-0.018151 * value.r - 0.100579 * value.g + 1.118730 * value.b);
}

/*
 * Sprite fragment shader: sample the source texture and modulate by the
 * per-vertex color. The vertex color carries the composited opacity in its
 * alpha channel (see BgfxBackend::DrawQuad), so this multiply applies tint and
 * alpha in one step.
 */
void main()
{
	vec4 color = texture2D(s_texColor, v_texcoord0);

	// Chroma key runs on the stored (gamma-encoded) values BEFORE the EOTF
	// decode below, replicating the canvas compositor's 8-bit RGB-distance
	// math so key settings tuned there look identical here.
	float chromaAlpha = 1.0;
	if (u_chromaParams.z > 0.5) {
		float similarity = u_chromaKey.w;
		float smoothness = max(u_chromaParams.x, 0.0001);
		float spill = u_chromaParams.y;
		// Canvas: sqrt(dr^2+dg^2+db^2)/441.6 over 0..255 == length/sqrt(3) over 0..1.
		float dist = length(color.rgb - u_chromaKey.xyz) * 0.57735;
		chromaAlpha = clamp((dist - similarity) / smoothness, 0.0, 1.0);
		if (spill > 0.0 && dist < similarity + spill) {
			float avg = (color.r + color.b) * 0.5;
			if (color.g > avg) {
				color.g = avg + (color.g - avg) * (dist / (similarity + spill));
			}
		}
	}

	// Color adjust: CSS filters are defined on straight-alpha, gamma-encoded
	// sRGB values (the space the canvas compositor's ctx.filter works in).
	// sRGB sources carry BGFX_TEXTURE_SRGB, so the sampler hands us LINEAR
	// values — round-trip through the sRGB encode so the matrix matches the
	// canvas exactly. Other transfers (BT709/PQ/HLG) sample as stored values
	// and are decoded below, so the matrix applies to them directly.
	if (u_colorAdjust.x > 0.5) {
		float premulAlpha = u_sourceColor.z > 1.5 ? max(color.a, 0.0001) : 1.0;
		vec3 adjusted = color.rgb / premulAlpha;
		if (u_sourceColor.x < 0.5) {
			adjusted = linearToSrgb(adjusted);
		}
		adjusted = vec3(
			dot(adjusted, u_colorMatR.xyz) + u_colorMatR.w,
			dot(adjusted, u_colorMatG.xyz) + u_colorMatG.w,
			dot(adjusted, u_colorMatB.xyz) + u_colorMatB.w);
		adjusted = clamp(adjusted, vec3_splat(0.0), vec3_splat(1.0));
		if (u_sourceColor.x < 0.5) {
			adjusted = srgbToLinear(adjusted);
		}
		color.rgb = adjusted * premulAlpha;
		// CSS opacity() steps: scale alpha, and for premultiplied sources the
		// stored rgb as well so the premul invariant (rgb <= a) holds.
		chromaAlpha *= u_colorAdjust.y;
		if (u_sourceColor.z > 1.5) {
			color.rgb *= u_colorAdjust.y;
		}
	}

	// Rounded-corner mask: signed distance to a rounded rectangle in quad
	// pixel space, feathered over ~1px like the canvas clip's antialiasing.
	if (u_cornerRadius.w > 0.5) {
		vec2 span = max(u_cornerRect.zw - u_cornerRect.xy, vec2_splat(0.0001));
		vec2 quadUV = clamp((v_texcoord0.xy - u_cornerRect.xy) / span, vec2_splat(0.0), vec2_splat(1.0));
		vec2 quadSize = u_cornerRadius.yz;
		float radius = min(u_cornerRadius.x, 0.5 * min(quadSize.x, quadSize.y));
		vec2 fromCenter = (quadUV - vec2_splat(0.5)) * quadSize;
		vec2 cornerDist = abs(fromCenter) - (0.5 * quadSize - vec2_splat(radius));
		float sdf = length(max(cornerDist, vec2_splat(0.0))) + min(max(cornerDist.x, cornerDist.y), 0.0) - radius;
		float cornerMask = clamp(0.5 - sdf, 0.0, 1.0);
		chromaAlpha *= cornerMask;
		if (u_sourceColor.z > 1.5) {
			color.rgb *= cornerMask;
		}
	}

	// Circle mask: antialiased disc, everything outside is cut. Matches the
	// canvas focus-circle arc clip.
	if (u_circleMask.w > 0.5) {
		vec2 circleSpan = max(u_cornerRect.zw - u_cornerRect.xy, vec2_splat(0.0001));
		vec2 circleUV = clamp((v_texcoord0.xy - u_cornerRect.xy) / circleSpan, vec2_splat(0.0), vec2_splat(1.0));
		vec2 quadPos = circleUV * u_cornerRadius.yz;
		float circleSdf = length(quadPos - u_circleMask.xy) - u_circleMask.z;
		float circleMask = clamp(0.5 - circleSdf, 0.0, 1.0);
		chromaAlpha *= circleMask;
		if (u_sourceColor.z > 1.5) {
			color.rgb *= circleMask;
		}
	}

	// Image mask: the mask texture's alpha multiplies the layer's, stretched
	// across the quad (canvas destination-in over the layout rect). Alpha only.
	if (u_maskParams.x > 0.5) {
		vec2 maskSpan = max(u_cornerRect.zw - u_cornerRect.xy, vec2_splat(0.0001));
		vec2 maskUV = clamp((v_texcoord0.xy - u_cornerRect.xy) / maskSpan, vec2_splat(0.0), vec2_splat(1.0));
		float maskAlpha = texture2D(s_maskTex, maskUV).a;
		chromaAlpha *= maskAlpha;
		if (u_sourceColor.z > 1.5) {
			color.rgb *= maskAlpha;
		}
	}

	if (u_sourceColor.x > 0.5 && u_sourceColor.x < 1.5) {
		color.rgb = bt709ToLinear(color.rgb);
	} else if (u_sourceColor.x > 1.5 && u_sourceColor.x < 2.5) {
		color.rgb = pqToLinear(color.rgb);
	} else if (u_sourceColor.x > 2.5 && u_sourceColor.x < 3.5) {
		color.rgb = hlgToLinear(color.rgb);
	} else if (u_sourceColor.x > 3.5) {
		// Mode 4: blur intermediate — premultiplied sRGB-gamma RGBA16F written
		// by an encode-output pass below. Unpremultiply, decode, repremultiply.
		float intermediateAlpha = max(color.a, 0.0001);
		color.rgb = srgbToLinear(color.rgb / intermediateAlpha) * intermediateAlpha;
	}
	if (u_sourceColor.x < 0.5) {
		color.rgb *= u_sourceColor.w;
	}
	if (u_sourceColor.y > 0.5) {
		color.rgb = bt2020ToBt709(color.rgb);
	}

	float sourceAlpha = (u_sourceColor.z < 0.5 ? 1.0 : color.a) * chromaAlpha;
	float finalAlpha = sourceAlpha * v_color0.a;
	if (u_sourceColor.z < 1.5) {
		color.rgb *= finalAlpha;
	} else {
		color.rgb *= v_color0.a;
	}
	color.a = finalAlpha;

	// Encode-output mode (u_colorAdjust.z): re-encode the premultiplied LINEAR
	// result to premultiplied sRGB gamma. Blur intermediates store gamma so the
	// blur happens in the same space the canvas compositor's CSS blur() uses;
	// the composite pass decodes it back via source mode 4 above.
	if (u_colorAdjust.z > 0.5) {
		float encodeAlpha = max(color.a, 0.0001);
		color.rgb = linearToSrgb(color.rgb / encodeAlpha) * encodeAlpha;
	}
	gl_FragColor = color;
}
