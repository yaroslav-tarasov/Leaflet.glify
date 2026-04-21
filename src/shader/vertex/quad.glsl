uniform mat4 matrix;

attribute vec2 vertex;
attribute vec4 color;
attribute vec2 tex_coord;

varying vec4 _color;
varying vec2 _tex_coord;

void main() {

  //pass the color to the fragment shader
  _color = color;
  _tex_coord = tex_coord;

  //multiply each vertex by a matrix.
  gl_Position = matrix * vec4(vertex, 0, 1.0);

}
