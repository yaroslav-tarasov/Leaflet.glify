import { LeafletMouseEvent, Map } from "leaflet";

import { IColor } from "./color";
import { CanvasOverlay, ICanvasOverlayDrawEvent } from "./canvas-overlay";
import { notProperlyDefined } from "./errors";
import { MapMatrix } from "./map-matrix";


export type EventCallback = (
  e: LeafletMouseEvent,
  feature: any
) => boolean | void;

export type SetupHoverCallback = (
  map: Map,
  hoverWait?: number,
  immediate?: false
) => void;

export interface IBaseGl2DLayerSettings {
  data: any;
  longitudeKey: number;
  latitudeKey: number;
  pane: string;
  map: Map;
  canvasTag?: string;
  setupClick?: (map: Map) => void;
  setupHover?: SetupHoverCallback;
  sensitivity?: number;
  sensitivityHover?: number;
  canvas?: HTMLCanvasElement;
  click?: EventCallback;
  hover?: EventCallback;
  hoverOff?: EventCallback;
  color?: ColorCallback | IColor | null;
  className?: string;
  opacity?: number;
  preserveDrawingBuffer?: boolean;
  hoverWait?: number;
  fadeOnZoom?: number;
}

export const defaultPane = "overlayPane";
export const defaultHoverWait = 250;
export const defaults: Partial<IBaseGl2DLayerSettings> = {
  pane: defaultPane,
};

export type ColorCallback = (featureIndex: number, feature: any) => IColor;

export abstract class BaseGl2DLayer<
  T extends IBaseGl2DLayerSettings = IBaseGl2DLayerSettings
> {
  bytes = 0;
  active: boolean;
  canvas: HTMLCanvasElement;
  gl: CanvasRenderingContext2D ;
  layer: CanvasOverlay;
  mapMatrix: MapMatrix;
  settings: Partial<IBaseGl2DLayerSettings>;

  static defaults = defaults;
  static commonCanvas :  { [name: string]: HTMLCanvasElement } = {}; 

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


  constructor(settings: Partial<IBaseGl2DLayerSettings>) {
    this.settings = { ...defaults, ...settings };
    this.mapMatrix = new MapMatrix();
    this.active = true;
    const preserveDrawingBuffer = Boolean(settings.preserveDrawingBuffer);


    if (this.tag) {
      let tag = this.tag;
      this.layer = new CanvasOverlay(
        { userDrawFunc: (context: ICanvasOverlayDrawEvent) => 
               {           return this.drawOnCanvas(context); },
          tag: tag 
        },
        this.pane );

      if (BaseGl2DLayer.commonCanvas[this.tag] === undefined) {
        BaseGl2DLayer.commonCanvas[this.tag] = this.layer.canvas = this.layer.canvas ?? document.createElement("canvas");  
      } else {  
        this.layer.canvas = BaseGl2DLayer.commonCanvas[this.tag];  
      }
      

    } else {
        this.layer = new CanvasOverlay(
          { userDrawFunc:(context: ICanvasOverlayDrawEvent) => {
            return this.drawOnCanvas(context);
          }},
          this.pane)
        .addTo(this.map);
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
    this.gl = (canvas.getContext("2d", { preserveDrawingBuffer }) ) as CanvasRenderingContext2D;
  }

  abstract drawOnCanvas(context: ICanvasOverlayDrawEvent): this;


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

    return this;
  }


  addTo(map?: Map): this {
    this.layer.addTo(map ?? this.map);
    this.active = true;
    return this.render();
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


  click(e: LeafletMouseEvent, feature: any): boolean | undefined {
    if (!this.settings.click) return;
    const result = this.settings.click(e, feature);
    if (result !== undefined) {
      return result;
    }
  }

  hover(e: LeafletMouseEvent, feature: any): boolean | undefined {
    if (!this.settings.hover) return;
    const result = this.settings.hover(e, feature);
    if (result !== undefined) {
      return result;
    }
  }

  hoverOff(e: LeafletMouseEvent, feature: any): void {
    if (!this.settings.hoverOff) return;
    this.settings.hoverOff(e, feature);
  }



}