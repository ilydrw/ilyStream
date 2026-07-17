$input v_texcoord0, v_color0

#include <bgfx_shader.sh>

SAMPLER2D(s_texColor, 0);

/*
 * Sprite fragment shader: sample the source texture and modulate by the
 * per-vertex color. The vertex color carries the composited opacity in its
 * alpha channel (see BgfxBackend::DrawQuad), so this multiply applies tint and
 * alpha in one step.
 */
void main()
{
	gl_FragColor = texture2D(s_texColor, v_texcoord0) * v_color0;
}
