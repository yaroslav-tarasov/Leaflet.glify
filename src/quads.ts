import earcut from "earcut";
import { LatLng, LeafletMouseEvent, Map } from "leaflet";
import {
  Feature,
  FeatureCollection,
  Point as GeoPoint,
} from "geojson";

import {
  BaseGlLayer,
  ColorCallback,
  IBaseGlLayerSettings,
} from "./base-gl-layer";

import { ICanvasOverlayDrawEvent } from "./canvas-overlay";
import * as Color from "./color";
import { locationDistance, normalize_x, pixelInCircle } from "./utils";

import { notProperlyDefined } from "./errors";
import { IPointVertex } from "./points";

export type SizeCallback = (featureIndex: number, feature: any) => number;

export interface IQuadsSettings extends IBaseGlLayerSettings {
  border?: boolean;
  borderOpacity?: number;
  data: number[][] | FeatureCollection<GeoPoint>;
  size?: SizeCallback | number | null;
  // TODO from points  // sensitivity?: number;
  // TODO from points // sensitivityHover?: number;
}

interface IQuadVertex extends IPointVertex {
  radius: number;
}


function getPointAtDistance(latlon: number[], d: number, brng: number) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;

  let [f1, l1] = latlon;
  const R = 6378.137;
  f1 = f1 * toRad;
  l1 = l1 * toRad;
  brng = brng * toRad;

  const f2 = Math.asin(
    Math.sin(f1) * Math.cos(d / R) +
      Math.cos(f1) * Math.sin(d / R) * Math.cos(brng)
  );

  const l2 =
    l1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d / R) * Math.cos(f1),
      Math.cos(d / R) - Math.sin(f1) * Math.sin(f2)
    );

  return [f2 * toDeg, l2 * toDeg];
}

export const defaults: Partial<IQuadsSettings> = {
  color: Color.random,
  className: "",
  opacity: 0.5,
  borderOpacity: 1,
  // TODO from points // sensitivity: 2,
  // TODO from points // sensitivityHover: 0.03,
  shaderVariables: {
    vertex: {
      type: "FLOAT",
      start: 0,
      size: 2,
    },
    color: {
      type: "FLOAT",
      start: 2,
      size: 4,
    },
    tex_coord: {
      type: "FLOAT",
      start: 6,
      size: 2,
    },
  },
  border: false,
};

export class Quads extends BaseGlLayer {
  static defaults = defaults;
  static maps: Map[];
  settings: Partial<IQuadsSettings>;
  bytes = 8;

  latLngLookup: {
    [key: string]: IQuadVertex[];
  } = {};

  allLatLngLookup: IQuadVertex[] = [];

  get border(): boolean {
    if (typeof this.settings.border !== "boolean") {
      throw new Error(notProperlyDefined("settings.border"));
    }
    return this.settings.border;
  }

  get borderOpacity(): number {
    if (typeof this.settings.borderOpacity !== "number") {
      throw new Error(notProperlyDefined("settings.borderOpacity"));
    }
    return this.settings.borderOpacity;
  }

  constructor(settings: Partial<IQuadsSettings>) {
    super(settings);
    this.settings = { ...Quads.defaults, ...settings };

    if (!settings.data) {
      throw new Error(notProperlyDefined("settings.data"));
    }
    if (!settings.map) {
      throw new Error(notProperlyDefined("settings.map"));
    }

    this.setup().render();
  }

  render(): this {
    this.resetVertices();
    // triangles or point count

    const { canvas, gl, layer, vertices, mapMatrix } = this;
    const vertexBuffer = this.getBuffer("vertex");
    const vertexArray = new Float32Array(vertices);
    const byteCount = vertexArray.BYTES_PER_ELEMENT;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);

    // const vertexLocation = this.getAttributeLocation("vertex");

    // gl.vertexAttribPointer(
    //   vertexLocation,
    //   2,
    //   gl.FLOAT,
    //   false,
    //   byteCount * this.bytes,
    //   0
    // );

    // gl.enableVertexAttribArray(vertexLocation);

    // ----------------------------
    // look up the locations for the inputs to our shaders.
    this.matrix = this.getUniformLocation("matrix");

    // Set the matrix to some that makes 1 unit 1 pixel.
    gl.viewport(0, 0, canvas.width, canvas.height);
    mapMatrix.setSize(canvas.width, canvas.height);
    gl.uniformMatrix4fv(this.matrix, false, mapMatrix.array);

    this.attachShaderVariables(byteCount);

    layer.redraw();

    return this;
  }

  getPointLookup(key: string): IQuadVertex[] {
    return this.latLngLookup[key] || (this.latLngLookup[key] = []);
  }

  addLookup(lookup: IQuadVertex): this {
    this.getPointLookup(lookup.key).push(lookup);
    this.allLatLngLookup.push(lookup);
    return this;
  } 


  resetVertices(): this {
    this.vertices = [];
    this.vertexLines = [];

    this.latLngLookup = {};
    this.allLatLngLookup = [];

    const {
      vertices,
      vertexLines,
      map,
      border,
      opacity,
      borderOpacity, // TODO: Make lookup for each shape priority, then fallback
      color,
      data,
    } = this;

    const size = this.settings.size;
    let sizeFn: SizeCallback | null = null;

    let pixel;
    let index;
    let features;
    let feature;
    let colorFn: ColorCallback | null = null;
    let chosenColor: Color.IColor;
    let coordinates;
    let featureIndex = 0;
    let triangles;
    let indices;
    let flat;
    let dim;

    if (!size) {
      throw new Error("size is not properly defined");
    } else if (typeof size === "function") {
      sizeFn = size;
    }

    if (!(data.type === "FeatureCollection"))
      throw new Error("FeatureCollection only");

    features = data.features;

    const featureMax = features.length;

    if (!color) {
      throw new Error(notProperlyDefined("settings.color"));
    } else if (typeof color === "function") {
      colorFn = color;
    }

    const texCoords = [
      [1.0, 0.0],
      [1.0, 1.0],
      [0.0, 1.0],
      [0.0, 0.0],
    ];

    // -- data
    for (; featureIndex < featureMax; featureIndex++) {
      feature = features[featureIndex] as Feature<GeoPoint>;
      triangles = [];
      const triTextCoords = [];

      // use colorFn function here if it exists
      if (colorFn !== null) {
        chosenColor = colorFn(featureIndex, feature);
      } else {
        chosenColor = color as Color.IColor;
      }

      const alpha = typeof chosenColor.a === "number" ? chosenColor.a : opacity;

      const latlon = (feature.geometry || feature).coordinates;
      // TODO // Not needed for flat array
      // if (!Array.isArray(latlon[0])) {
      //   continue;
      // }

      let radius;

      if (sizeFn !== null) {
        radius = sizeFn(featureIndex, feature);
      } else {
        radius = size as number;
      }

      radius = radius * 1.414213562373095;
      coordinates = [
        [
          getPointAtDistance(latlon, radius, 45),
          getPointAtDistance(latlon, radius, 135),
          getPointAtDistance(latlon, radius, 225),
          getPointAtDistance(latlon, radius, 315),
        ],
      ];

      flat = earcut.flatten(coordinates);
      indices = [2, 3, 0, 0, 1, 2]; //  indices = earcut(flat.vertices, flat.holes, flat.dimensions);
      dim = coordinates[0][0].length;
      const { longitudeKey, latitudeKey } = this;
      for (let i = 0, iMax = indices.length; i < iMax; i++) {
        index = indices[i];
        if (typeof flat.vertices[0] === "number") {
          triangles.push(
            flat.vertices[index * dim + latitudeKey],
            flat.vertices[index * dim + longitudeKey]
          );

          triTextCoords.push(texCoords[index]);
        } else {
          throw new Error("unhandled polygon");
        }
      }

      for (let i = 0, iMax = triangles.length, cnt = 0; i < iMax; cnt++) {
        pixel = map.project(new LatLng(triangles[i++], triangles[i++]), 0);
        vertices.push(
          pixel.x,
          pixel.y,
          chosenColor.r,
          chosenColor.g,
          chosenColor.b,
          alpha,
          triTextCoords[cnt][0],
          triTextCoords[cnt][1]
        );
      }

      let key =
      latlon[latitudeKey].toFixed(2) +
      "x" +
      latlon[longitudeKey].toFixed(2);
      
      let llCenter = new LatLng(latlon[latitudeKey], latlon[longitudeKey]);
      let pCenter = map.project(llCenter, 0 );
      let pRight  = map.project(new LatLng(coordinates[0][0][0], coordinates[0][0][1]), 0);
      
      const vertex: IQuadVertex = {
        latLng: llCenter,
        key,
        pixel: map.project(llCenter, 0),
        chosenColor,
        chosenSize : radius,
        feature,
        radius: Math.abs(pCenter.x - pRight.x)
      };
      this.addLookup(vertex);


      if (border) {
        const lines = [];
        let i = 1;
        for (let iMax = flat.vertices.length - 2; i < iMax; i = i + 2) {
          lines.push(new LatLng(flat.vertices[i - 1], flat.vertices[i]));
          lines.push(new LatLng(flat.vertices[i + 1], flat.vertices[i + 2]));
        }

        let latlon1 = new LatLng(flat.vertices[i - 1], flat.vertices[i]);
        let latlon2 = new LatLng(flat.vertices[0], flat.vertices[1]);

        if ( ! latlon1.equals(latlon2)){ 
          lines.push(latlon1);
          lines.push(latlon2);
        }


        for (let i = 0, iMax = lines.length; i < iMax; i++) {
          pixel = map.project(lines[i], 0);
          vertexLines.push(
            pixel.x,
            pixel.y,
            chosenColor.r,
            chosenColor.g,
            chosenColor.b,
            borderOpacity
          );
        }
      }
    }

    return this;
  }

  drawOnCanvas(e: ICanvasOverlayDrawEvent): this {
    if (!this.gl) return this;

    const { scale, offset, canvas, clear } = e;
    const { mapMatrix, gl, vertices, settings, vertexLines, border } = this;

    if(this.tag){
      if( clear ){
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    } else {
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (
      this.settings.fadeOnZoom &&
      this.map.getZoom() < this.settings.fadeOnZoom || !this.layer.isVisible()
    )
      return this;

    // -- set base matrix to translate canvas pixel coordinates -> webgl coordinates
    mapMatrix
      .setSize(canvas.width, canvas.height)
      .scaleTo(scale)
      .translateTo(-offset.x, -offset.y);

    gl.viewport(0, 0, canvas.width, canvas.height);

    // -- attach matrix value to 'mapMatrix' uniform in shader
    gl.uniformMatrix4fv(this.matrix, false, mapMatrix.array);
    if (border) {
      const vertexLinesBuffer = this.getBuffer("vertexLines");
      const vertexLinesTypedArray = new Float32Array(vertexLines);
      const size = vertexLinesTypedArray.BYTES_PER_ELEMENT;
      const vertex = this.getAttributeLocation("vertex");
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexLinesBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertexLinesTypedArray, gl.STATIC_DRAW);

      if (this.settings.shaderVariables !== null) {
        this.attachShaderVariables(size);
      }

      gl.vertexAttribPointer(vertex, 3, gl.FLOAT, false, size * this.bytes, 0);
      gl.enableVertexAttribArray(vertex);
      gl.enable(gl.DEPTH_TEST);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.LINES, 0, vertexLines.length / this.bytes);

      const vertexBuffer = this.getBuffer("vertex");
      const verticesTypedArray = new Float32Array(vertices);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verticesTypedArray, gl.STATIC_DRAW);

      if (settings.shaderVariables !== null) {
        this.attachShaderVariables(size);
      }

      gl.vertexAttribPointer(vertex, 2, gl.FLOAT, false, size * this.bytes, 0);
      gl.enableVertexAttribArray(vertex);
      gl.enable(gl.DEPTH_TEST);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / this.bytes);

    return this;
  }

  lookup(coords: LatLng): IQuadVertex | null {
    const latMax: number = coords.lat + 0.03;
    const lngMax: number = coords.lng + 0.03;
    const matches: IQuadVertex[] = [];
    let lat = coords.lat - 0.03;
    let lng: number;
    let foundI: number;
    let foundMax: number;
    let found: IQuadVertex[];
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
    return Quads.closest(
      coords,
      matches.length > 0 ? matches : this.allLatLngLookup,
      map
    );
  } 

  static closest(
    targetLocation: LatLng,
    points: IQuadVertex[],
    map: Map
  ): IQuadVertex | null {
    if (points.length < 1) return null;
    return points.reduce((prev, curr) => {
      const prevDistance = locationDistance(targetLocation, prev.latLng, map);
      const currDistance = locationDistance(targetLocation, curr.latLng, map);
      return prevDistance < currDistance ? prev : curr;
    });
  }
  
  // attempts to click the top-most Shapes instance
  static tryClick(
    e: LeafletMouseEvent,
    map: Map,
    instances: Quads[],
    id : number
  ): boolean | undefined {
    const closestFromEach: IQuadVertex[] = [];
    const instancesLookup: { [key: string]: Quads } = {};
    let result;
    let pointLookup: IQuadVertex | null;

    instances.forEach(function (_instance: Quads): void {
       if (!_instance.active) return;
       if (_instance.map !== map) return;
       pointLookup = _instance.lookup(e.latlng);
       if (pointLookup === null) return;
       instancesLookup[pointLookup.key] = _instance;
       closestFromEach.push(pointLookup);

    });

    if (closestFromEach.length < 1) return;

    const found = this.closest(e.latlng, closestFromEach, map);

    if (!found) return;

    const instance = instancesLookup[found.key];
    if (!instance) return;
    // const { sensitivity } = instance;
    const foundLatLng = found.latLng;
    const xy = map.latLngToLayerPoint(foundLatLng);

    const scale = Math.pow(2, map.getZoom());
    const width = map.getPixelBounds().getSize().x;
    let a0 = 2.0 / width * scale;
    let radius =  a0 * found.radius * 0.5 * width;

    if (
      pixelInCircle(xy, e.layerPoint, radius * 1)// (sensitivity ?? 1))
    ) {
      result = instance.click(e, found.feature || found.latLng, id);
      return result !== undefined ? result : true;
    }
    return undefined;
    
  }

  // hovers all touching Shapes instances
  static tryHover(
    e: LeafletMouseEvent,
    map: Map,
    instances: Quads[]
  ): Array<boolean | undefined> {
    const results: boolean[] = [];
    let feature;

    // instances.forEach((_instance: Quads): void => {
    //   if (!_instance.active) return;
    //   if (_instance.map !== map) return;
    //   if (!_instance.polygonLookup) return;

    //   feature = _instance.polygonLookup.search(e.latlng.lng, e.latlng.lat);

    //   if (feature) {
    //     const result = _instance.hover(e, feature);
    //     if (result !== undefined) {
    //       results.push(result);
    //     }
    //   }
    // });

    return results;
  }
}
