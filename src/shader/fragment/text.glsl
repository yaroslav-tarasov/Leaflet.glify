#if 0
precision mediump float;
varying vec4 _color;
uniform sampler2D spriteTexture;  // texture we are drawing

void main() {
  float atlas_size = 4.0;
  vec2 tex_coord = vec2(floor(_color.w),  fract(_color.w) * 100.0 ) / atlas_size; 
  // float pixmtex_coordap = texture2D(spriteTexture, vec2(gl_PointCoord.x / atlas_size, (gl_PointCoord.y / atlas_size - 0.01)) + tex_coord).r; 
  gl_FragColor =  vec4(1.0, 0.0, 0.0, 1.0);
}

#else

#if 1 

precision mediump float;

uniform sampler2D font_tex;
// uniform float hint_amount = 1.0;
// uniform float subpixel_amount = 1.0;
// uniform vec4  font_color;

float hint_amount = 1.0;
float subpixel_amount = 0.0;
vec4  font_color = vec4(0.0, 0.00, 0.00, 1.0);

varying vec4  tc0;
varying float doffset;
varying vec2  sdf_texel;
varying float subpixel_offset;
varying float proportion;

vec3 sdf_triplet_alpha( vec3 sdf, float horz_scale, float vert_scale, float vgrad ) {
    float hdoffset = mix( doffset * horz_scale, doffset * vert_scale, vgrad );
    float rdoffset = mix( doffset, hdoffset, hint_amount );
    vec3 alpha = smoothstep( vec3( 0.5 - rdoffset ), vec3( 0.5 + rdoffset ), sdf );
    alpha = pow( alpha, vec3( 1.0 + 0.2 * vgrad * hint_amount ) );
    return alpha;
}

float sdf_alpha( float sdf, float horz_scale, float vert_scale, float vgrad ) {
    float hdoffset = mix( doffset * horz_scale, doffset * vert_scale, vgrad );
    float rdoffset = mix( doffset, hdoffset, hint_amount );
    float alpha = smoothstep( 0.5 - rdoffset, 0.5 + rdoffset, sdf );
    alpha = pow( alpha, 1.0 + 0.2 * vgrad * hint_amount );
    return alpha;
}

void main() {
    vec2 pUv = gl_PointCoord;
    // pUv.y = 1. - pUv.y;
    pUv.x = (pUv.x - 0.5) / proportion + 0.5;
    if ( pUv.x > 1.0 || pUv.x < 0.0 )
      discard;

    vec2 uv = tc0.xz + vec2(tc0.y - tc0.x, tc0.w - tc0.z) * pUv ; // tc0;

    // Sampling the texture, L pattern
    float sdf       = texture2D( font_tex, uv ).r;
    float sdf_north = texture2D( font_tex, uv + vec2( 0.0, sdf_texel.y ) ).r;
    float sdf_east  = texture2D( font_tex, uv + vec2( sdf_texel.x, 0.0 ) ).r;

    // Estimating stroke direction by the distance field gradient vector
    vec2  sgrad     = vec2( sdf_east - sdf, sdf_north - sdf );
    float sgrad_len = max( length( sgrad ), 1.0 / 128.0 );
    vec2  grad      = sgrad / vec2( sgrad_len );
    float vgrad = abs( grad.y ); // 0.0 - vertical stroke, 1.0 - horizontal one

    if ( subpixel_amount > 0.0 ) {
        // Subpixel SDF samples
        vec2  subpixel = vec2( subpixel_offset, 0.0 );

        // For displays with vertical subpixel placement:
        // vec2 subpixel = vec2( 0.0, subpixel_offset );

        float sdf_sp_n  = texture2D( font_tex, uv - subpixel ).r;
        float sdf_sp_p  = texture2D( font_tex, uv + subpixel ).r;

        float horz_scale  = 0.5; // Should be 0.33333, a subpixel size, but that is too colorful
        float vert_scale  = 0.6;

        vec3 triplet_alpha = sdf_triplet_alpha( vec3( sdf_sp_n, sdf, sdf_sp_p ), horz_scale, vert_scale, vgrad );

        // For BGR subpixels:
        // triplet_alpha = triplet.bgr

        gl_FragColor = vec4( triplet_alpha, 1.0 );

    } else {
        float horz_scale  = 1.1;
        float vert_scale  = 0.6;

        float alpha = sdf_alpha( sdf,horz_scale, vert_scale, vgrad );
        gl_FragColor = vec4( font_color.rgb, font_color.a * alpha );
    }
}
#else

           

precision mediump float;

uniform sampler2D font_tex;
// uniform float hint_amount;
// uniform float subpixel_amount;

float hint_amount = 1.0;
float subpixel_amount = 0.0;
vec3  font_color = vec3(0.0, 0.00, 0.00);
vec3  bg_color = vec3(0.0, 0.0, 0.0);

// uniform vec3 bg_color;
//uniform vec3 font_color;

varying vec4  tc0;
varying float doffset;
varying vec2  sdf_texel;

varying float subpixel_offset;
varying float proportion;

/*
 *  Subpixel coverage calculation
 *    
 *  v - edge slope    -1.0 to 1.0          triplet
 *  a - pixel coverage 0.0 to 1.0          coverage
 *                                       
 *      |<- glyph edge                      R  G  B
 *  +---+---+                             +--+--+--+
 *  |   |XXX| v = 1.0 (edge facing west)  |  |xx|XX|
 *  |   |XXX| a = 0.5 (50% coverage)      |  |xx|XX|
 *  |   |XXX|                             |  |xx|XX|
 *  +---+---+                             +--+--+--+
 *    pixel                                0  50 100
 *
 *
 *        R   G   B
 *         
 *   1.0        +--+   <- top (abs( v ))
 *              |  
 *       -+-----+--+-- <- ceil: 100% coverage
 *        |     |XX|     
 *   0.0  |  +--+XX|     
 *        |  |xx|XX|     
 *       -+--+--+--+-- <- floor: 0% coverage
 *           |
 *  -1.0  +--+         <-  -abs(v)
 *        |
 *        |
 *        |         
 *  -2.0  +            <- bottom: -abs(v)-1.0
 */

vec3 subpixel( float v, float a ) {
    float vt      = 0.6 * v; // 1.0 will make your eyes bleed
    vec3  rgb_max = vec3( -vt, 0.0, vt );
    float top     = abs( vt );
    float bottom  = -top - 1.0;
    float cfloor  = mix( top, bottom, a );
    vec3  res     = clamp( rgb_max - vec3( cfloor ), 0.0, 1.0 );
    return res;
}


void main() {
    vec2 pUv = gl_PointCoord;
    // pUv.y = 1. - pUv.y;
    pUv.x = (pUv.x - 0.5) / proportion + 0.5;
    if ( pUv.x > 1.0 || pUv.x < 0.0 )
      discard;

    vec2 uv = tc0.xz + vec2(tc0.y - tc0.x, tc0.w - tc0.z) * pUv ; // tc0;

    // Sampling the texture, L pattern
    float sdf       = texture2D( font_tex, uv ).r;
    float sdf_north = texture2D( font_tex, uv + vec2( 0.0, sdf_texel.y ) ).r;
    float sdf_east  = texture2D( font_tex, uv + vec2( sdf_texel.x, 0.0 ) ).r;

    // Estimating stroke direction by the distance field gradient vector
    vec2  sgrad     = vec2( sdf_east - sdf, sdf_north - sdf );
    float sgrad_len = max( length( sgrad ), 1.0 / 128.0 );
    vec2  grad      = sgrad / vec2( sgrad_len );
    float vgrad = abs( grad.y ); // 0.0 - vertical stroke, 1.0 - horizontal one
    
    float horz_scale  = 1.1; // Blurring vertical strokes along the X axis a bit
    float vert_scale  = 0.6; // While adding some contrast to the horizontal strokes
    float hdoffset    = mix( doffset * horz_scale, doffset * vert_scale, vgrad ); 
    float res_doffset = mix( doffset, hdoffset, hint_amount );
    
    float alpha       = smoothstep( 0.5 - res_doffset, 0.5 + res_doffset, sdf );

    // Additional contrast
    alpha             = pow( alpha, 1.0 + 0.2 * vgrad * hint_amount );

    // Unfortunately there is no support for ARB_blend_func_extended in WebGL.
    // Fortunately the background is filled with a solid color so we can do
    // the blending inside the shader.
    
    // Discarding pixels beyond a threshold to minimise possible artifacts.
    if ( alpha < 20.0 / 256.0 ) discard;
    
    vec3 channels = subpixel( grad.x * 0.5 * subpixel_amount, alpha );

    // For subpixel rendering we have to blend each color channel separately
    vec3 res = mix( bg_color, font_color, channels );
    
    gl_FragColor = vec4( res, 1.0 );
}





#endif
#endif

