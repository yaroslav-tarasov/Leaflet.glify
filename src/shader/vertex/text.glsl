#if 0

uniform mat4 matrix;

attribute vec2 vertex;
attribute vec4 tex0;
attribute vec4 scale_params;

varying vec4 _color;
varying vec2 _tex_coord;

void main() {
   
  gl_PointSize = 4.0;
  //pass the color to the fragment shader
  _color = matrix * vec4(vertex, 0, 1.0) + tex0;
  _tex_coord = scale_params.xy;

  //multiply each vertex by a matrix.
  gl_Position = matrix * vec4(vertex, 0, 1.0);

}

#else
#if 1

attribute vec2  vertex;        // Vertex position
attribute vec4  tex0;       // Tex coord
attribute vec4  scale_params;

// uniform vec2  sdf_tex_size; // Size of font texture in pixels
// uniform mat3  transform;
uniform mat4  matrix;
// uniform float sdf_border_size;

varying vec4  tc0;
varying float doffset;
varying vec2  sdf_texel;
varying float subpixel_offset;
varying float proportion;

void main(void) {
    
    vec2  sdf_tex_size = vec2(1024.0, 1024.0); // TODO uniform
    float sdf_border_size = 0.009766; // TODO uniform

    gl_PointSize = 24.0; // TODO scale_params.z;
    float scale = scale_params.x;
    proportion = scale_params.y;
    float sdf_size = 2.0 * scale * sdf_border_size;
    tc0 = tex0;
    doffset = 1.0 / sdf_size;         // Distance field delta in screen pixels
    sdf_texel = 1.0 / sdf_tex_size;
    subpixel_offset = 0.3333 / scale; // 1/3 of screen pixel to texels

    // vec3 screen_pos = transform * vec3( pos, 1.0 );
    vec4 screen_pos = matrix * vec4( vertex, 0.0, 1.0 ) + vec4(scale_params.w / ( scale * 4.0 ), -0.015 , 0.0, 0.0);
    gl_Position = vec4( screen_pos.xy, 0.0, 1.0 );
}
#else
attribute vec2  vertex;        // Vertex position
attribute vec4  tex0;       // Tex coord
attribute vec4  scale_params;   // Signed distance field size in screen pixels

// uniform vec2  sdf_tex_size; // Size of font texture in pixels
uniform mat4  matrix;

varying vec4  tc0;
varying float doffset;
varying vec2  sdf_texel;
varying float proportion;

void main(void) {
    vec2  sdf_tex_size = vec2(1024.0, 1024.0); // TODO uniform
    
    gl_PointSize = 16.0; // TODO scale_params.z;
    float scale = scale_params.x;
    proportion = scale_params.y;
    float sdf_size = 2.0 * scale ;

    tc0 = tex0;
    doffset = 1.0 / sdf_size;       // Distance field delta for one screen pixel
    sdf_texel = 1.0 / sdf_tex_size;

    vec4 screen_pos = matrix * vec4( vertex, 0.0, 1.0 ) + vec4(scale_params.w / ( scale * 4.0 ), -0.015 , 0.0, 0.0);
    gl_Position = vec4( screen_pos.xy, 0.0, 1.0 );
}



#endif 
#endif

