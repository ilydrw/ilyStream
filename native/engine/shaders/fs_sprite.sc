$input v_texcoord0, v_color0

#include <bgfx_shader.sh>

SAMPLER2D(s_texColor, 0);
uniform vec4 u_sourceColor;
// Chroma key (matches the app's canvas compositor math, gamma-space):
// u_chromaKey    = (keyR, keyG, keyB, similarity)
// u_chromaParams = (smoothness, spill, enabled, unused)
uniform vec4 u_chromaKey;
uniform vec4 u_chromaParams;

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

	if (u_sourceColor.x > 0.5 && u_sourceColor.x < 1.5) {
		color.rgb = bt709ToLinear(color.rgb);
	} else if (u_sourceColor.x > 1.5 && u_sourceColor.x < 2.5) {
		color.rgb = pqToLinear(color.rgb);
	} else if (u_sourceColor.x > 2.5) {
		color.rgb = hlgToLinear(color.rgb);
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
	gl_FragColor = color;
}
