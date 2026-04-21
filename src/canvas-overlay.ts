/*
originally taken from: http://www.sumbera.com/gist/js/leaflet/canvas/L.CanvasOverlay.js, added and customized as part of this lib because of need from library
 Generic  Canvas Overlay for leaflet,
 Stanislav Sumbera, April , 2014

 - added userDrawFunc that is called when Canvas need to be redrawn
 - added few useful params fro userDrawFunc callback
 - fixed resize map bug
 inspired & portions taken from  :   https://github.com/Leaflet/Leaflet.heat
 */

import {
  LatLngBounds,
  Point,
  Layer,
  Util,
  Browser,
  Bounds,
  DomUtil,
  LatLng,
  ZoomAnimEvent,
  Map,
  ResizeEvent,
  LayerOptions,
} from "leaflet";

export interface ICanvasOverlayDrawEvent {
  canvas: HTMLCanvasElement;
  bounds: LatLngBounds;
  offset: Point;
  scale: number;
  size: Point;
  zoomScale: number;
  zoom: number;
  clear?: boolean;
}

export interface ICanvasOverlay {
  userDrawFunc: IUserDrawFunc;
  moveStarted?: () => void;
  moveEnded?: () => void;
  tag? : string;
}

export type IUserDrawFunc = (event: ICanvasOverlayDrawEvent) => void;

export type RedrawCallback = (instance: CanvasOverlay) => void;

type ILinkedLayers = Array<CanvasOverlay>;

class LinkedLayersController {
  layers : ILinkedLayers;

  protected _canvas?: HTMLCanvasElement;
  protected _map?: Map;
  protected _frame?: number | null;

  set frame (val : number | null) {
    this._frame = val;
  }

  get frame() : number | null {
     return this._frame ?? null;
  }

  public set canvas(val: HTMLCanvasElement | undefined) {
     this._canvas = val;
  } 

  public get canvas(): HTMLCanvasElement | undefined {
     return this._canvas;
  }

  set map(val: Map) {
    this._map = val;
  } 

  constructor( layers: ILinkedLayers) {
       this.layers = layers;
  }
  
  redraw() {
    if (this._frame === null) {
      this._frame = Util.requestAnimFrame(this._redraw, this);
    }
    return this;
  }

  _reset(): void {
    if (this._canvas && this._map) {
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      DomUtil.setPosition(this._canvas, topLeft);
    }
    this._redraw();
  }

  _redraw(): void {
    const { _map, _canvas } = this;
    
    if ( _map && _canvas )
    {   

       const size = _map.getSize();
       const bounds = _map.getBounds();
       const zoomScale =
         (size.x * 180) / (20037508.34 * (bounds.getEast() - bounds.getWest())); // resolution = 1/zoomScale
       const zoom = _map.getZoom();
       const topLeft = new LatLng(bounds.getNorth(), bounds.getWest());
       const offset = unclampedProject(_map, topLeft, 0);
       
       for (let i=0; i< this.layers.length; ++i)
       {
         this.layers[i]._userDrawFunc({
                bounds,
                canvas: _canvas,
                offset,
                scale: Math.pow(2, zoom),
                size,
                zoomScale,
                zoom,
                clear : i==0
           });
       }

    }

    this._frame = null;
  }

  _resize(resizeEvent: ResizeEvent): void {
    if (this._canvas) {
      this._canvas.width = resizeEvent.newSize.x;
      this._canvas.height = resizeEvent.newSize.y;
    }
  }
   
  _animateZoom(e: ZoomAnimEvent): void {
    const { _map, _canvas } = this;
    if ( _map && _canvas )
    {   
       const scale = _map.getZoomScale(e.zoom, _map.getZoom());
       const offset = unclampedLatLngBoundsToNewLayerBounds( _map,
         _map.getBounds(),
         e.zoom,
         e.center
       ).min;

       if (_canvas && offset) {
         DomUtil.setTransform(_canvas, offset, scale);
       }
    }
  }

  _animateZoomNoLayer(e: ZoomAnimEvent): void {
    const { _map, _canvas } = this;
    if ( _map && _canvas) {
      const scale = _map.getZoomScale(e.zoom, _map.getZoom());
      const offset = _map
        // @ts-expect-error experimental
        ._getCenterOffset(e.center)
        ._multiplyBy(-scale)
        // @ts-expect-error  experimental
        .subtract(_map._getMapPanePos());
      DomUtil.setTransform(_canvas, offset, scale);
    }
  }

}

export class CanvasOverlay extends Layer {  
  _eventsCallback : ICanvasOverlay;
  _userDrawFunc: IUserDrawFunc;
  _redrawCallbacks: RedrawCallback[];
  private _canvas?: HTMLCanvasElement;
  _pane: string;

  //_frame?: number | null;
  options?: LayerOptions;
  visible: boolean;
  tag? : string;

  get canvas (): HTMLCanvasElement | undefined {
      return this.controller().canvas;
  } 
  
  set canvas(val: HTMLCanvasElement | undefined) {
    this.controller().canvas = val;
  }  

  static linkedLayers : { [name: string]: ILinkedLayers } = {};
  static linkedLayersController : { [name: string]: LinkedLayersController } = {}; 

  controller(name: string | undefined = undefined) : LinkedLayersController {
    return name?CanvasOverlay.linkedLayersController[name]:CanvasOverlay.linkedLayersController[this.tag??""];
  } 


  constructor(eventsCallback: ICanvasOverlay, pane: string) {
    super();
    this._eventsCallback = eventsCallback;
    this._userDrawFunc = eventsCallback.userDrawFunc;
    //this._frame = null;
    this._redrawCallbacks = [];
    this._pane = pane;
    this.visible = true;
    this.tag = eventsCallback.tag?? Math.random().toString(36).substring(2,7);

    if(this.tag){
      if ( CanvasOverlay.linkedLayers[this.tag] === undefined)
          CanvasOverlay.linkedLayers[this.tag] = new Array();
      CanvasOverlay.linkedLayers[this.tag].push(this);

      if ( CanvasOverlay.linkedLayersController[this.tag] === undefined)
         CanvasOverlay.linkedLayersController[this.tag] = new LinkedLayersController(CanvasOverlay.linkedLayers[this.tag]);
    } 
  }

  drawing(userDrawFunc: IUserDrawFunc): this {
    this._userDrawFunc = userDrawFunc;
    return this;
  }

  params(options: any): this {
    Util.setOptions(this, options);
    return this;
  }

  redraw(callback?: RedrawCallback) {
    if (typeof callback === "function") {
      this._redrawCallbacks.push(callback);
    }

    if(this.tag){
      CanvasOverlay.linkedLayersController[this.tag].redraw();
    } 
    // else {
    //   if (this._frame === null) {
    //     this._frame = Util.requestAnimFrame(this._redraw, this);
    //   }
    // }
    return this;
  }

  isAnimated(): boolean {
    return Boolean(this._map.options.zoomAnimation && Browser.any3d);
  }

  onAdd(map: Map): this {
    this._map = map;
    const canvas = (this.canvas =
      this.canvas ?? document.createElement("canvas"));

    const size = map.getSize();
    const animated = this.isAnimated();
    canvas.width = size.x;
    canvas.height = size.y;
    canvas.className = `leaflet-zoom-${animated ? "animated" : "hide"}`;

    const pane = map.getPane(this._pane);
    if (!pane) {
      throw new Error("unable to find pane");
    }
    pane.appendChild(this.canvas);

    if(this.tag) {
      let controller = CanvasOverlay.linkedLayersController[this.tag];
      // controller.canvas = this.canvas;
      controller.map = this._map;

      map.on("moveend", controller._reset, controller);
      map.on("resize", controller._resize, controller);

      if (animated) {
        map.on(
          "zoomanim",
          Layer ? controller._animateZoom : this._animateZoomNoLayer,
          controller
        );
      }

    } 
    // else {
    //   map.on("moveend", this._reset, this);
    //   map.on("resize", this._resize, this);
    //   map.on("movestart", this._moveStarted, this);
    
    //   if (animated) {
    //     map.on(
    //       "zoomanim",
    //       Layer ? this._animateZoom : this._animateZoomNoLayer,
    //       this
    //     );
    //   }
    // }

    if(this.tag)
      CanvasOverlay.linkedLayersController[this.tag]._reset();
    // else  
    //   this._reset();

    return this;
  }

  onRemove(map: Map): this {
    const tag = this.tag;
    const linkedCount = tag
      ? CanvasOverlay.linkedLayers[tag]?.length ?? 0
      : 0;
    const shouldDetachCanvas = !tag || linkedCount <= 1;

    if (this.canvas && shouldDetachCanvas) {
      const pane = map.getPane(this._pane);
      if (!pane) {
        throw new Error("unable to find pane");
      }
      pane.removeChild(this.canvas);
    }

    if(this.tag) {
      let controller = CanvasOverlay.linkedLayersController[this.tag];

      map.off("moveend", controller._reset, controller);
      map.off("resize", controller._resize, controller);

      if (this.isAnimated()) {
        map.off(
          "zoomanim",
          Layer ? controller._animateZoom : this._animateZoomNoLayer,
          controller
        );
      }

      const linkedLayers = CanvasOverlay.linkedLayers[this.tag];
      if (linkedLayers) {
        CanvasOverlay.linkedLayers[this.tag] = linkedLayers.filter(
          (layer) => layer !== this
        );
        if (CanvasOverlay.linkedLayers[this.tag].length === 0) {
          delete CanvasOverlay.linkedLayers[this.tag];
          delete CanvasOverlay.linkedLayersController[this.tag];
        }
      }
    }

    // map.off("moveend", this._reset, this);
    // map.off("resize", this._resize, this);
    // map.off("movestart", this._moveStarted, this);

    // if (this.isAnimated()) {
    //   map.off(
    //     "zoomanim",
    //     Layer ? this._animateZoom : this._animateZoomNoLayer,
    //     this
    //   );
    // }

    return this;
  }
  
  setVisible( val: boolean){
    this.visible = val;
    this.redraw();
  }

  isVisible():boolean{
    return this.visible;
  }
 
  addTo(map: Map): this {
    map.addLayer(this);
    return this;
  }

  get map(): Map {
    return this._map;
  }

  set map(map: Map) {
    this.controller().map = map;
    this._map = map;
  }

  _resize(resizeEvent: ResizeEvent): void {
    if(this.tag)
      CanvasOverlay.linkedLayersController[this.tag]._resize(resizeEvent);
  }
  
  _reset(): void {
    if(this.tag)
      CanvasOverlay.linkedLayersController[this.tag]._reset();
  }

  _redraw(): void {
    if(this.tag)
      CanvasOverlay.linkedLayersController[this.tag]._redraw();
  }

  _animateZoom(e: ZoomAnimEvent): void {
    if(this.tag)
      CanvasOverlay.linkedLayersController[this.tag]._animateZoom(e);
  }

  _animateZoomNoLayer(e: ZoomAnimEvent): void {
    if(this.tag)
    CanvasOverlay.linkedLayersController[this.tag]._animateZoomNoLayer(e);
  }

  // _resize(resizeEvent: ResizeEvent): void {
  //   if (this.canvas) {
  //     this.canvas.width = resizeEvent.newSize.x;
  //     this.canvas.height = resizeEvent.newSize.y;
  //   }
  // }

  // _moveStarted(): void {
  //   if (this.canvas && this._eventsCallback.moveStarted) {
  //     this._eventsCallback.moveStarted();
  //   }
  // }

  // _reset(): void {
  //   if (this.canvas) {
  //     const topLeft = this._map.containerPointToLayerPoint([0, 0]);
  //     DomUtil.setPosition(this.canvas, topLeft);
  //   }
  //   this._redraw();
  // }

  // _redraw(): void {
  //   const { _map, canvas } = this;
  //   const size = _map.getSize();
  //   const bounds = _map.getBounds();
  //   const zoomScale =
  //     (size.x * 180) / (20037508.34 * (bounds.getEast() - bounds.getWest())); // resolution = 1/zoomScale
  //   const zoom = _map.getZoom();
  //   const topLeft = new LatLng(bounds.getNorth(), bounds.getWest());
  //   const offset = unclampedProject(this._map, topLeft, 0);
  //   if (canvas) {
  //     this._userDrawFunc({
  //       bounds,
  //       canvas,
  //       offset,
  //       scale: Math.pow(2, zoom),
  //       size,
  //       zoomScale,
  //       zoom,
  //     });
  //   }

  //   while (this._redrawCallbacks.length > 0) {
  //     const callback = this._redrawCallbacks.shift();
  //     if (callback) {
  //       callback(this);
  //     }
  //   }

  //   this._frame = null;
  // }

  // _animateZoom(e: ZoomAnimEvent): void {
  //   const { _map, canvas } = this;
  //   const scale = _map.getZoomScale(e.zoom, _map.getZoom());
  //   const offset = unclampedLatLngBoundsToNewLayerBounds( _map, 
  //     _map.getBounds(),
  //     e.zoom,
  //     e.center
  //   ).min;
  //   if (canvas && offset) {
  //     DomUtil.setTransform(canvas, offset, scale);
  //   }
  // }

  // _animateZoomNoLayer(e: ZoomAnimEvent): void {
  //   const { _map, canvas } = this;
  //   if (canvas) {
  //     const scale = _map.getZoomScale(e.zoom, _map.getZoom());
  //     const offset = _map
  //       // @ts-expect-error experimental
  //       ._getCenterOffset(e.center)
  //       ._multiplyBy(-scale)
  //       // @ts-expect-error  experimental
  //       .subtract(_map._getMapPanePos());
  //     DomUtil.setTransform(canvas, offset, scale);
  //   }
  // }
}


export function unclampedProject( map: Map, latlng: LatLng, zoom: number): Point {
  // imported partly from https://github.com/Leaflet/Leaflet/blob/1ae785b73092fdb4b97e30f8789345e9f7c7c912/src/geo/projection/Projection.SphericalMercator.js#L21
  // used because they clamp the latitude
  const { crs } = map.options;
  // @ts-expect-error experimental
  const { R } = crs.projection;
  const d = Math.PI / 180;
  const lat = latlng.lat;
  const sin = Math.sin(lat * d);
  const projectedPoint = new Point(
    R * latlng.lng * d,
    (R * Math.log((1 + sin) / (1 - sin))) / 2
  );
  const scale = crs?.scale(zoom) ?? 0;
  // @ts-expect-error experimental
  return crs.transformation._transform(projectedPoint, scale);
}  


export function unclampedLatLngBoundsToNewLayerBounds(
    map: Map,
    latLngBounds: LatLngBounds,
    zoom: number,
    center: LatLng
  ): Bounds {
    // imported party from https://github.com/Leaflet/Leaflet/blob/84bc05bbb6e4acc41e6f89ff7421dd7c6520d256/src/map/Map.js#L1500
    // used because it uses crs.projection.project, which clamp the latitude
    // @ts-expect-error experimental
    const topLeft = map._getNewPixelOrigin(center, zoom);
    return new Bounds([
      unclampedProject(map, latLngBounds.getSouthWest(), zoom).subtract(
        topLeft
      ),
      unclampedProject(map, latLngBounds.getNorthWest(), zoom).subtract(
        topLeft
      ),
      unclampedProject(map, latLngBounds.getSouthEast(), zoom).subtract(
        topLeft
      ),
      unclampedProject(map, latLngBounds.getNorthEast(), zoom).subtract(
        topLeft
      ),
    ]);
}