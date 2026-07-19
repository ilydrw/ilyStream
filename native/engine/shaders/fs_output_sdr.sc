$input v_texcoord0, v_color0

#include <bgfx_shader.sh>

SAMPLER2D(s_texColor, 0);
uniform vec4 u_outputColor;

vec3 linearToSrgb(vec3 value)
{
	value = max(value, vec3_splat(0.0));
	vec3 low = value * 12.92;
	vec3 high = 1.055 * pow(value, vec3_splat(1.0 / 2.4)) - 0.055;
	return mix(low, high, step(vec3_splat(0.0031308), value));
}

vec3 linearToBt709(vec3 value)
{
	value = max(value, vec3_splat(0.0));
	vec3 low = value * 4.5;
	vec3 high = 1.099 * pow(value, vec3_splat(0.45)) - 0.099;
	return mix(low, high, step(vec3_splat(0.018), value));
}

vec3 toneMapHdrToSdr(vec3 value)
{
	float peak = max(max(value.r, value.g), value.b);
	if (peak <= 0.75) return value;
	float mappedPeak = 0.75 + 0.25 * (1.0 - exp(-(peak - 0.75) / 0.25));
	return value * (mappedPeak / max(peak, 0.000001));
}

vec3 preserveHdrBlack(vec3 value)
{
	// Windows HDR composition can encode nominal SDR black dithering just above
	// zero. Collapse only values below sRGB code 3 so black remains
	// neutral without crushing the first visible shadow steps.
	float peak = max(max(value.r, value.g), value.b);
	return peak <= 0.00075 ? vec3_splat(0.0) : value;
}

float interleavedGradientNoise(vec2 position)
{
	return fract(52.9829189 * fract(dot(position, vec2(0.06711056, 0.00583715))));
}

vec3 ditherEncodedSdr(vec3 value, vec2 position)
{
	float peak = max(max(value.r, value.g), value.b);
	float shadowGate = smoothstep(3.0 / 255.0, 8.0 / 255.0, peak);
	float highlightGate = 1.0 - smoothstep(250.0 / 255.0, 1.0, peak);
	float noise = (interleavedGradientNoise(position) - 0.5) / 255.0;
	return clamp(value + vec3_splat(noise * shadowGate * highlightGate), vec3_splat(0.0), vec3_splat(1.0));
}

void main()
{
	vec4 color = texture2D(s_texColor, v_texcoord0);
	if (u_outputColor.w > 0.5) {
		color.rgb = preserveHdrBlack(color.rgb);
	}
	vec3 mapped = u_outputColor.w > 0.5 ? toneMapHdrToSdr(color.rgb) : color.rgb;
	mapped = clamp(mapped, vec3_splat(0.0), vec3_splat(1.0));
	color.rgb = u_outputColor.x > 0.5 ? linearToBt709(mapped) : linearToSrgb(mapped);
	if (u_outputColor.w > 0.5) {
		color.rgb = ditherEncodedSdr(color.rgb, gl_FragCoord.xy);
	}
	gl_FragColor = color;
}
