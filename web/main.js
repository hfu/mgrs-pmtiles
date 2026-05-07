import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LayerControl } from "maplibre-gl-layer-control";
import "maplibre-gl-layer-control/style.css";
import { Protocol } from "pmtiles";
import { DARK, layers as protomapsLayers } from "@protomaps/basemaps";
import "./styles.css";

const PMTILES_URL =
  "https://huggingface.co/datasets/smartmaps/mgrs-pmtiles/resolve/main/mgrs-hokkaido.pmtiles";
const BASEMAP_TILEJSON = "https://tunnel.optgeo.org/martin/protomaps-basemap";
const TERRAIN_TILEJSON = "https://tunnel.optgeo.org/martin/mapterhorn";

try {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
} catch (error) {
  console.error("Failed to initialize PMTiles protocol", error);
}

const baseLayers = protomapsLayers("protomaps-basemap", DARK, { lang: "ja" }).map(
  (layer) => {
    if (layer.type !== "symbol") {
      return layer;
    }

    return {
      ...layer,
      layout: {
        ...(layer.layout || {}),
        "text-font": ["sans-serif"],
      },
    };
  },
);

const style = {
  version: 8,
  sources: {
    "protomaps-basemap": {
      type: "vector",
      url: BASEMAP_TILEJSON,
    },
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
    ...baseLayers,
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

const map = new maplibregl.Map({
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

const labelSpecs = [
  {
    id: "mgrs-100km-label",
    sourceLayer: "mgrs_100km_label_points",
    minzoom: 5,
    maxzoom: gridZoomBands["100km"].maxzoom,
    textSizeStops: [5, 4, 6, 12, 7.2, 24, 8, 28],
  },
  {
    id: "mgrs-10km-label",
    sourceLayer: "mgrs_10km_label_points",
    minzoom: 8.5,
    maxzoom: gridZoomBands["10km"].maxzoom,
    textSizeStops: [8, 3, 9, 12, 10, 20, 11, 28],
  },
  {
    id: "mgrs-1km-label",
    sourceLayer: "mgrs_1km_label_points",
    minzoom: 11.5,
    maxzoom: gridZoomBands["1km"].maxzoom,
    textSizeStops: [11, 3, 12, 9, 13, 20, 14, 28, 15, 34],
  },
  {
    id: "mgrs-100m-label",
    sourceLayer: "mgrs_100m_label_points",
    minzoom: 15.5,
    maxzoom: gridZoomBands["100m"].maxzoom,
    textSizeStops: [15.5, 6, 16, 10, 18, 16, 20, 22, 22, 28],
  },
];

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

    // Protomaps can reference optional sprites that are absent on some deployments.
    map.addImage(event.id, {
      width: 1,
      height: 1,
      data: new Uint8Array([0, 0, 0, 0]),
    });
  });

  map.addSource("mgrs-pmtiles", {
    type: "vector",
    url: `pmtiles://${PMTILES_URL}`,
    maxzoom: 16,
  });

  const overlayLayers = [
    {
      id: "mgrs-100km-fill",
      type: "fill",
      source: "mgrs-pmtiles",
      "source-layer": "mgrs_100km",
      paint: {
        "fill-color": "rgba(63, 186, 255, 0.08)",
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
        "line-color": "#6fc7ff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 9, 2.2],
      },
      minzoom: gridZoomBands["100km"].minzoom,
      maxzoom: gridZoomBands["100km"].maxzoom,
    },
    {
      id: "mgrs-10km-line",
      type: "line",
      source: "mgrs-pmtiles",
      "source-layer": "mgrs_10km",
      paint: {
        "line-color": "#9ed4ff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 13, 1.4],
      },
      minzoom: gridZoomBands["10km"].minzoom,
      maxzoom: gridZoomBands["10km"].maxzoom,
    },
    {
      id: "mgrs-1km-line",
      type: "line",
      source: "mgrs-pmtiles",
      "source-layer": "mgrs_1km",
      paint: {
        "line-color": "#d8eeff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.25, 16, 1.1],
      },
      minzoom: gridZoomBands["1km"].minzoom,
      maxzoom: gridZoomBands["1km"].maxzoom,
    },
    {
      id: "mgrs-100m-line",
      type: "line",
      source: "mgrs-pmtiles",
      "source-layer": "mgrs_100m",
      paint: {
        "line-color": "#ffffff",
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

  for (const spec of labelSpecs) {
    map.addLayer({
      id: spec.id,
      type: "symbol",
      source: "mgrs-pmtiles",
      "source-layer": spec.sourceLayer,
      minzoom: spec.minzoom,
      maxzoom: spec.maxzoom,
      layout: {
        "text-field": ["get", "mgrs"],
        "text-font": ["sans-serif"],
        "text-size": ["interpolate", ["linear"], ["zoom"], ...spec.textSizeStops],
        "text-allow-overlap": false,
        "text-anchor": "center",
        "text-justify": "center",
        "text-radial-offset": 0,
        "text-padding": 2,
      },
      paint: {
        "text-color": "rgba(224, 241, 255, 0.86)",
        "text-halo-color": "rgba(7, 11, 15, 0.92)",
        "text-halo-width": 1.1,
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

const renderHoverStatus = (point) => {
  if (!statusBar || overlayLayerIds.length === 0) {
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

map.on("mousemove", (event) => {
  renderHoverStatus(event.point);
});

map.getCanvas().addEventListener("mouseleave", () => {
  if (!statusBar) {
    return;
  }

  map.getCanvas().style.cursor = "";
  statusBar.textContent = defaultStatus;
});
