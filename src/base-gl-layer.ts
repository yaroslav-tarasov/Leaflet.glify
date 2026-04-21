import { LeafletMouseEvent, Map } from "leaflet";

import { IColor } from "./color";
import { CanvasOverlay, ICanvasOverlayDrawEvent } from "./canvas-overlay";
import { notProperlyDefined } from "./errors";
import { MapMatrix } from "./map-matrix";

export interface IShaderVariable {
  type: "FLOAT";
  start?: number;
  size: number;
  normalize?: boolean;
}

export type EventCallback = (
  e: LeafletMouseEvent,
  feature: any,
  id?: number
) => boolean | void;

export type SetupHoverCallback = (
  map: Map,
  hoverWait?: number,
  immediate?: false
) => void;

export interface IBaseGlLayerSettings {
  data: any;
  longitudeKey: number;
  latitudeKey: number;
  pane: string;
  map: Map;
  canvasTag?: string;
  shaderVariables?: {
    [name: string]: IShaderVariable;
  };
  setupClick?: (map: Map) => void;
  setupHover?: SetupHoverCallback;
  sensitivity?: number;
  sensitivityHover?: number;
  vertexShaderSource?: (() => string) | string;
  fragmentShaderSource?: (() => string) | string;
  canvas?: HTMLCanvasElement;
  click?: EventCallback;
  hover?: EventCallback;
  hoverOff?: EventCallback;
  color?: ColorCallback | IColor | null;
  className?: string;
  opacity?: number;
  preserveDrawingBuffer?: boolean;
  hoverWait?: number;
  fadeOnZoom?: FadeOnZoomCallback | number;
}

export const defaultPane = "overlayPane";
export const defaultHoverWait = 250;
export const defaults: Partial<IBaseGlLayerSettings> = {
  pane: defaultPane,
};

export type FadeOnZoomCallback = (feature: any) => number;

export type ColorCallback = (featureIndex: number, feature: any) => IColor;

export abstract class BaseGlLayer<
  T extends IBaseGlLayerSettings = IBaseGlLayerSettings
> {
  bytes = 0;
  active: boolean;
  fragmentShader: any;
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  layer: CanvasOverlay;
  mapMatrix: MapMatrix;
  matrix: WebGLUniformLocation | null;
  program: WebGLProgram | null;
  settings: Partial<IBaseGlLayerSettings>;
  vertexShader: WebGLShader | null;
  vertices: any;
  vertexLines: any;

  buffers: { [name: string]: WebGLBuffer } = {};
  attributeLocations: { [name: string]: number } = {};
  uniformLocations: { [name: string]: WebGLUniformLocation } = {};

  static defaults = defaults;
  static commonCanvas :  { [name: string]: HTMLCanvasElement } = {}; 
  static linkedLayers : { [name: string]: Array<BaseGlLayer> } = {}; 


  abstract render(): this;

  get data(): any {
    if (!this.settings.data) {
      throw new Error(notProperlyDefined("settings.data"));
    }
    return this.settings.data;
  }

  get pane(): string {
    return this.settings.pane ?? defaultPane;
  }

  get className(): string {
    return this.settings.className ?? "";
  }

  get map(): Map {
    if (!this.settings.map) {
      throw new Error(notProperlyDefined("settings.map"));
    }
    return this.settings.map;
  }

  get sensitivity(): number {
    if (typeof this.settings.sensitivity !== "number") {
      throw new Error(notProperlyDefined("settings.sensitivity"));
    }
    return this.settings.sensitivity;
  }

  get sensitivityHover(): number {
    if (typeof this.settings.sensitivityHover !== "number") {
      throw new Error(notProperlyDefined("settings.sensitivityHover"));
    }
    return this.settings.sensitivityHover;
  }

  get hoverWait(): number {
    return this.settings.hoverWait ?? defaultHoverWait;
  }

  get longitudeKey(): number {
    if (typeof this.settings.longitudeKey !== "number") {
      throw new Error(notProperlyDefined("settings.longitudeKey"));
    }
    return this.settings.longitudeKey;
  }

  get latitudeKey(): number {
    if (typeof this.settings.latitudeKey !== "number") {
      throw new Error(notProperlyDefined("settings.latitudeKey"));
    }
    return this.settings.latitudeKey;
  }

  get opacity(): number {
    if (typeof this.settings.opacity !== "number") {
      throw new Error(notProperlyDefined("settings.opacity"));
    }
    return this.settings.opacity;
  }

  get color(): ColorCallback | IColor | null {
    return this.settings.color ?? null;
  }

  get tag():  string | null {
    return this.settings.canvasTag ?? null;
  }

  public get countVisible(): number {
    if(this.settings && this.settings.canvasTag){
       let counter = 0;
       for( let c =0; c < BaseGlLayer.linkedLayers[this.settings.canvasTag].length; ++c){
           if (BaseGlLayer.linkedLayers[this.settings.canvasTag][c].layer.isVisible()) counter++;      
       }
       return counter; 
    }

    return 1;
  }


  constructor(settings: Partial<IBaseGlLayerSettings>) {
    this.settings = { ...defaults, ...settings };
    this.mapMatrix = new MapMatrix();
    this.active = true;
    this.vertexShader = null;
    this.fragmentShader = null;
    this.program = null;
    this.matrix = null;
    this.vertices = null;
    this.vertexLines = null;
    const preserveDrawingBuffer = Boolean(settings.preserveDrawingBuffer);

    if (this.tag) {
      let tag = this.tag;
      this.layer = new CanvasOverlay(
        { userDrawFunc: (context: ICanvasOverlayDrawEvent) => 
               {           return this.drawOnCanvas(context); },
          tag: tag 
        },
        this.pane );

      if (BaseGlLayer.commonCanvas[this.tag] === undefined) {
        BaseGlLayer.commonCanvas[this.tag] = this.layer.canvas = this.layer.canvas ?? document.createElement("canvas");  
      } else {  
        this.layer.canvas = BaseGlLayer.commonCanvas[this.tag];  
      }
      
      if (BaseGlLayer.linkedLayers[tag] === undefined)
         BaseGlLayer.linkedLayers[tag] = new Array();

      BaseGlLayer.linkedLayers[tag].push(this);

    } else {
      this.layer = new CanvasOverlay( { userDrawFunc:
        (context: ICanvasOverlayDrawEvent) => {
          return this.drawOnCanvas(context);
        } },
        this.pane );
    } 

    const layer = this.layer.addTo(this.map);

    if (!layer.canvas) {
      throw new Error(notProperlyDefined("layer.canvas"));
    }
    const canvas = (this.canvas = layer.canvas);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    canvas.style.position = "absolute";
    if (this.className) {
      canvas.className += " " + this.className;
    }
    this.gl = (canvas.getContext("webgl2", { preserveDrawingBuffer }) 
      ?? canvas.getContext("webgl", { preserveDrawingBuffer }) 
      ?? canvas.getContext("experimental-webgl", {preserveDrawingBuffer})
      ) as WebGLRenderingContext;
  }

  abstract drawOnCanvas(context: ICanvasOverlayDrawEvent): this;

  attachShaderVariables(byteCount: number): this {
    const variableCount = this.getShaderVariableCount();
    if (variableCount === 0) {
      return this;
    }
    const { gl, settings } = this;
    const { shaderVariables } = settings;
    let offset = 0;
    for (const name in shaderVariables) {
      if (!shaderVariables.hasOwnProperty(name)) continue;
      const shaderVariable = shaderVariables[name];
      const loc = this.getAttributeLocation(name);
      if (loc < 0) {
        throw new Error("shader variable " + name + " not found");
      }
      gl.vertexAttribPointer(
        loc,
        shaderVariable.size,
        gl[shaderVariable.type],
        !!shaderVariable.normalize,
        this.bytes * byteCount,
        offset * byteCount
      );
      offset += shaderVariable.size;
      gl.enableVertexAttribArray(loc);
    }

    return this;
  }

  getShaderVariableCount(): number {
    return Object.keys(this.settings.shaderVariables ?? {}).length;
  }

  setData(data: any): this {
    this.settings = { ...this.settings, data };
    return this.render();
  }

  setup(): this {
    const settings = this.settings;
    if (settings.click && settings.setupClick) {
      settings.setupClick(this.map);
    }
    if (settings.hover && settings.setupHover) {
      settings.setupHover(this.map, this.hoverWait);
    }

    return this.setupVertexShader().setupFragmentShader().setupProgram();
  }

  setupVertexShader(): this {
    const { gl, settings } = this;
    const vertexShaderSource =
      typeof settings.vertexShaderSource === "function"
        ? settings.vertexShaderSource()
        : settings.vertexShaderSource;
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) {
      throw new Error("Not able to create vertex");
    }
    if (!vertexShaderSource) {
      throw new Error(notProperlyDefined("settings.vertexShaderSource"));
    }
    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);

    this.vertexShader = vertexShader;

    return this;
  }

  setupFragmentShader(): this {
    const { gl, settings } = this;

    const fragmentShaderSource =
      typeof settings.fragmentShaderSource === "function"
        ? settings.fragmentShaderSource()
        : settings.fragmentShaderSource;

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      throw new Error("Not able to create fragment");
    }
    if (!fragmentShaderSource) {
      throw new Error(notProperlyDefined("settings.fragmentShaderSource"));
    }
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);

    this.fragmentShader = fragmentShader;

    return this;
  }

  setupProgram(): this {
    // link shaders to create our program
    const { gl, settings, vertexShader, fragmentShader } = this;
    const program = gl.createProgram();
    if (!program) {
      throw new Error("Not able to create program");
    }

    if (!vertexShader) {

      throw new Error(notProperlyDefined("this.vertexShader"));
    }

    if (!fragmentShader) {
      throw new Error(notProperlyDefined("this.fragmentShader"));
    }

    // Only fail on actual compile/link failures; info logs can contain warnings.
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(vertexShader) || "Unknown vertex shader compile error";
      const vertexShaderSource =
        typeof settings.vertexShaderSource === "function"
          ? settings.vertexShaderSource()
          : settings.vertexShaderSource;
      throw new Error(`${message}\n${vertexShaderSource ?? ""}`);
    }

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(fragmentShader) || "Unknown fragment shader compile error";
      const fragmentShaderSource =
        typeof settings.fragmentShaderSource === "function"
          ? settings.fragmentShaderSource()
          : settings.fragmentShaderSource;
      throw new Error(`${message}\n${fragmentShaderSource ?? ""}`);
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Unknown program link error";
      throw new Error(message);
    }

    gl.useProgram(program);
    
    this.setupBlend();

    this.program = program;

    return this;
  }

  setupBlend() : this {
    
    const { gl} = this;

    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA
    );
    gl.enable(gl.BLEND);

    return this;

  } 

  loadTexture( nameOrElement : string | HTMLImageElement, format = this.gl.RGBA, generate_mipmap = true, nearest = false, repeat = false ): WebGLTexture | null {
    const { gl } = this;
    var tex = gl.createTexture();
    
    if ( typeof nameOrElement === 'string') {
       var image = new Image();
       image.onload = function() { BaseGlLayer.setTexImage( gl, image, tex!, format, generate_mipmap, nearest, repeat ); };
       image.src = nameOrElement as string;
    } else {
      BaseGlLayer.setTexImage( gl, nameOrElement, tex!, format, generate_mipmap, nearest, repeat );
    }

    return tex;
  }


  addTo(map?: Map): this {
    this.layer.addTo(map ?? this.map);
    this.active = true;
    return this.render();
  }

  destroy(): this {
    if (this.active && this.map && this.map.hasLayer(this.layer)) {
      this.map.removeLayer(this.layer);
    }
    this.active = false;

    const { gl } = this;
    Object.keys(this.buffers).forEach((name) => {
      const buffer = this.buffers[name];
      if (buffer) {
        gl.deleteBuffer(buffer);
      }
      delete this.buffers[name];
    });

    const texture = (this as { glTexture?: WebGLTexture | null }).glTexture;
    if (texture) {
      gl.deleteTexture(texture);
      (this as { glTexture?: WebGLTexture | null }).glTexture = null;
    }

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
    if (this.vertexShader) {
      gl.deleteShader(this.vertexShader);
      this.vertexShader = null;
    }
    if (this.fragmentShader) {
      gl.deleteShader(this.fragmentShader);
      this.fragmentShader = null;
    }

    const tag = this.tag;
    if (tag) {
      const linkedLayers = BaseGlLayer.linkedLayers[tag];
      if (linkedLayers) {
        BaseGlLayer.linkedLayers[tag] = linkedLayers.filter(
          (layer) => layer !== this
        );
        if (BaseGlLayer.linkedLayers[tag].length === 0) {
          delete BaseGlLayer.linkedLayers[tag];
        }
      }

      if (!CanvasOverlay.linkedLayers[tag]) {
        delete BaseGlLayer.commonCanvas[tag];
      }
    }

    this.attributeLocations = {};
    this.uniformLocations = {};
    return this;
  }

  remove(indices?: number | number[]): this {
    if (indices === undefined) {
      this.map.removeLayer(this.layer);
      this.active = false;
    } else {
      const features = this.settings.data.features || this.settings.data;
      indices = indices instanceof Array ? indices : [indices];
      if (typeof indices === "number") {
        indices = [indices];
      }
      indices
        .sort((a: number, b: number): number => {
          return a - b;
        })
        .reverse()
        .forEach((index: number) => {
          features.splice(index, 1);
        });
      this.render();
    }
    return this;
  }

  insert(feature: any, index: number): this {
    const features = this.settings.data.features || this.settings.data;
    features.splice(index, 0, feature);
    return this.render();
  }

  update(feature: any, index: number): this {
    const features = this.settings.data.features || this.settings.data;
    features[index] = feature;
    return this.render();
  }

  getBuffer(name: string): WebGLBuffer {
    if (!this.buffers[name]) {
      const buffer = this.gl.createBuffer();
      if (!buffer) {
        throw new Error("Not able to create buffer");
      }
      this.buffers[name] = buffer;
    }
    return this.buffers[name];
  }

  getAttributeLocation(name: string): number {
    if (!this.program) {
      throw new Error(notProperlyDefined("this.program"));
    }
    if (this.attributeLocations[name] !== undefined) {
      return this.attributeLocations[name];
    }
    return (this.attributeLocations[name] = this.gl.getAttribLocation(
      this.program,
      name
    ));
  }

  getUniformLocation(name: string): WebGLUniformLocation {
    if (!this.program) {
      throw new Error(notProperlyDefined("this.program"));
    }
    if (this.uniformLocations[name] !== undefined) {
      return this.uniformLocations[name];
    }
    const loc = this.gl.getUniformLocation(this.program, name);
    if (!loc) {
      throw new Error("Cannot find '" + name + "' location");
    }
    return (this.uniformLocations[name] = loc);
  }

  click(e: LeafletMouseEvent, feature: any, id?: number): boolean | undefined {
    if (!this.settings.click) return;
    const result = this.settings.click(e, feature, id);
    if (result !== undefined) {
      return result;
    }
  }

  hover(e: LeafletMouseEvent, feature: any, id?: number): boolean | undefined {
    if (!this.settings.hover) return;
    const result = this.settings.hover(e, feature, id);
    if (result !== undefined) {
      return result;
    }
  }

  hoverOff(e: LeafletMouseEvent, feature: any): void {
    if (!this.settings.hoverOff) return;
    this.settings.hoverOff(e, feature);
  }


  static setTexImage(  gl: WebGLRenderingContext | WebGL2RenderingContext, image: HTMLImageElement, tex : WebGLTexture, format: number, generate_mipmap: boolean, nearest_filtering: boolean, repeat_uv: boolean ) {

    gl.bindTexture( gl.TEXTURE_2D, tex );
    gl.texImage2D( gl.TEXTURE_2D, 0, format, format, gl.UNSIGNED_BYTE, image );

    if ( !nearest_filtering ) {
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
    } else {
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
    }

    if ( repeat_uv ) {
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT );        
    } else {
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
    }

    if ( generate_mipmap ) {
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR );
        gl.generateMipmap( gl.TEXTURE_2D );
    } else {
        if ( !nearest_filtering ) {
            gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
        } else {
            gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
        }
    }
    gl.bindTexture( gl.TEXTURE_2D, null );
  }

}