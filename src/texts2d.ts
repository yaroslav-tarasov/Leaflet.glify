import {
  Feature,
  FeatureCollection,
  Point as GeoPoint,
  Position,
} from "geojson";

import { LeafletMouseEvent, Map, Point, LatLng, LatLngBounds } from "leaflet";
import { BaseGl2DLayer, IBaseGl2DLayerSettings } from "./base-gl-2d-layer";
import { ICanvasOverlayDrawEvent } from "./canvas-overlay";
import * as Color from "./color";
import { IPixel } from "./pixel";
import { locationDistance, normalize_x, normalize_y, pixelInCircle } from "./utils";

export interface IText2DSettings extends IBaseGl2DLayerSettings {
  data: number[][] | FeatureCollection<GeoPoint>;
  size?: ((i: number, latLng: LatLng | null) => number) | number | null;
  eachVertex?: (pointVertex: ITextVertex) => void;
  text?: TextCallback | string | null;
  textBox?: TextBoxCallback | null;
  sensitivity?: number;
  sensitivityHover?: number;
}

export type TextCallback = (featureIndex: number, feature: any) => string;
export type TextBoxCallback = (featureIndex: number, feature: any) => ITextBox;

const defaults: Partial<IText2DSettings> = {
  color: Color.random,
  opacity: 0.8,
  className: "",
  sensitivity: 2,
  sensitivityHover: 0.03,
};

export interface ITextBox {
  color : Color.IColor;
  stroke? : Array<number>;
}

export interface Dictionary<T> {
  [Key: string]: T;
}

export interface ITextVertex {
  latLng: LatLng;
  pixel: IPixel;
  chosenColor: Color.IColor;
  chosenSize: number;
  chosenColorHexStr: string;
  key: string;
  feature?: any;
  textBox?: ITextBox;
}


export class Text2D extends BaseGl2DLayer<IText2DSettings> {
  static defaults = defaults;
  static maps = [];
  bytes = 10;  // in points and here not using
  latLngLookup: {
    [key: string]: ITextVertex[];
  } = {};

  allLatLngLookup: ITextVertex[] = [];
  vertices: number[] = [];
  typedVertices: Float32Array = new Float32Array();
  dataFormat: "Array" | "GeoJson.FeatureCollection";
  settings: Partial<IText2DSettings>;
  active: boolean;
  glTexture?: WebGLTexture | null;

  get size(): ((i: number, latLng: LatLng | null) => number) | number | null {
    if (typeof this.settings.size === "number") {
      return this.settings.size;
    }
    if (typeof this.settings.size === "function") {
      return this.settings.size;
    }
    return null;
  }

  constructor(settings: Partial<IText2DSettings>) {
    super(settings);
    this.settings = { ...defaults, ...settings };

    this.active = true;

    const { data, map } = this;
    if (Array.isArray(data)) {
      this.dataFormat = "Array";
    } else if (data.type === "FeatureCollection") {
      this.dataFormat = "GeoJson.FeatureCollection";
    } else {
      throw new Error(
        "unhandled data type. Supported types are Array and GeoJson.FeatureCollection"
      );
    }

    if (map.options.crs?.code !== "EPSG:3857") {
      console.warn("layer designed for SphericalMercator, alternate detected");
    }

    this.setup().render();
  }


  render(): this {
    this.resetVertices();

    // look up the locations for the inputs to our shaders.
    const { canvas, layer, mapMatrix } = this;
    // set the matrix to some that makes 1 unit 1 pixel.
    mapMatrix.setSize(canvas.width, canvas.height);

    layer.redraw();

    return this;
  }

  getPointLookup(key: string): ITextVertex[] {
    return this.latLngLookup[key] || (this.latLngLookup[key] = []);
  }

  addLookup(lookup: ITextVertex): this {
    this.getPointLookup(lookup.key).push(lookup);
    this.allLatLngLookup.push(lookup);
    return this;
  }

  resetVertices(): this {
    // empty vertices and repopulate
    this.latLngLookup = {};
    this.allLatLngLookup = [];
    this.vertices = [];

    const {
      vertices,
      settings,
      map,
      size,
      latitudeKey,
      longitudeKey,
      color,
      opacity,
      data,
      
    } = this;

    const { eachVertex, text, textBox } = settings;
    let colorFn: ((i: number, latLng: LatLng | any) => Color.IColor) | null = null;
    let chosenColor: Color.IColor;
    let chosenSize: number;
    let chosenColorHexStr: string;
    let sizeFn;
    let textFn: TextCallback | null = null;
    let rawLatLng: [number, number] | Position;
    let latLng: LatLng;
    let pixel: Point;
    let key;

    let textBoxFn: TextBoxCallback | null = null;

    if (!color) {
      throw new Error("color is not properly defined");
    } else if (typeof color === "function") {
      colorFn = color as (i: number, latLng: LatLng) => Color.IColor;
    }

    if (!text) {
      // throw new Error("text is not properly defined");  // TODO FIXME 
    } else if (typeof text === "function") {
      textFn = text;
    }

    if (!textBox) {
      // throw new Error("textBox is not properly defined"); // TODO we need it?
    } else if (typeof textBox === "function") {
      textBoxFn = textBox;
    }

    if (!size) {
      throw new Error("size is not properly defined");
    } else if (typeof size === "function") {
      sizeFn = size;
    }

    if (this.dataFormat === "Array") {
      const max = data.length;
      for (let i = 0; i < max; i++) {
        rawLatLng = data[i];
        key =
          rawLatLng[latitudeKey].toFixed(2) +
          "x" +
          rawLatLng[longitudeKey].toFixed(2);
        latLng = new LatLng(rawLatLng[latitudeKey], rawLatLng[longitudeKey]);
        pixel = map.project(latLng, 0);

        if (colorFn) {
          chosenColor = colorFn(i, latLng);
        } else {
          chosenColor = color as Color.IColor;
        }

        chosenColor = { ...chosenColor, a: chosenColor.a ?? opacity ?? 0 };
        
        chosenColorHexStr = Color.toHex(chosenColor);

        if (sizeFn) {
          chosenSize = sizeFn(i, latLng);
        } else {
          chosenSize = size as number;
        }

        vertices.push(
          // vertex
          pixel.x,
          pixel.y,

          // color
          chosenColor.r,
          chosenColor.g,
          chosenColor.b,
          chosenColor.a ?? 0,

          // size
          chosenSize
        );
        const vertex = {
          latLng,
          key,
          pixel,
          chosenColor,
          chosenSize,
          chosenColorHexStr,
          feature: rawLatLng,
        };
        this.addLookup(vertex);
        if (eachVertex) {
          eachVertex(vertex);
        }
      }
    } else if (this.dataFormat === "GeoJson.FeatureCollection") {
      const max = data.features.length;
      for (let i = 0; i < max; i++) {
        const feature = data.features[i] as Feature<GeoPoint>;
        

        rawLatLng = feature.geometry.coordinates;
        key =
          rawLatLng[latitudeKey].toFixed(2) +
          "x" +
          rawLatLng[longitudeKey].toFixed(2);
        latLng = new LatLng(rawLatLng[latitudeKey], rawLatLng[longitudeKey]);
        const zoom = map.getZoom();

        pixel = map.project(latLng, 0);

        if (colorFn) {
          chosenColor = colorFn(i, feature);
        } else {
          chosenColor = color as Color.IColor;
        }

        chosenColor = { ...chosenColor, a: chosenColor.a ?? opacity ?? 0 };
        chosenColorHexStr = Color.toHex(chosenColor);

        if (sizeFn) {
          chosenSize = sizeFn(i, latLng);
        } else {
          chosenSize = size as number;
        }

      
        let str : string;  
        if (textFn !== null) {
          str = textFn(i, feature);
        } else {
          str = text as string;
        }

        
        let textBox;  
        if (textBoxFn !== null) {
          textBox = textBoxFn(i, feature);
        } 
        // else {
        //  textBox = textBox as ITextBox;
        // }

        const vertex: ITextVertex = {
          latLng,
          key,
          pixel,
          chosenColor,
          chosenSize,
          chosenColorHexStr,
          feature,
          textBox 
        };

        this.addLookup(vertex);
        if (eachVertex) {
          eachVertex(vertex);
        }
      }
    }

    return this;
  }

  // TODO: remove?
  pointSize(pointIndex: number): number {
    const { map, size } = this;
    const pointSize =
      typeof size === "function" ? size(pointIndex, null) : size;
    // -- Scale to current zoom
    const zoom = map.getZoom();
    return pointSize === null ? Math.max(zoom - 4.0, 1.0) : pointSize;
  }

  drawOnCanvas(e: ICanvasOverlayDrawEvent): this {
    if (!this.gl) return this;

    const { gl, canvas, mapMatrix, map, allLatLngLookup, vertices } = this;
    const { offset, clear } = e;
    const zoom = map.getZoom();
    
    const ctx = gl;

    if(this.tag){
      if( clear ){
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (this.settings.fadeOnZoom && zoom < this.settings.fadeOnZoom || !this.layer.isVisible())
      return this;

    const scale = Math.pow(2, zoom);

    console.log('zoom:', zoom);

    // set base matrix to translate canvas pixel coordinates -> webgl coordinates

    // mapMatrix
    //   .setSize(canvas.width, canvas.height)
    //   .scaleTo(scale)
    //   .translateTo(-offset.x, -offset.y)
    //   ;
    
    let a0 = 2.0 / canvas.width * scale;
    let a5 = -2.0 / canvas.height * scale;  
    let a12 = a0 * (-offset.x) - 1.0; 
    let a13 = a5 * (-offset.y) + 1.0; 

    // ctx.save();

    const bnds: LatLngBounds = map.getBounds();

  
    for ( let i:number = 0; i < this.allLatLngLookup.length; ++i )
    {
      const vtx = this.allLatLngLookup[i];
      const icao_name = vtx.feature.properties.icao_name;
      if (!icao_name && zoom < 10)
         continue;

      if( !bnds.contains(vtx.latLng))
        continue;


      const dgy = vtx.feature.properties.dbl_idx * 32;  
      const tx = normalize_x(a0 * vtx.pixel.x + a12)* canvas.width;
      const ty = normalize_y(a5 * vtx.pixel.y + a13)* canvas.height + 16 + (isNaN(dgy)?0:dgy);
      
      ctx.fillStyle = vtx.chosenColorHexStr;


      let maxTextX = 0;
      let maxTextY = 0;

      if(!!icao_name) 
      { 
        ctx.font = vtx.chosenSize.toString() + "px serif";
        let metrics = ctx.measureText(icao_name);
        ctx.fillText( icao_name, tx - metrics.width / 2 , ty ); 
        maxTextX = metrics.width;
        maxTextY +=  vtx.chosenSize; // metrics.actualBoundingBoxDescent + metrics.actualBoundingBoxAscent; 
      }

      if(!!vtx.feature.properties.display_name ) // && !vtx.textBox
      { 
        ctx.font = (vtx.chosenSize - 2).toString() + "px serif";
        let metrics = ctx.measureText(vtx.feature.properties.display_name);
        ctx.fillText( vtx.feature.properties.display_name, tx - metrics.width / 2, ty + (!icao_name?0:vtx.chosenSize) ); 
        maxTextX = Math.max( maxTextX, metrics.width );
        maxTextY += vtx.chosenSize; // metrics.actualBoundingBoxDescent + metrics.actualBoundingBoxAscent; // 
      }

      maxTextX = maxTextX * 0.5 + 2;
      maxTextY = maxTextY * 0.5 + 2;
      
      if(vtx.textBox) {

          let dy = ((!!vtx.feature.properties.display_name)? 0 : 4) ; 
          ctx.beginPath();
          ctx.moveTo(tx - maxTextX, ty - dy - maxTextY);
          ctx.lineTo(tx + maxTextX, ty - dy - maxTextY);
          ctx.lineTo(tx + maxTextX, ty - dy + maxTextY);
          ctx.lineTo(tx - maxTextX, ty - dy + maxTextY);
          ctx.lineTo(tx - maxTextX, ty - dy - maxTextY);   
          
          if(vtx.textBox.stroke) {
             ctx.setLineDash(vtx.textBox.stroke);
          }

          ctx.lineWidth = 2;

          ctx.strokeStyle = Color.toHex(vtx.textBox.color); 
          ctx.stroke();
      }
                    
    }

    // restore the canvas to its old settings.
    // ctx.restore();

    return this;
  }

  lookup(coords: LatLng): ITextVertex | null {
    const latMax: number = coords.lat + 0.03;
    const lngMax: number = coords.lng + 0.03;
    const matches: ITextVertex[] = [];
    let lat = coords.lat - 0.03;
    let lng: number;
    let foundI: number;
    let foundMax: number;
    let found: ITextVertex[];
    let key: string;

    for (; lat <= latMax; lat += 0.01) {
      lng = coords.lng - 0.03;
      for (; lng <= lngMax; lng += 0.01) {
        key = lat.toFixed(2) + "x" + lng.toFixed(2);
        found = this.latLngLookup[key];
        if (found) {
          foundI = 0;
          foundMax = found.length;
          for (; foundI < foundMax; foundI++) {
            matches.push(found[foundI]);
          }
        }
      }
    }

    const { map } = this;

    // try matches first, if it is empty, try the data, and hope it isn't too big
    return Text2D.closest(
      coords,
      matches.length > 0 ? matches : this.allLatLngLookup,
      map
    );
  }

  static closest(
    targetLocation: LatLng,
    points: ITextVertex[],
    map: Map
  ): ITextVertex | null {
    if (points.length < 1) return null;
    return points.reduce((prev, curr) => {
      const prevDistance = locationDistance(targetLocation, prev.latLng, map);
      const currDistance = locationDistance(targetLocation, curr.latLng, map);
      return prevDistance < currDistance ? prev : curr;
    });
  }

  // attempts to click the top-most Points instance
  static tryClick(
    e: LeafletMouseEvent,
    map: Map,
    instances: Text2D[],
    id: number
  ): boolean | undefined {
    const closestFromEach: ITextVertex[] = [];
    const instancesLookup: { [key: string]: Text2D } = {};
    let result;
    let settings: Partial<IText2DSettings> | null = null;
    let pointLookup: ITextVertex | null;

    instances.forEach((_instance: Text2D) => {
      settings = _instance.settings;
      if (!_instance.active) return;
      if (_instance.map !== map) return;

      pointLookup = _instance.lookup(e.latlng);
      if (pointLookup === null) return;
      instancesLookup[pointLookup.key] = _instance;
      closestFromEach.push(pointLookup);
    });

    if (closestFromEach.length < 1) return;
    if (!settings) return;

    const found = this.closest(e.latlng, closestFromEach, map);

    if (!found) return;

    const instance = instancesLookup[found.key];
    if (!instance) return;
    const { sensitivity } = instance;
    const foundLatLng = found.latLng;
    const xy = map.latLngToLayerPoint(foundLatLng);

    if (
      pixelInCircle(xy, e.layerPoint, found.chosenSize * (sensitivity ?? 1))
    ) {
      result = instance.click(e, found.feature || found.latLng);
      return result !== undefined ? result : true;
    }
  }

  // hovers all touching Points instances
  static tryHover(
    e: LeafletMouseEvent,
    map: Map,
    instances: Text2D[]
  ): Array<boolean | undefined> {
    const results: boolean[] = [];
    instances.forEach((_instance: Text2D): void => {
      if (!_instance.active) return;
      if (_instance.map !== map) return;
      const pointLookup = _instance.lookup(e.latlng);
      if (!pointLookup) return;
      if (
        pixelInCircle(
          map.latLngToLayerPoint(pointLookup.latLng),
          e.layerPoint,
          pointLookup.chosenSize * _instance.sensitivityHover * 30
        )
      ) {
        const result = _instance.hover(
          e,
          pointLookup.feature || pointLookup.latLng
        );
        if (result !== undefined) {
          results.push(result);
        }
      }
    });
    return results;
  }
}
