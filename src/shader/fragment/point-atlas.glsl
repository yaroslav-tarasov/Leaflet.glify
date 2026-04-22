precision mediump float;
varying vec4 _color;
uniform sampler2D spriteTexture;  // texture we are drawing

void main() {
  float atlas_size = 4.0;
  vec2 tex_coord = vec2(floor(_color.w),  fract(_color.w) * 100.0 ) / atlas_size; 
  float pixmtex_coordap = texture2D(spriteTexture, vec2(gl_PointCoord.x / atlas_size, (gl_PointCoord.y / atlas_size - 0.01)) + tex_coord).r; 
  gl_FragColor =  vec4(_color.xyz,1.0) * vec4(vec3(1.0), pixmtex_coordap);
}
