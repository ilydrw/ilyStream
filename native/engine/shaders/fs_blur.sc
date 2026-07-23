$input v_texcoord0, v_color0

#include <bgfx_shader.sh>

SAMPLER2D(s_texColor, 0);
// One axis of a separable Gaussian:
// u_blurParams   = (stepU, stepV, unused, unused) — one-texel step along the axis
// u_blurWeights  = 13 kernel weights (center + 12 offsets), CPU-normalized so
//                  w0 + 2*(w1..w12) == 1. Weights beyond the active radius are 0.
uniform vec4 u_blurParams;
uniform vec4 u_blurWeights[4];

/*
 * Separable Gaussian blur pass over a premultiplied RGBA intermediate. The
 * kernel is a fixed 25-tap (radius 12) unrolled loop — constant indices only,
 * so every shader backend (glsl 120 included) compiles it. The CPU computes
 * the weights for the requested sigma and zero-fills the tail, so smaller
 * blurs simply waste a few zero-weight fetches.
 */
void main()
{
	vec2 uv = v_texcoord0.xy;
	vec2 st = u_blurParams.xy;
	vec4 sum = texture2D(s_texColor, uv) * u_blurWeights[0].x;
	sum += (texture2D(s_texColor, uv + st        ) + texture2D(s_texColor, uv - st        )) * u_blurWeights[0].y;
	sum += (texture2D(s_texColor, uv + st *  2.0) + texture2D(s_texColor, uv - st *  2.0)) * u_blurWeights[0].z;
	sum += (texture2D(s_texColor, uv + st *  3.0) + texture2D(s_texColor, uv - st *  3.0)) * u_blurWeights[0].w;
	sum += (texture2D(s_texColor, uv + st *  4.0) + texture2D(s_texColor, uv - st *  4.0)) * u_blurWeights[1].x;
	sum += (texture2D(s_texColor, uv + st *  5.0) + texture2D(s_texColor, uv - st *  5.0)) * u_blurWeights[1].y;
	sum += (texture2D(s_texColor, uv + st *  6.0) + texture2D(s_texColor, uv - st *  6.0)) * u_blurWeights[1].z;
	sum += (texture2D(s_texColor, uv + st *  7.0) + texture2D(s_texColor, uv - st *  7.0)) * u_blurWeights[1].w;
	sum += (texture2D(s_texColor, uv + st *  8.0) + texture2D(s_texColor, uv - st *  8.0)) * u_blurWeights[2].x;
	sum += (texture2D(s_texColor, uv + st *  9.0) + texture2D(s_texColor, uv - st *  9.0)) * u_blurWeights[2].y;
	sum += (texture2D(s_texColor, uv + st * 10.0) + texture2D(s_texColor, uv - st * 10.0)) * u_blurWeights[2].z;
	sum += (texture2D(s_texColor, uv + st * 11.0) + texture2D(s_texColor, uv - st * 11.0)) * u_blurWeights[2].w;
	sum += (texture2D(s_texColor, uv + st * 12.0) + texture2D(s_texColor, uv - st * 12.0)) * u_blurWeights[3].x;
	gl_FragColor = sum;
}
