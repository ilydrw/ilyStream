$input a_position, a_texcoord0, a_color0
$output v_texcoord0, v_color0

#include <bgfx_shader.sh>

/*
 * Sprite pass-through vertex shader.
 *
 * Positions arrive already in normalized device coordinates: the CPU-side
 * compositor (BgfxBackend::DrawQuad) bakes transform/anchor/pivot/rotation and
 * the screen->NDC mapping into each vertex, so the GPU only forwards them.
 * Keep this a straight pass-through; do not add an MVP here or it will
 * double-transform the quad.
 */
void main()
{
	gl_Position = vec4(a_position, 1.0);
	v_texcoord0 = a_texcoord0;
	v_color0    = a_color0;
}
