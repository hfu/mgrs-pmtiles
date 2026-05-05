#!/usr/bin/env node

/**
 * MGRS Grid Discovery Utility
 * 
 * Uses mgrs library to discover grid boundaries and validate 54T GZD structure
 */

import mgrs from 'mgrs';

// 54T GZD reference points
const GZD_BOUNDS = {
  north: 48.0,
  south: 40.0,
  east: 144.0,
  west: 138.0,
};

/**
 * Sample a grid at regular intervals to find 100km grid boundaries
 */
function discoverGridBoundaries() {
  const samples = [];
  const step = 0.1; // 0.1 degree samples

  for (let lat = GZD_BOUNDS.south; lat <= GZD_BOUNDS.north; lat += step) {
    for (let lon = GZD_BOUNDS.west; lon < GZD_BOUNDS.east; lon += step) {
      try {
        const mgrsCode = mgrs.forward([lon, lat]);
        samples.push({
          lat,
          lon,
          mgrs: mgrsCode,
          grid100k: mgrsCode.slice(3, 5), // Extract 100km ID (e.g., "WN")
          gridFull: mgrsCode.slice(0, 5), // Full 100km code (e.g., "54TWN")
        });
      } catch (e) {
        // Ignore invalid points
      }
    }
  }

  return samples;
}

/**
 * Analyze samples to find grid boundaries
 */
function analyzeGrids(samples) {
  const gridsByName = {};

  samples.forEach((sample) => {
    const name = sample.gridFull;
    if (!gridsByName[name]) {
      gridsByName[name] = {
        minLat: sample.lat,
        maxLat: sample.lat,
        minLon: sample.lon,
        maxLon: sample.lon,
        count: 0,
      };
    }

    const grid = gridsByName[name];
    grid.minLat = Math.min(grid.minLat, sample.lat);
    grid.maxLat = Math.max(grid.maxLat, sample.lat);
    grid.minLon = Math.min(grid.minLon, sample.lon);
    grid.maxLon = Math.max(grid.maxLon, sample.lon);
    grid.count++;
  });

  return gridsByName;
}

/**
 * Main
 */
function main() {
  console.log('Discovering MGRS grid boundaries in 54T GZD...');
  console.log(`Sampling region: ${GZD_BOUNDS.west}°E-${GZD_BOUNDS.east}°E, ${GZD_BOUNDS.south}°N-${GZD_BOUNDS.north}°N`);
  console.log();

  const samples = discoverGridBoundaries();
  const grids = analyzeGrids(samples);

  console.log(`Found ${Object.keys(grids).length} unique 100km grids:\n`);

  Object.entries(grids)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, bounds]) => {
      console.log(`${name}:`);
      console.log(`  Latitude:  ${bounds.minLat.toFixed(2)}°N - ${bounds.maxLat.toFixed(2)}°N`);
      console.log(`  Longitude: ${bounds.minLon.toFixed(2)}°E - ${bounds.maxLon.toFixed(2)}°E`);
      console.log(`  Samples: ${bounds.count}`);
      console.log();
    });

  // Check clipping
  console.log('Clipping validation (54T strict bounds):');
  console.log(`  Latitude: 40.0°N - 48.0°N`);
  console.log(`  Longitude: 138.0°E - 144.0°E`);
  console.log();

  const clippedCount = samples.filter(
    (s) => s.lat >= GZD_BOUNDS.south && s.lat <= GZD_BOUNDS.north && 
            s.lon >= GZD_BOUNDS.west && s.lon < GZD_BOUNDS.east
  ).length;
  
  console.log(`  Valid samples within bounds: ${clippedCount}/${samples.length}`);
}

main();
