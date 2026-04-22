import { LeafletMouseEvent, Map } from "leaflet";

import { Lines, ILinesSettings } from "./lines";
import { Points, IPointsSettings } from "./points";
import { Shapes, IShapesSettings } from "./shapes";
import { Quads, IQuadsSettings } from "./quads";
import { debounce } from "./utils";

import vertex from "./shader/vertex/default.glsl";
import dot from "./shader/fragment/dot.glsl";
import point from "./shader/fragment/point.glsl";
import pointAtlas from "./shader/fragment/point-atlas.glsl";
import puck from "./shader/fragment/puck.glsl";
import simpleCircle from "./shader/fragment/simple-circle.glsl";
import square from "./shader/fragment/square.glsl";
import polygon from "./shader/fragment/polygon.glsl";

import vertex_quad from "./shader/vertex/quad.glsl";
import quad from "./shader/fragment/quad.glsl";

import vertex_text from "./shader/vertex/text.glsl";
import text from "./shader/fragment/text.glsl";

import { fromHex } from "./color";

import { roboto_font } from "./fonts/roboto";
import { ITextsSettings, Texts } from "./texts";
import { IText2DSettings, Text2D } from "./texts2d";

const shader = {
  vertex,
  vertex_quad,
  vertex_text,
  fragment: {
    dot,
    point,
    pointAtlas,
    puck,
    simpleCircle,
    square,
    polygon,
    quad,
    text
  },
};

const fonts = {
  roboto_font
};

export class Glify {
  longitudeKey = 1;
  latitudeKey = 0;
  clickSetupMaps: Map[] = [];
  hoverSetupMaps: Map[] = [];
  shader = shader;

  Points: typeof Points = Points;
  Shapes: typeof Shapes = Shapes;
  Lines: typeof Lines = Lines;
  Quads: typeof Quads = Quads;
  Texts: typeof Texts = Texts;
  Text2D: typeof Text2D = Text2D;

  pointsInstances: Points[] = [];
  shapesInstances: Shapes[] = [];
  linesInstances: Lines[] = [];
  quadsInstances: Quads[] = [];
  textsInstances: Texts[] = [];
  text2dInstances: Text2D[] = [];

  private get allLayerInstances(): Array<
    Points | Lines | Shapes | Quads | Texts | Text2D
  > {
    return [
      ...this.pointsInstances,
      ...this.linesInstances,
      ...this.shapesInstances,
      ...this.quadsInstances,
      ...this.textsInstances,
      ...this.text2dInstances,
    ];
  }

  longitudeFirst(): this {
    this.longitudeKey = 0;
    this.latitudeKey = 1;
    return this;
  }

  latitudeFirst(): this {
    this.latitudeKey = 0;
    this.longitudeKey = 1;
    return this;
  }

  get instances(): Array<Points | Lines | Shapes | Quads> {
    return [
      ...this.pointsInstances,
      ...this.linesInstances,
      ...this.shapesInstances,
      ...this.quadsInstances,
    ];
  }

  points(settings: Partial<IPointsSettings>): Points {
    const points = new this.Points({
      setupClick: this.setupClick.bind(this),
      setupHover: this.setupHover.bind(this),
      latitudeKey: this.latitudeKey,
      longitudeKey: this.longitudeKey,
      vertexShaderSource: () => {
        return this.shader.vertex;
      },
      fragmentShaderSource: () => {
        return settings.textureAtlas
          ? this.shader.fragment.pointAtlas
          : this.shader.fragment.point;
      },
      ...settings,
    });
    this.pointsInstances.push(points);
    return points;
  }

  lines(settings: Partial<ILinesSettings>): Lines {
    const lines = new this.Lines({
      setupClick: this.setupClick.bind(this),
      setupHover: this.setupHover.bind(this),
      latitudeKey: this.latitudeKey,
      longitudeKey: this.longitudeKey,
      vertexShaderSource: () => {
        return this.shader.vertex;
      },
      fragmentShaderSource: () => {
        return this.shader.fragment.polygon;
      },
      ...settings,
    });
    this.linesInstances.push(lines);
    return lines;
  }

  shapes(settings: Partial<IShapesSettings>): Shapes {
    const shapes = new this.Shapes({
      setupClick: this.setupClick.bind(this),
      setupHover: this.setupHover.bind(this),
      latitudeKey: this.latitudeKey,
      longitudeKey: this.longitudeKey,
      vertexShaderSource: () => {
        return this.shader.vertex;
      },
      fragmentShaderSource: () => {
        return this.shader.fragment.polygon;
      },
      ...settings,
    });
    this.shapesInstances.push(shapes);
    return shapes;
  }

  quads(settings: Partial<IQuadsSettings>): Quads {
    const quads = new this.Quads({
      setupClick: this.setupClick.bind(this),
      setupHover: this.setupHover.bind(this),
      latitudeKey: this.latitudeKey,
      longitudeKey: this.longitudeKey,
      vertexShaderSource: () => {
        return this.shader.vertex_quad;
      },
      fragmentShaderSource: () => {
        return this.shader.fragment.quad;
      },
      ...settings,
    });
    this.quadsInstances.push(quads);
    return quads;
  }

  text (settings: Partial<ITextsSettings>): Texts {
    const texts = new this.Texts({
      setupClick: this.setupClick.bind(this),
      setupHover: this.setupHover.bind(this),
      latitudeKey: this.latitudeKey,
      longitudeKey: this.longitudeKey,
      vertexShaderSource: () => {
        return this.shader.vertex_text;
      },
      fragmentShaderSource: () => {
        return this.shader.fragment.text;
      },
      ...settings,
    });
    this.textsInstances.push(texts);
    return texts;
  }

  text2d (settings: Partial<IText2DSettings>): Text2D {
    const texts = new this.Text2D({
      setupClick: this.setupClick.bind(this),
      setupHover: this.setupHover.bind(this),
      latitudeKey: this.latitudeKey,
      longitudeKey: this.longitudeKey,
      ...settings,
    });
    this.text2dInstances.push(texts);
    return texts;
  }
  
  
  setupClick(map: Map): void {
    if (this.clickSetupMaps.includes(map)) return;
    this.clickSetupMaps.push(map);
    map.on("click", (e: LeafletMouseEvent) => {
      let hit, res;
      let id = Math.floor(Math.random() * 66655) + 1;
      hit = this.Points.tryClick(e, map, this.pointsInstances, id);
      if (hit !== undefined) res = hit;

      hit = this.Lines.tryClick(e, map, this.linesInstances, id);
      if (hit !== undefined) res = res || hit;

      hit = this.Shapes.tryClick(e, map, this.shapesInstances, id);
      if (hit !== undefined) res = res || hit;

      hit = this.Quads.tryClick(e, map, this.quadsInstances, id);
      if (hit !== undefined) res = res || hit;

      return res;
    });
  }

  setupHover(map: Map, hoverWait?: number, immediate?: false): void {
    if (this.hoverSetupMaps.includes(map)) return;
    this.hoverSetupMaps.push(map);
    map.on(
      "mousemove",
      debounce(
        (e: LeafletMouseEvent) => {
          this.Points.tryHover(e, map, this.pointsInstances);
          this.Lines.tryHover(e, map, this.linesInstances);
          this.Shapes.tryHover(e, map, this.shapesInstances);
          this.Quads.tryHover(e, map, this.quadsInstances);
          this.Texts.tryHover(e, map, this.textsInstances);
          this.Text2D.tryHover(e, map, this.text2dInstances);
        },
        hoverWait ?? 0,
        immediate
      )
    );
  }

  destroyByMap(map: Map): this {
    const destroyAndFilter = <T extends { map: Map; destroy?: () => unknown }>(
      instances: T[]
    ): T[] => {
      instances.forEach((instance) => {
        if (instance.map === map && typeof instance.destroy === "function") {
          instance.destroy();
        }
      });
      return instances.filter((instance) => instance.map !== map);
    };

    this.pointsInstances = destroyAndFilter(this.pointsInstances);
    this.linesInstances = destroyAndFilter(this.linesInstances);
    this.shapesInstances = destroyAndFilter(this.shapesInstances);
    this.quadsInstances = destroyAndFilter(this.quadsInstances);
    this.textsInstances = destroyAndFilter(this.textsInstances);
    this.text2dInstances = destroyAndFilter(this.text2dInstances);

    this.clickSetupMaps = this.clickSetupMaps.filter((m) => m !== map);
    this.hoverSetupMaps = this.hoverSetupMaps.filter((m) => m !== map);
    return this;
  }

  destroyAll(): this {
    this.allLayerInstances.forEach((instance) => {
      if (typeof instance.destroy === "function") {
        instance.destroy();
      }
    });
    this.pointsInstances = [];
    this.linesInstances = [];
    this.shapesInstances = [];
    this.quadsInstances = [];
    this.textsInstances = [];
    this.text2dInstances = [];
    this.clickSetupMaps = [];
    this.hoverSetupMaps = [];
    return this;
  }
}

export const glify = new Glify();
export default glify;
if (typeof window !== "undefined" && window.L) {
  // @ts-expect-error exporting it to window
  window.L.glify = glify;
  // @ts-expect-error exporting it to window
  window.L.Glify = Glify;
}
