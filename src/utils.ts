import { LatLng, LatLngBounds, LeafletMouseEvent, Map } from "leaflet";
import { IPixel } from "./pixel";
import { IFont, IChar } from "./texts";

// -- converts latlon to pixels at zoom level 0 (for 256x256 tile size) , inverts y coord )
// -- source : http://build-failed.blogspot.cz/2013/02/displaying-webgl-data-on-google-maps.html
export function latLonToPixel(latitude: number, longitude: number): IPixel {
  const pi180 = Math.PI / 180.0;
  const pi4 = Math.PI * 4;
  const sinLatitude = Math.sin(latitude * pi180);
  const pixelY =
    (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / pi4) * 256;
  const pixelX = ((longitude + 180) / 360) * 256;

  return { x: pixelX, y: pixelY };
}

export function pixelInCircle(
  centerPixel: IPixel,
  checkPoint: IPixel,
  radius: number
): boolean {
  const distanceSquared =
    (centerPixel.x - checkPoint.x) * (centerPixel.x - checkPoint.x) +
    (centerPixel.y - checkPoint.y) * (centerPixel.y - checkPoint.y);
  return distanceSquared <= radius * radius;
}

export function latLngDistance(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) {
    // in case of 0 length line
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

export function vectorDistance(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

export function locationDistance(
  location1: LatLng,
  location2: LatLng,
  map: Map
): number {
  const point1 = map.latLngToLayerPoint(location1);
  const point2 = map.latLngToLayerPoint(location2);
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y;
  return vectorDistance(dx, dy);
}

export function debugPoint(containerPixel: IPixel): void {
  const el = document.createElement("div");
  const s = el.style;
  const x = containerPixel.x;
  const y = containerPixel.y;
  s.left = `${x}px`;
  s.top = `${y}px`;
  s.width = "10px";
  s.height = "10px";
  s.position = "absolute";
  s.backgroundColor = "#" + ((Math.random() * 0xffffff) << 0).toString(16);

  document.body.appendChild(el);
}

export function debounce(
  fn: (e: LeafletMouseEvent) => void,
  waitMilliseconds: number,
  immediate?: boolean
): (e: LeafletMouseEvent) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (e: LeafletMouseEvent): void {
    function later() {
      timeout = null;
      if (!immediate) fn(e);
    }
    const callNow = immediate && !timeout;
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, waitMilliseconds);
    if (callNow) fn(e);
  };
}

export function inBounds(latLng: LatLng, bounds: LatLngBounds): boolean {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return (
    ne.lat > latLng.lat &&
    latLng.lat > sw.lat &&
    ne.lng > latLng.lng &&
    latLng.lng > sw.lng
  );
}


export function fontMetrics( font: IFont, pixel_size: number, more_line_gap = 0.0 ) {
  // We use separate scale for the low case characters
  // so that x-height fits the pixel grid.
  // Other characters use cap-height to fit to the pixels
  var cap_scale   = pixel_size / font.cap_height;  
  var low_scale   = Math.round( font.x_height * cap_scale ) / font.x_height;
  
  // Ascent should be a whole number since it's used to calculate the baseline
  // position which should lie at the pixel boundary
  var ascent      = Math.round( font.ascent * cap_scale );
  
  // Same for the line height
  var line_height = Math.round( cap_scale * ( font.ascent + font.descent + font.line_gap ) + more_line_gap );
  
  return { 
           cap_scale   : cap_scale,
           low_scale   : low_scale,
           pixel_size  : pixel_size,
           ascent      : ascent,
           line_height : line_height
         };
}

export function charRect( pos : Array<number>, font: IFont, font_metrics: any, font_char : IChar, pointSize : number, kern = 0.0 ) : any {
  // Low case characters have first bit set in 'flags'
  var lowcase = ( font_char.flags & 1 ) == 1;

  // Pen position is at the top of the line, Y goes up
  var baseline = pos[1] ;// - font_metrics.ascent;

  // Low case chars use their own scale
  var scale = lowcase ? font_metrics.low_scale : font_metrics.cap_scale;

  // Laying out the glyph rectangle
  var g      = font_char.rect;
  var bottom = baseline - scale * ( font.descent + font.iy );
  var top    = bottom   + scale * ( font.row_height );
  var left   = pos[0]   + font.aspect * scale * ( font_char.bearing_x + kern - font.ix );
  var right  = left     + font.aspect * scale * ( g[2] - g[0] );
  var p = [ left, top, right, bottom ];

  var center = [ left + (right - left) / 2 , top + (bottom - top) /2 ];
  // Advancing pen position
  var new_pos_x = pos[0] + font.aspect * scale * ( font_char.advance_x + kern );

  // Signed distance field size in screen pixels
  //var sdf_size  = 2.0 * font.iy * scale;

  var vertex = [
      center[0], center[1],
      g[0], g[2], g[1], g[3],
      scale, Math.abs((right - left) / (bottom - top),), pointSize, 
      0.0 // xOffset  
  ];

  return { vertex : vertex, pos : [ new_pos_x, pos[1] ] };
}

export function writeString( string : string, font : IFont, font_metrics: any, pos: Array<number>, pointSize : number, str_pos = 0, array_pos = 0 ): any {
  var prev_char = " ";  // Used to calculate kerning
  var cpos      = pos;  // Current pen position
  var x_max     = 0.0;  // Max width - used for bounding box
  var scale     = font_metrics.cap_scale;
  
  let vertex_array: number[] = []
 
  for(;str_pos < string.length;) { 
      // var glyph_float_count = 6 * 5; // two rectangles, 5 floats per vertex ???? 
      // if ( ( array_pos + glyph_float_count >= vertex_array.length )) break;

      let schar = string[ str_pos ];
      str_pos++;
      
      if ( schar == "\n" ) {
          if ( cpos[0] > x_max ) x_max = cpos[0]; // Expanding the bounding rect
          cpos[0]  = pos[0];                      
          cpos[1] -= font_metrics.line_height;
          prev_char = " ";
          continue;
      }

      if ( schar == " " ) {
          cpos[0] += font.space_advance * scale; 
          prev_char = " ";
          continue;
      }

      let font_char = font.chars[ schar ];
      if ( !font_char ) {                         // Substituting unavailable characters with '?'
          schar = "?";
          font_char = font.chars[ "?" ];
      }

      let kern = font.kern[ prev_char + schar ];
      if ( !kern ) kern = 0.0;
      
      // calculating the glyph rectangle and copying it to the vertex array
      
      let rect = charRect( cpos, font, font_metrics, font_char, pointSize, kern );

      for (let i=0; i < rect.vertex.length; i++ )
      {
         vertex_array.push(rect.vertex[i]);
      }
      
      array_pos+=rect.vertex.length;


      prev_char = schar;
      cpos = rect.pos;
  }

  let baseX: number = vertex_array[0];
  let baseY: number = vertex_array[1];

  for (let i=0; i < vertex_array.length; i+=10 )
  {
     vertex_array[i] -= baseX;
     vertex_array[i+1] -= baseY;
  }

  var res = {
      rect : [ pos[0], pos[1], x_max - pos[0], pos[1] - cpos[1] + font_metrics.line_height ],
      vertex_array : vertex_array,
      string_pos : str_pos,
      array_pos : array_pos,
  }

  return res;
}

export function normalize_x(x : number){
  return (x + 1) / 2;
}

export function normalize_y(y : number){
  return 1 - (y + 1) / 2;
}