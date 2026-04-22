precision mediump float;
varying vec4 _color;
varying vec2 _tex_coord;

void main() {
    vec4 color = vec4( _color.xyz, 0.5);
    vec4 baseColor = vec4(_color.xyz, 0.5);

    float d = distance (_tex_coord , vec2(0.5, 0.5));

    float borderThickness = 0.008;
    float radius = 0.50 - borderThickness;

    float t1 = 1.0 - smoothstep(radius-borderThickness, radius, d);
    float t2 = (1.0 - t1 * 0.5) - smoothstep(radius, radius+borderThickness, d);
    // gl_FragColor = vec4(1.0,0.0,0.0,0.3);
    gl_FragColor = vec4(mix(color.rgb, baseColor.rgb, t1), t2);
}
