#!/usr/bin/env node

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import mgrs from 'mgrs';

const TARGET_PROFILE = (process.env.MGRS_TARGET || '54t_core').toLowerCase();

const REGION_PROFILES = {
  '54t_core': {
    description: 'Legacy 54T core area (54TWN/54TWP)',
    fixedPrefixes: ['54TWN', '54TWP'],
  },
  'hokkaido_all': {
    description: 'Full Hokkaido coverage including islands',
    // Sampling over this extent discovers relevant 100km grid prefixes.
    bounds: [
      { west: 139.0, east: 149.8, south: 41.2, north: 46.2 },
    ],
    stepDeg: 0.05,
    // Explicit seed points help ensure island coverage is retained.
    seedPoints: [
      [142.8, 43.8], // Hokkaido main
      [141.2, 45.2], // Rebun/Rishiri side
      [145.8, 44.1], // Eastern island area
      [146.8, 43.8], // Southeastern island area
      [148.9, 45.2], // Northeastern island area
    ],
  },
};

const LAYER_CONFIG = {
  mgrs_100km: { minzoom: 3, maxzoom: 7 },
  mgrs_10km: { minzoom: 8, maxzoom: 10 },
  mgrs_1km: { minzoom: 11, maxzoom: 12 },
  mgrs_100m: { minzoom: 13, maxzoom: 16 },
};

const LAT_BANDS = 'CDEFGHJKLMNPQRSTUVWX';

function configureStdoutFromEnv() {
  // On POSIX, stdout connected to a pipe is asynchronous by default.
  // This opt-in mode forces blocking writes and stabilizes long JSONL streams.
  if (process.env.MGRS_STDOUT_BLOCKING !== '1') {
    return;
  }

  const handle = process.stdout && process.stdout._handle;
  if (handle && typeof handle.setBlocking === 'function') {
    handle.setBlocking(true);
  }
}

function pad(value, digits) {
  return String(value).padStart(digits, '0');
}

function writeLine(line) {
  // fs.writeSync emits each feature as an immediate syscall, equivalent to
  // per-feature flush semantics from the producer side.
  fs.writeSync(1, `${line}\n`);
}

function getCornerPoint(gridPrefix, eMeter, nMeter) {
  const MAX_METER = 100000;
  const e = Math.min(eMeter, MAX_METER - 1);
  const n = Math.min(nMeter, MAX_METER - 1);
  const code = `${gridPrefix}${pad(e, 5)}${pad(n, 5)}`;
  const [west, south, east, north] = mgrs.inverse(code);

  const useEast = eMeter === MAX_METER;
  const useNorth = nMeter === MAX_METER;

  return [useEast ? east : west, useNorth ? north : south];
}

function getLatitudeBandBounds(letter) {
  const idx = LAT_BANDS.indexOf(letter);
  if (idx === -1) {
    throw new Error(`Unsupported latitude band: ${letter}`);
  }

  if (letter === 'X') {
    return { south: 72, north: 84 };
  }

  const south = -80 + idx * 8;
  return { south, north: south + 8 };
}

export function getZoneBandBounds(gridPrefix) {
  const zone = Number.parseInt(gridPrefix.slice(0, 2), 10);
  const band = gridPrefix[2];

  if (!Number.isFinite(zone) || zone < 1 || zone > 60) {
    throw new Error(`Invalid MGRS zone in prefix: ${gridPrefix}`);
  }

  const west = zone * 6 - 186;
  const east = west + 6;
  const latBand = getLatitudeBandBounds(band);

  return {
    west,
    east,
    south: latBand.south,
    north: latBand.north,
  };
}

function bboxOfRing(ring) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLon, minLat, maxLon, maxLat };
}

function clipWithVertical(points, xEdge, keepLeft) {
  if (points.length === 0) return points;

  const out = [];
  const inside = ([x]) => (keepLeft ? x <= xEdge : x >= xEdge);

  let s = points[points.length - 1];
  for (const e of points) {
    const sIn = inside(s);
    const eIn = inside(e);

    if (eIn) {
      if (!sIn) {
        const t = (xEdge - s[0]) / (e[0] - s[0]);
        out.push([xEdge, s[1] + (e[1] - s[1]) * t]);
      }
      out.push(e);
    } else if (sIn) {
      const t = (xEdge - s[0]) / (e[0] - s[0]);
      out.push([xEdge, s[1] + (e[1] - s[1]) * t]);
    }

    s = e;
  }

  return out;
}

function clipWithHorizontal(points, yEdge, keepBelow) {
  if (points.length === 0) return points;

  const out = [];
  const inside = ([, y]) => (keepBelow ? y <= yEdge : y >= yEdge);

  let s = points[points.length - 1];
  for (const e of points) {
    const sIn = inside(s);
    const eIn = inside(e);

    if (eIn) {
      if (!sIn) {
        const t = (yEdge - s[1]) / (e[1] - s[1]);
        out.push([s[0] + (e[0] - s[0]) * t, yEdge]);
      }
      out.push(e);
    } else if (sIn) {
      const t = (yEdge - s[1]) / (e[1] - s[1]);
      out.push([s[0] + (e[0] - s[0]) * t, yEdge]);
    }

    s = e;
  }

  return out;
}

export function clipPolygonToZoneBand(polygonCoords, gridPrefix) {
  const bounds = getZoneBandBounds(gridPrefix);
  const bbox = bboxOfRing(polygonCoords);

  if (
    bbox.maxLon < bounds.west ||
    bbox.minLon > bounds.east ||
    bbox.maxLat < bounds.south ||
    bbox.minLat > bounds.north
  ) {
    return null;
  }

  if (
    bbox.minLon >= bounds.west &&
    bbox.maxLon <= bounds.east &&
    bbox.minLat >= bounds.south &&
    bbox.maxLat <= bounds.north
  ) {
    return polygonCoords;
  }

  let open = polygonCoords.slice(0, -1);
  open = clipWithVertical(open, bounds.west, false);
  open = clipWithVertical(open, bounds.east, true);
  open = clipWithHorizontal(open, bounds.south, false);
  open = clipWithHorizontal(open, bounds.north, true);

  if (open.length < 3) {
    return null;
  }

  return [...open, open[0]];
}

function create100kmPolygonFromMGRS(gridCode) {
  const sw = getCornerPoint(gridCode, 0, 0);
  const se = getCornerPoint(gridCode, 100000, 0);
  const ne = getCornerPoint(gridCode, 100000, 100000);
  const nw = getCornerPoint(gridCode, 0, 100000);
  return [sw, se, ne, nw, sw];
}

function emitFeature(layerName, mgrsCode, polygonCoords, resolution) {
  const cfg = LAYER_CONFIG[layerName];
  const feature = {
    type: 'Feature',
    tippecanoe: {
      layer: layerName,
      minzoom: cfg.minzoom,
      maxzoom: cfg.maxzoom,
    },
    properties: {
      mgrs: mgrsCode,
      resolution,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [polygonCoords],
    },
  };

  writeLine(JSON.stringify(feature));
}

function discover100kmPrefixes(profile) {
  if (profile.fixedPrefixes) {
    return [...profile.fixedPrefixes].sort();
  }

  const prefixes = new Set();
  const step = profile.stepDeg || 0.05;

  for (const box of profile.bounds || []) {
    for (let lat = box.south; lat <= box.north; lat += step) {
      for (let lon = box.west; lon <= box.east; lon += step) {
        try {
          const code = mgrs.forward([lon, lat]);
          prefixes.add(code.slice(0, 5));
        } catch {
          // Ignore non-convertible points and continue sampling.
        }
      }
    }
  }

  for (const point of profile.seedPoints || []) {
    try {
      const code = mgrs.forward(point);
      prefixes.add(code.slice(0, 5));
    } catch {
      // ignore
    }
  }

  return [...prefixes].sort();
}

function generate100kmGrids(prefixes) {
  for (const gridCode of prefixes) {
    const raw = create100kmPolygonFromMGRS(gridCode);
    const clipped = clipPolygonToZoneBand(raw, gridCode);
    if (!clipped) continue;
    emitFeature('mgrs_100km', gridCode, clipped, '100km');
  }
}

function generateSubgridLayer(prefixes, layerName, digitsPerAxis, resolution) {
  const count = 10 ** digitsPerAxis;
  const scale = 10 ** (5 - digitsPerAxis);

  for (const gridPrefix of prefixes) {
    let currentRow = [];
    for (let eIndex = 0; eIndex <= count; eIndex++) {
      currentRow.push(getCornerPoint(gridPrefix, eIndex * scale, 0));
    }

    for (let northing = 0; northing < count; northing++) {
      const nextRow = [];
      for (let eIndex = 0; eIndex <= count; eIndex++) {
        nextRow.push(getCornerPoint(gridPrefix, eIndex * scale, (northing + 1) * scale));
      }

      for (let easting = 0; easting < count; easting++) {
        const mgrsCode = `${gridPrefix}${pad(easting, digitsPerAxis)}${pad(northing, digitsPerAxis)}`;
        const rawPolygon = [
          currentRow[easting],
          currentRow[easting + 1],
          nextRow[easting + 1],
          nextRow[easting],
          currentRow[easting],
        ];
        const clipped = clipPolygonToZoneBand(rawPolygon, gridPrefix);
        if (!clipped) continue;
        emitFeature(layerName, mgrsCode, clipped, resolution);
      }

      currentRow = nextRow;
    }
  }
}

function main() {
  try {
    configureStdoutFromEnv();

    const profile = REGION_PROFILES[TARGET_PROFILE];
    if (!profile) {
      throw new Error(`Unknown MGRS_TARGET: ${TARGET_PROFILE}`);
    }

    const prefixes = discover100kmPrefixes(profile);
    if (prefixes.length === 0) {
      throw new Error(`No MGRS 100km prefixes discovered for profile: ${TARGET_PROFILE}`);
    }

    if (process.env.MGRS_LIST_PREFIXES === '1') {
      process.stderr.write(`${prefixes.join('\n')}\n`);
      return;
    }

    generate100kmGrids(prefixes);
    generateSubgridLayer(prefixes, 'mgrs_10km', 1, '10km');
    generateSubgridLayer(prefixes, 'mgrs_1km', 2, '1km');
    generateSubgridLayer(prefixes, 'mgrs_100m', 3, '100m');
  } catch (error) {
    console.error('Error generating grids:', error.message);
    process.exit(1);
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
