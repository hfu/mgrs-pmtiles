#!/usr/bin/env node

import mgrs from 'mgrs';

const GRID_PREFIXES = ['54TWN', '54TWP'];

function bbox(code) {
  return mgrs.inverse(code);
}

function degToMetersLon(deg, lat) {
  return deg * 111320 * Math.cos((lat * Math.PI) / 180);
}

function degToMetersLat(deg) {
  return deg * 110540;
}

function checkAdjacentGaps(gridPrefix, sampleStep = 37) {
  let maxEastWestGapDeg = 0;
  let maxNorthSouthGapDeg = 0;
  let maxEastWestGapM = 0;
  let maxNorthSouthGapM = 0;

  for (let e = 0; e < 999; e += sampleStep) {
    for (let n = 0; n < 999; n += sampleStep) {
      const c1 = `${gridPrefix}${String(e).padStart(3, '0')}${String(n).padStart(3, '0')}`;
      const c2 = `${gridPrefix}${String(e + 1).padStart(3, '0')}${String(n).padStart(3, '0')}`;
      const c3 = `${gridPrefix}${String(e).padStart(3, '0')}${String(n + 1).padStart(3, '0')}`;

      const b1 = bbox(c1);
      const b2 = bbox(c2);
      const b3 = bbox(c3);

      const ewGapDeg = Math.abs(b1[2] - b2[0]);
      const nsGapDeg = Math.abs(b1[3] - b3[1]);
      const lat = (b1[1] + b1[3]) / 2;
      const ewGapM = Math.abs(degToMetersLon(ewGapDeg, lat));
      const nsGapM = Math.abs(degToMetersLat(nsGapDeg));

      if (ewGapDeg > maxEastWestGapDeg) maxEastWestGapDeg = ewGapDeg;
      if (nsGapDeg > maxNorthSouthGapDeg) maxNorthSouthGapDeg = nsGapDeg;
      if (ewGapM > maxEastWestGapM) maxEastWestGapM = ewGapM;
      if (nsGapM > maxNorthSouthGapM) maxNorthSouthGapM = nsGapM;
    }
  }

  return {
    gridPrefix,
    maxEastWestGapDeg,
    maxNorthSouthGapDeg,
    maxEastWestGapM,
    maxNorthSouthGapM,
  };
}

function check100kmBoundaryConsistency(gridPrefix) {
  const sw = bbox(`${gridPrefix}000000`);
  const se = bbox(`${gridPrefix}999000`);
  const ne = bbox(`${gridPrefix}999999`);
  const nw = bbox(`${gridPrefix}000999`);

  return {
    gridPrefix,
    derived100km: {
      west: sw[0],
      south: sw[1],
      east: se[2],
      north: nw[3],
    },
    edge100m: {
      west: sw[0],
      south: sw[1],
      east: ne[2],
      north: ne[3],
    },
    eastMismatchDeg: Math.abs(se[2] - ne[2]),
    northMismatchDeg: Math.abs(nw[3] - ne[3]),
  };
}

function getCornerPointShared(gridPrefix, eMeter, nMeter) {
  const MAX_METER = 100000;
  const e = Math.min(eMeter, MAX_METER - 1);
  const n = Math.min(nMeter, MAX_METER - 1);
  const code = `${gridPrefix}${String(e).padStart(5, '0')}${String(n).padStart(5, '0')}`;
  const [west, south, east, north] = bbox(code);

  const useEast = eMeter === MAX_METER;
  const useNorth = nMeter === MAX_METER;
  return [useEast ? east : west, useNorth ? north : south];
}

function checkSharedCornerMethod(gridPrefix, sampleStep = 37) {
  let maxEastWestGapDeg = 0;
  let maxNorthSouthGapDeg = 0;
  const scale = 100;

  for (let e = 0; e < 1000 - 1; e += sampleStep) {
    for (let n = 0; n < 1000 - 1; n += sampleStep) {
      const e0 = e * scale;
      const e1 = (e + 1) * scale;
      const n0 = n * scale;
      const n1 = (n + 1) * scale;

      const cRightOfLeft = getCornerPointShared(gridPrefix, e1, n0);
      const cLeftOfRight = getCornerPointShared(gridPrefix, e1, n0);
      const cTopOfBottom = getCornerPointShared(gridPrefix, e0, n1);
      const cBottomOfTop = getCornerPointShared(gridPrefix, e0, n1);

      const ewGapDeg = Math.abs(cRightOfLeft[0] - cLeftOfRight[0]);
      const nsGapDeg = Math.abs(cTopOfBottom[1] - cBottomOfTop[1]);

      if (ewGapDeg > maxEastWestGapDeg) maxEastWestGapDeg = ewGapDeg;
      if (nsGapDeg > maxNorthSouthGapDeg) maxNorthSouthGapDeg = nsGapDeg;
    }
  }

  return {
    gridPrefix,
    maxEastWestGapDeg,
    maxNorthSouthGapDeg,
  };
}

function main() {
  const gapResults = GRID_PREFIXES.map((prefix) => checkAdjacentGaps(prefix));
  const boundaryResults = GRID_PREFIXES.map((prefix) => check100kmBoundaryConsistency(prefix));
  const sharedCornerResults = GRID_PREFIXES.map((prefix) => checkSharedCornerMethod(prefix));

  console.log('=== 100m Adjacent Cell Gap Check (bbox inverse-based) ===');
  gapResults.forEach((r) => {
    console.log(`\\n${r.gridPrefix}`);
    console.log(`  max east-west gap: ${r.maxEastWestGapDeg.toExponential(6)} deg (~${r.maxEastWestGapM.toFixed(4)} m)`);
    console.log(`  max north-south gap: ${r.maxNorthSouthGapDeg.toExponential(6)} deg (~${r.maxNorthSouthGapM.toFixed(4)} m)`);
  });

  console.log('\\n=== 100km Boundary Consistency (from 100m outer cells) ===');
  boundaryResults.forEach((r) => {
    console.log(`\\n${r.gridPrefix}`);
    console.log(`  east mismatch: ${r.eastMismatchDeg.toExponential(6)} deg`);
    console.log(`  north mismatch: ${r.northMismatchDeg.toExponential(6)} deg`);
  });

  console.log('\\n=== Shared-corner Method Continuity (current implementation) ===');
  sharedCornerResults.forEach((r) => {
    console.log(`\\n${r.gridPrefix}`);
    console.log(`  max east-west discontinuity: ${r.maxEastWestGapDeg.toExponential(6)} deg`);
    console.log(`  max north-south discontinuity: ${r.maxNorthSouthGapDeg.toExponential(6)} deg`);
  });
}

main();
