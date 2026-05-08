import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LayerControl } from "maplibre-gl-layer-control";
import "maplibre-gl-layer-control/style.css";
import { Protocol } from "pmtiles";
import "./styles.css";

const MGRS_TILEJSON = "https://tunnel.optgeo.org/martin/mgrs-hokkaido";
const GSI_STYLE_URL = "https://gsi-cyberjapan.github.io/optimal_bvmap/style/std.json";
const TERRAIN_TILEJSON = "https://tunnel.optgeo.org/martin/mapterhorn";

try {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
} catch (error) {
  console.error("Failed to initialize PMTiles protocol", error);
}

let style = {
  version: 8,
  sources: {
    "terrain-dem": {
      type: "raster-dem",
      url: TERRAIN_TILEJSON,
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 14,
    },
    "terrain-hillshade": {
      type: "raster-dem",
      url: TERRAIN_TILEJSON,
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 14,
    },
  },
  layers: [
    {
      id: "terrain-hillshade",
      type: "hillshade",
      source: "terrain-hillshade",
      paint: {
        "hillshade-highlight-color": "rgba(255,255,255,0.15)",
        "hillshade-shadow-color": "rgba(0,0,0,0.35)",
        "hillshade-accent-color": "rgba(180,140,100,0.2)",
        "hillshade-illumination-direction": 315,
        "hillshade-exaggeration": 1.0,
      },
    },
  ],
};

const statusBar = document.getElementById("status-bar");
const loadingOverlay = document.getElementById("loading-overlay");
const defaultStatus = "MGRS PMTiles Viewer";

const setLoading = (visible) => {
  if (!loadingOverlay) {
    return;
  }
  loadingOverlay.classList.toggle("is-visible", visible);
};

const overlayLayerIds = [];

// Style layer maxzoom is exclusive, so this is data maxzoom + 1.
const gridZoomBands = {
  "100km": { minzoom: 3, maxzoom: 8 },
  "10km": { minzoom: 8, maxzoom: 11 },
  "1km": { minzoom: 11, maxzoom: 15 },
  "100m": { minzoom: 15, maxzoom: 22 },
};

// 100km centroid labels (2-letter square ID, e.g. "VN")
const centroidLabelSpecs = [
  {
    id: "mgrs-100km-label",
    sourceLayer: "mgrs_100km_label_points",
    minzoom: 5,
    maxzoom: gridZoomBands["100km"].maxzoom,
    textSizeStops: [5, 8, 6, 12, 7, 16, 8, 20],
    anchor: "center",
    opacity: 0.92,
  },
];

// Edge labels: easting (bottom-edge midpoint) and northing (right-edge midpoint).
// text-anchor "top"  → label hangs below the bottom grid line.
// text-anchor "left" → label extends rightward from the right grid line.
const edgeLabelSpecs = [
  {
    id: "mgrs-10km-label-e",
    sourceLayer: "mgrs_10km_label_e",
    minzoom: 8,
    maxzoom: 22,
    textSizeStops: [8, 7, 10, 11, 11, 14],
    anchor: "top",
    offset: [0, 0.25],
    opacity: 0.92,
  },
  {
    id: "mgrs-10km-label-n",
    sourceLayer: "mgrs_10km_label_n",
    minzoom: 8,
    maxzoom: 22,
    textSizeStops: [8, 7, 10, 11, 11, 14],
    anchor: "left",
    offset: [0.25, 0],
    opacity: 0.92,
  },
  {
    id: "mgrs-1km-label-e",
    sourceLayer: "mgrs_1km_label_e",
    minzoom: 11,
    maxzoom: 22,
    textSizeStops: [11, 7, 13, 10, 15, 13],
    anchor: "top",
    offset: [0, 0.25],
    opacity: 0.92,
  },
  {
    id: "mgrs-1km-label-n",
    sourceLayer: "mgrs_1km_label_n",
    minzoom: 11,
    maxzoom: 22,
    textSizeStops: [11, 7, 13, 10, 15, 13],
    anchor: "left",
    offset: [0.25, 0],
    opacity: 0.92,
  },
  {
    id: "mgrs-100m-label-e",
    sourceLayer: "mgrs_100m_label_e",
    minzoom: 15,
    maxzoom: 22,
    textSizeStops: [15, 7, 17, 10, 19, 13],
    anchor: "top",
    offset: [0, 0.25],
    opacity: 0.92,
  },
  {
    id: "mgrs-100m-label-n",
    sourceLayer: "mgrs_100m_label_n",
    minzoom: 15,
    maxzoom: 22,
    textSizeStops: [15, 7, 17, 10, 19, 13],
    anchor: "left",
    offset: [0.25, 0],
    opacity: 0.92,
  },
];

let map;

// Initialize map once GSI style is loaded
(async () => {
  try {
    // Fetch GSI optimal basemap style
    const gsiResponse = await fetch(GSI_STYLE_URL);
    const gsiStyle = await gsiResponse.json();

    // Merge GSI sources and layers into our style
    if (gsiStyle.sources) {
      style.sources = { ...gsiStyle.sources, ...style.sources };
    }
    if (gsiStyle.layers) {
      style.layers = [...gsiStyle.layers, ...style.layers];
    }
    if (gsiStyle.sprite) {
      style.sprite = gsiStyle.sprite;
    }
    if (gsiStyle.glyphs) {
      style.glyphs = gsiStyle.glyphs;
    }

    // Initialize map with merged style
    map = new maplibregl.Map({
      container: "map",
      style,
      center: [141.3545, 43.0618],
      zoom: 7,
      pitch: 38,
      bearing: -12,
      hash: "map",
      maxZoom: 22,
      antialias: true,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true,
      }),
      "bottom-left",
    );

    map.on("dataloading", () => {
      setLoading(true);
    });

    map.on("idle", () => {
      setLoading(false);
    });

    map.on("error", (event) => {
      console.error("MapLibre runtime error", event.error || event);
    });

    map.on("load", () => {
      map.setTerrain({ source: "terrain-dem", exaggeration: 1.0 });

      map.on("styleimagemissing", (event) => {
        if (map.hasImage(event.id)) {
          return;
        }

        // GSI sprite fallback for missing images
        map.addImage(event.id, {
          width: 1,
          height: 1,
          data: new Uint8Array([0, 0, 0, 0]),
        });
      });

      map.addSource("mgrs-pmtiles", {
        type: "vector",
        url: MGRS_TILEJSON,
        maxzoom: 16,
      });

      const overlayLayers = [
        {
          id: "mgrs-100km-line-blur",
          type: "line",
          source: "mgrs-pmtiles",
          "source-layer": "mgrs_100km",
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.2, 9, 3.2],
            "line-opacity": 0.4,
            "line-blur": 1.5,
          },
          minzoom: gridZoomBands["100km"].minzoom,
          maxzoom: gridZoomBands["100km"].maxzoom,
        },
        {
          id: "mgrs-100km-line",
          type: "line",
          source: "mgrs-pmtiles",
          "source-layer": "mgrs_100km",
          paint: {
            "line-color": "#00FF00",
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 9, 2.2],
          },
          minzoom: gridZoomBands["100km"].minzoom,
          maxzoom: gridZoomBands["100km"].maxzoom,
        },
        {
          id: "mgrs-10km-line-blur",
          type: "line",
          source: "mgrs-pmtiles",
          "source-layer": "mgrs_10km",
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 13, 2.4],
            "line-opacity": 0.4,
            "line-blur": 1.5,
          },
          minzoom: gridZoomBands["10km"].minzoom,
          maxzoom: gridZoomBands["10km"].maxzoom,
        },
        {
          id: "mgrs-10km-line",
          type: "line",
          source: "mgrs-pmtiles",
          "source-layer": "mgrs_10km",
          paint: {
            "line-color": "#00FF00",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 13, 1.4],
          },
          minzoom: gridZoomBands["10km"].minzoom,
          maxzoom: gridZoomBands["10km"].maxzoom,
        },
        {
          id: "mgrs-1km-line-blur",
          type: "line",
          source: "mgrs-pmtiles",
          "source-layer": "mgrs_1km",
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 16, 2.1],
            "line-opacity": 0.4,
            "line-blur": 1.5,
          },
          minzoom: gridZoomBands["1km"].minzoom,
          maxzoom: gridZoomBands["1km"].maxzoom,
        },
        {
          id: "mgrs-1km-line",
          type: "line",
          source: "mgrs-pmtiles",
          "source-layer": "mgrs_1km",
          paint: {
            "line-color": "#00FF00",
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.25, 16, 1.1],
          },
          minzoom: gridZoomBands["1km"].minzoom,
          maxzoom: gridZoomBands["1km"].maxzoom,
        },
        {
          id: "mgrs-100m-line-blur",
          type: "line",
          source: "mgrs-pmtiles",
          "source-layer": "mgrs_100m",
          paint: {
            "line-color": "#ffffff",
            "line-opacity": 0.3,
            "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.4, 18, 1.8],
            "line-blur": 1.5,
          },
          minzoom: gridZoomBands["100m"].minzoom,
          maxzoom: gridZoomBands["100m"].maxzoom,
        },
        {
          id: "mgrs-100m-line",
          type: "line",
          source: "mgrs-pmtiles",
          "source-layer": "mgrs_100m",
          paint: {
            "line-color": "#00FF00",
            "line-opacity": 0.75,
            "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.2, 18, 0.9],
          },
          minzoom: gridZoomBands["100m"].minzoom,
          maxzoom: gridZoomBands["100m"].maxzoom,
        },
      ];

      for (const layer of overlayLayers) {
        map.addLayer(layer);
        overlayLayerIds.push(layer.id);
      }

      for (const spec of centroidLabelSpecs) {
        map.addLayer({
          id: spec.id,
          type: "symbol",
          source: "mgrs-pmtiles",
          "source-layer": spec.sourceLayer,
          minzoom: spec.minzoom,
          maxzoom: spec.maxzoom,
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["sans-serif"],
            "text-size": ["interpolate", ["linear"], ["zoom"], ...spec.textSizeStops],
            "text-allow-overlap": true,
            "text-anchor": spec.anchor,
            "text-justify": "center",
            "text-padding": 1,
          },
          paint: {
            "text-color": "#00FF00",
            "text-halo-color": "rgba(0, 0, 0, 0.72)",
            "text-halo-width": 1.4,
            "text-opacity": spec.opacity,
          },
        });
        overlayLayerIds.push(spec.id);
      }

      for (const spec of edgeLabelSpecs) {
        map.addLayer({
          id: spec.id,
          type: "symbol",
          source: "mgrs-pmtiles",
          "source-layer": spec.sourceLayer,
          minzoom: spec.minzoom,
          maxzoom: spec.maxzoom,
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["sans-serif"],
            "text-size": ["interpolate", ["linear"], ["zoom"], ...spec.textSizeStops],
            "text-allow-overlap": true,
            "text-anchor": spec.anchor,
            "text-offset": spec.offset,
            "text-padding": 1,
          },
          paint: {
            "text-color": "#00FF00",
            "text-halo-color": "rgba(0, 0, 0, 0.72)",
            "text-halo-width": 1.5,
            "text-opacity": spec.opacity,
          },
        });
        overlayLayerIds.push(spec.id);
      }

      const layerControl = new LayerControl({
        collapsed: true,
        layers: overlayLayerIds,
        showOpacitySlider: true,
        showLayerSymbol: true,
        showStyleEditor: false,
        panelWidth: 320,
        panelMinWidth: 220,
        panelMaxWidth: 420,
      });

      map.addControl(layerControl, "bottom-left");

      if (statusBar) {
        statusBar.textContent = defaultStatus;
      }
    });
  } catch (error) {
    console.error("Failed to initialize map with GSI style", error);
  }
})();

const renderHoverStatus = (point) => {
  if (!map || !statusBar || overlayLayerIds.length === 0) {
    return;
  }

  const features = map.queryRenderedFeatures(point, { layers: overlayLayerIds });
  if (!features.length) {
    map.getCanvas().style.cursor = "";
    statusBar.textContent = defaultStatus;
    return;
  }

  const feature = features[0];
  const props = feature.properties || {};
  const key =
    props.grid ||
    props.mgrs ||
    props.code ||
    props.id ||
    props.name ||
    props.utm_zone ||
    "feature";

  map.getCanvas().style.cursor = "pointer";
  statusBar.textContent = `${feature.layer.id}: ${key}`;
};

document.addEventListener("mousemove", (event) => {
  if (map && map.getCanvas()) {
    const point = { x: event.clientX, y: event.clientY };
    renderHoverStatus(point);
  }
});

document.addEventListener("mouseleave", () => {
  if (!statusBar || !map) {
    return;
  }

  if (map.getCanvas()) {
    map.getCanvas().style.cursor = "";
  }
  statusBar.textContent = defaultStatus;
});
