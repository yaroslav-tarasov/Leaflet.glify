<<<<<<< HEAD:src/canvas-overlay.test.ts
import { CanvasOverlay, unclampedLatLngBoundsToNewLayerBounds, unclampedProject } from "./canvas-overlay";
=======
import { CanvasOverlay } from "../canvas-overlay";
>>>>>>> a8863331b40eb156a2084a9464ae29d059b26cae:src/tests/canvas-overlay.test.ts
import {
  Bounds,
  LatLng,
  LatLngBounds,
  Map,
  MapOptions,
  Point,
  ResizeEvent,
  Util,
  ZoomAnimEvent,
} from "leaflet";

describe("CanvasOverlay", () => {
  describe("constructor", () => {
    it("sets this._userDrawFunc and this.pane from argument", () => {
      const fn = { userDrawFunc:() => {}};
      const pane = "pane";
      const co = new CanvasOverlay(fn, pane);
      expect(co._userDrawFunc).toBe(fn.userDrawFunc);
      expect(co._pane).toBe(pane);
    });
  });

  describe("drawing", () => {
    it("sets this._userDrawFunc", () => {
      const co = new CanvasOverlay({ userDrawFunc:() => {}}, "");
      const fn = () => {};
      co.drawing(fn);
      expect(co._userDrawFunc).toBe(fn);
    });
  });

  describe("params", () => {
    it("sets options", () => {
      const co = new CanvasOverlay({ userDrawFunc:() => {}}, "");
      co.params({ pane: "pane" });
      expect(co.options?.pane).toBe("pane");
    });
  });

  describe("redraw", () => {
    describe("when callback is truthy", () => {
      it("is added to this._redrawCallbacks", () => {
        const co = new CanvasOverlay({ userDrawFunc:() => {}}, "");
        const fn = () => {};
        co.redraw(fn);
        expect(co._redrawCallbacks).toContain(fn);
      });
    });
    describe("when this._frame is null", () => {
      let requestAnimFrame: jest.SpyInstance;
      beforeEach(() => {
        requestAnimFrame = jest.spyOn(Util, "requestAnimFrame");
      });
      afterEach(() => {
        requestAnimFrame.mockRestore();
      });

      it("sets this._frame from Util.requestAnimFrame", () => {
        const co = new CanvasOverlay({ userDrawFunc:() => {}}, "");
        const fn = () => {};
        expect(co.tag).not.toBe(null);
        expect(co.controller().frame).toBe(null); // co._frame
        co.redraw(fn);
        expect(co.controller().frame).not.toBe(null);
        expect(requestAnimFrame).toHaveBeenCalledWith(co.controller()._redraw, co);
      });
    });
  });

  describe("onAdd", () => {
    it("sets this.map from map argument", () => {
      const co = new CanvasOverlay({ userDrawFunc:() => {}}, "pane");
      const el = document.createElement("div");
      const map = new Map(el);
      map.createPane("pane");
      map.setView([1, 1], 1);
      co.onAdd(map);
      expect(co.map).toBe(map);
    });
    describe("when this.canvas is not defined", () => {
      it("sets this.canvas from a new canvas", () => {
        const co = getCo();
        const map = co.map;
        expect(co.canvas).toBe(undefined);
        co.onAdd(map);
        expect(co.canvas).not.toBe(undefined);
      });
    });
    describe("when this.canvas is defined", () => {
      it("uses this.canvas", () => {
        const co = getCo();
        const map = co.map;
        const canvas = (co.canvas = document.createElement("canvas"));
        co.onAdd(map);
        expect(canvas.className).toEqual("leaflet-zoom-hide");
      });
    });
    describe("when pane cannot be found", () => {
      it("throws", () => {
        const co = new CanvasOverlay({ userDrawFunc:() => {}}, "pane");
        const el = document.createElement("div");
        const map = new Map(el);
        map.setView([1, 1], 1);
        expect(() => {
          co.onAdd(map);
        }).toThrow("unable to find pane");
      });
    });
    it('calls map.on("moveend") and map.on("resize") correctly', () => {
      const co = getCo();
      const map = co.map;
      jest.spyOn(map, "on");
      co.onAdd(map);
      expect(map.on).toHaveBeenCalledWith("moveend", co.controller()._reset, co.controller());
      expect(map.on).toHaveBeenCalledWith("resize", co.controller()._resize, co.controller());
    });
    describe("when isAnimated", () => {
      it('calls map.on("zoomanim") correctly', () => {
        const co = getCo();
        jest.spyOn(co, "isAnimated").mockReturnValue(true);
        const map = co.map;
        jest.spyOn(map, "on");
        co.onAdd(map);
        expect(map.on).toHaveBeenCalledWith("zoomanim", co.controller()._animateZoom, co.controller());
      });
    });
    it("calls this._reset", () => {
      const co = getCo();
      const map = co.map;
      jest.spyOn(co.controller(), "_reset");
      co.onAdd(map);
      expect(co.controller()._reset).toHaveBeenCalled();
    });
  });

  describe("onRemove", () => {
    describe("when this.canvas is truthy", () => {
      describe("when pane is not found", () => {
        it("throws", () => {
          const co = getCo();
          co.canvas = document.createElement("canvas");
          co._pane = "";
          const map = co.map;
          expect(() => {
            co.onRemove(map);
          }).toThrow();
        });
      });
      describe("when pane is found", () => {
        it("removes child from pane", () => {
          const co = getCo();
          co.canvas = document.createElement("canvas");
          const map = co.map;
          const pane = map.getPane("pane") as HTMLCanvasElement;

          pane.appendChild(co.canvas);
          jest.spyOn(pane, "removeChild");
          co.onRemove(map);
          expect(pane.removeChild).toHaveBeenCalledWith(co.canvas);
        });
      });
    });
    it("calls map.off correctly", () => {
      const co = getCo();
      const map = co.map;
      jest.spyOn(map, "off");
      co.onRemove(map);
      expect(map.off).toHaveBeenCalledWith("moveend", co.controller()._reset, co.controller());
      expect(map.off).toHaveBeenCalledWith("resize", co.controller()._resize, co.controller());
    });

    describe("when this.isAnimated returns true", () => {
      it('calls map.off("zoomanim") correctly', () => {
        const co = getCo();
        const map = co.map;
        jest.spyOn(co, "isAnimated").mockReturnValue(true);
        jest.spyOn(map, "off");
        co.onRemove(map);
        expect(map.off).toHaveBeenCalledWith("zoomanim", co.controller()._animateZoom, co.controller());
      });
    });
  });
  describe("addTo", () => {
    it("calls map.AddLayer with this", () => {
      const co = getCo();
      const map = co.map;
      jest.spyOn(map, "addLayer");
      co.addTo(map);
      expect(map.addLayer).toHaveBeenCalledWith(co);
    });
  });
  describe("_resize", () => {
    describe("when this.canvas is defined", () => {
      it("changes the canvas size", () => {
        const co = getCo();
        expect(co.tag).not.toBe(null);
        const canvas = (co.canvas = document.createElement("canvas"));
        canvas.width = 1;
        canvas.height = 1;
        const resizeEvent: ResizeEvent = {
          oldSize: new Point(1, 1),
          newSize: new Point(2, 3),
          type: "fake resize event",
          target: co,
          sourceTarget: "",
          propagatedFrom: "",
          popup: "",
          layer: co,
          popup: null,
        };
        co._resize(resizeEvent);

        expect(canvas.width).toBe(2);
        expect(canvas.height).toBe(3);
      });
    });
  });

  describe("_reset", () => {
    describe("when canvas is set", () => {
      it("sets canvas position to 0,0", () => {
        const co = getCo();
        const map = co.map;
        jest
          .spyOn(map, "containerPointToLayerPoint")
          .mockReturnValue(new Point(1, 2));
        const canvas = (co.canvas = document.createElement("canvas"));
        expect(canvas.style.top).toBe("");
        expect(canvas.style.left).toBe("");
        co._reset();
        expect(map.containerPointToLayerPoint).toHaveBeenCalledWith([0, 0]);
        expect(canvas.style.left).toBe("1px");
        expect(canvas.style.top).toBe("2px");
      });
    });
    it("calls this._redraw", () => {
      const co = getCo();
      jest.spyOn(co.controller(), "_redraw");
      co._reset();
      expect(co.controller()._redraw).toHaveBeenCalled();
    });
  });

  describe("_redraw", () => {
    describe("when this.canvas is set", () => {
      it("calls this._userDrawFunc correctly", () => {
        const co = getCo();
        const canvas = (co.canvas = document.createElement("canvas"));
        jest.spyOn(co, "_userDrawFunc");
        const map = co.map;
        const size = new Point(100, 100);
        const bounds = new LatLngBounds(new LatLng(1, 1), new LatLng(10, 10));
        const zoom = 20;
        jest.spyOn(map, "getSize").mockReturnValue(size);
        jest.spyOn(map, "getBounds").mockReturnValue(bounds);
        jest.spyOn(map, "getZoom").mockReturnValue(zoom);
        co._redraw();
        expect(co._userDrawFunc).toHaveBeenCalledWith({
          bounds,
          canvas,
          offset: unclampedProject( map,
            new LatLng(bounds.getNorth(), bounds.getWest()),
            0
          ),
          scale: Math.pow(2, zoom),
          size,
          zoomScale: 0.00009981280936050754,
          zoom,
          clear: true
        });
      });
    });
    it("calls this._redrawCallbacks for each and shifts them off", () => {
      const co = getCo();
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      co._redrawCallbacks.push(cb1, cb2);
      co._redraw();
      expect(cb1).toHaveBeenCalledWith(co);
      expect(cb2).toHaveBeenCalledWith(co);
      expect(co._redrawCallbacks.length).toBe(0);
    });
    it("sets this._frame to null", () => {
      const co = getCo();
      expect(co.tag).not.toBe(null);
      co.controller().frame = 10;
      co._redraw();
      expect(co.controller().frame).toBeNull();
    });
  });

  describe("_animateZoom", () => {
    it("transforms canvas correctly", () => {
      const co = getCo();
      const canvas = (co.canvas = document.createElement("canvas"));
      const e: ZoomAnimEvent = {
        type: "fake leaflet event",
        target: canvas,
        sourceTarget: "",
        propagatedFrom: "",
        layer: co,
        center: new LatLng(10, 10),
        zoom: 10,
        noUpdate: true,
<<<<<<< HEAD:src/canvas-overlay.test.ts
        popup: null,
=======
        popup: "",
>>>>>>> a8863331b40eb156a2084a9464ae29d059b26cae:src/tests/canvas-overlay.test.ts
      };
      co._animateZoom(e);
      expect(canvas.style.transform).toBe(
        "translate3d(-6770px,6807px,0) scale(512)"
      );
    });
  });

  describe("_animateZoomNoLayer", () => {
    it("transforms canvas correctly", () => {
      const co = getCo();
      const canvas = (co.canvas = document.createElement("canvas"));
      const e: ZoomAnimEvent = {
        type: "fake leaflet event",
        target: canvas,
        sourceTarget: "",
        propagatedFrom: "",
        layer: co,
        center: new LatLng(10, 10),
        zoom: 10,
        noUpdate: true,
<<<<<<< HEAD:src/canvas-overlay.test.ts
        popup: null,
=======
        popup: "",
>>>>>>> a8863331b40eb156a2084a9464ae29d059b26cae:src/tests/canvas-overlay.test.ts
      };
      co._animateZoomNoLayer(e);
      expect(canvas.style.transform).toBe(
        "translate3d(-6656px,6656px,0) scale(512)"
      );
    });
  });

  describe("_unclampedProject", () => {
    it("calls crs.transformation._transform with correct projectedPoint and scale", () => {
      const co = getCo();
      const map = co.map;
      const transform = jest.spyOn(
        // @ts-expect-error experimental
        map.options.crs.transformation,
        "_transform"
      );
      unclampedProject( map, new LatLng(10, 10), 10);
      expect(transform).toHaveBeenCalledWith(
        {
          x: 138353.77777777778,
          y: 123752.96889714543,
        },
        262144
      );
    });
  });

  describe("_unclampedLatLngBoundsToNewLayerBounds", () => {
    it("returns the correct unclamped value", () => {
      const co = getCo();
      expect(
         unclampedLatLngBoundsToNewLayerBounds( co.map,
          new LatLngBounds(new LatLng(1, 1), new LatLng(10, 10)),
          10,
          new LatLng(5, 5)
        )
      ).toEqual(
        new Bounds(
          new Point(-2912.822222222225, -3673.0311028545693),
          new Point(3640.777777777781, 2917.7852501339657)
        )
      );
    });
  });
});

function getCo(mapOptions?: MapOptions): CanvasOverlay {
  const co = new CanvasOverlay({ userDrawFunc:() => {}}, "pane");
  const el = document.createElement("div");
  const map = new Map(el, mapOptions);
  map.createPane("pane");
  map.setView([1, 1], 1);
  co.map = map;
  return co;
}
