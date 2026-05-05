import { describe, it, expect } from 'vitest';
import mgrs from 'mgrs';
import { clipPolygonToZoneBand, getZoneBandBounds } from '../src/generate-grids.js';

function pad(value, digits) {
  return String(value).padStart(digits, '0');
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

function create100kmPolygon(prefix) {
  const sw = getCornerPoint(prefix, 0, 0);
  const se = getCornerPoint(prefix, 100000, 0);
  const ne = getCornerPoint(prefix, 100000, 100000);
  const nw = getCornerPoint(prefix, 0, 100000);
  return [sw, se, ne, nw, sw];
}

function bbox(ring) {
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

describe('Zone boundary clipping', () => {
  it('clips 54T side to <= 144E and 55T side to >= 144E for boundary pair', () => {
    const leftRaw = create100kmPolygon('54TYM');
    const rightRaw = create100kmPolygon('55TBG');

    const left = clipPolygonToZoneBand(leftRaw, '54TYM');
    const right = clipPolygonToZoneBand(rightRaw, '55TBG');

    expect(left).toBeTruthy();
    expect(right).toBeTruthy();

    const leftB = bbox(left);
    const rightB = bbox(right);

    expect(leftB.maxLon).toBeLessThanOrEqual(144 + 1e-9);
    expect(rightB.minLon).toBeGreaterThanOrEqual(144 - 1e-9);
  });

  it('respects latitude band T bounds for clipped polygons', () => {
    const raw = create100kmPolygon('54TYM');
    const clipped = clipPolygonToZoneBand(raw, '54TYM');
    const bounds = getZoneBandBounds('54TYM');

    expect(clipped).toBeTruthy();

    const b = bbox(clipped);
    expect(b.minLat).toBeGreaterThanOrEqual(bounds.south - 1e-9);
    expect(b.maxLat).toBeLessThanOrEqual(bounds.north + 1e-9);
  });
});
