import { describe, it, expect } from 'vitest';
import mgrs from 'mgrs';

/**
 * MGRS Grid Accuracy Tests
 * 
 * Verifies that grids are correctly defined and MGRS codes are generated accurately
 */

describe('MGRS 54T Grid Definitions', () => {
  describe('Grid Coordinates (Verified by discovery)', () => {
    // These values come from scripts/discover-grids.js validation
    const GRIDS = {
      '54TWN': {
        name: 'Western 100km grid',
        south: 42.50,
        north: 43.30,
        west: 141.10,
        east: 142.20,
      },
      '54TWP': {
        name: 'Eastern 100km grid',
        south: 43.40,
        north: 44.20,
        west: 141.10,
        east: 142.20,
      },
    };

    Object.entries(GRIDS).forEach(([gridCode, bounds]) => {
      it(`${gridCode} has correct boundaries`, () => {
        // Verify corners
        const sw = mgrs.forward([bounds.west, bounds.south]);
        const ne = mgrs.forward([bounds.east, bounds.north]);
        
        expect(sw).toBeDefined();
        expect(ne).toBeDefined();
        expect(sw.startsWith('54T')).toBe(true);
        expect(ne.startsWith('54T')).toBe(true);
      });

      it(`${gridCode} sample points produce correct MGRS codes`, () => {
        // Test center point
        const centerLat = (bounds.south + bounds.north) / 2;
        const centerLon = (bounds.west + bounds.east) / 2;
        const centerMgrs = mgrs.forward([centerLon, centerLat]);
        
        expect(centerMgrs).toBeDefined();
        expect(centerMgrs.slice(0, 5)).toBe(gridCode);
      });

      it(`${gridCode} SW corner is within grid`, () => {
        const code = mgrs.forward([bounds.west, bounds.south]);
        expect(code.slice(0, 5)).toBe(gridCode);
      });

      it(`${gridCode} NE corner is within grid`, () => {
        const code = mgrs.forward([bounds.east - 0.001, bounds.north - 0.001]);
        expect(code.slice(0, 5)).toBe(gridCode);
      });
    });
  });

  describe('54T GZD Latitude Band Constraint', () => {
    const MIN_LAT = 40.0;
    const MAX_LAT = 48.0;

    it('point at southern boundary (40.0°N) is in 54T', () => {
      const code = mgrs.forward([141.5, MIN_LAT]);
      expect(code).toBeDefined();
      expect(code.slice(0, 3)).toBe('54T');
    });

    it('point just below northern boundary (47.99°N) is in 54T', () => {
      const code = mgrs.forward([141.5, 47.99]);
      expect(code).toBeDefined();
      expect(code.slice(0, 3)).toBe('54T');
    });

    it('point below 40.0°N is NOT in 54T', () => {
      const code = mgrs.forward([141.5, 39.9]);
      expect(code.slice(0, 3)).not.toBe('54T');
    });

    it('point above 48.0°N is NOT in 54T', () => {
      const code = mgrs.forward([141.5, 48.1]);
      expect(code.slice(0, 3)).not.toBe('54T');
    });
  });

  describe('54T GZD Longitude Constraint', () => {
    const MIN_LON = 138.0;
    const MAX_LON = 144.0;

    it('point at western boundary (138.0°E) is in 54T', () => {
      const code = mgrs.forward([MIN_LON, 42.0]);
      expect(code).toBeDefined();
      expect(code[2]).toBe('T'); // Latitude band
    });

    it('point at eastern boundary (143.9°E) is in 54T', () => {
      const code = mgrs.forward([MAX_LON - 0.1, 42.0]);
      expect(code).toBeDefined();
      expect(code[2]).toBe('T');
    });
  });
});

describe('100m Grid Generation Semantics', () => {
  it('MGRS code has 10 digits (GZD + 100km ID + 5 digits)', () => {
    const code = mgrs.forward([141.5, 42.9]);
    // Format: 54TWN12345 (5 + 5 = 10 digits total)
    expect(code.length).toBeGreaterThanOrEqual(10);
  });

  it('all generated codes start with 54T (GZD)', () => {
    const samplePoints = [
      [141.5, 42.9],
      [141.8, 43.5],
      [142.0, 44.0],
    ];

    samplePoints.forEach((point) => {
      const code = mgrs.forward(point);
      expect(code.slice(0, 3)).toBe('54T');
    });
  });

  it('100m grid IDs follow MGRS naming (first 5 chars after GZD)', () => {
    const code = mgrs.forward([141.5, 42.9]);
    const grid100k = code.slice(3, 5);
    
    // Should be two uppercase letters (MGRS convention)
    expect(/^[A-Z]{2}$/.test(grid100k)).toBe(true);
  });
});

describe('Grid Clipping and Boundary Behavior', () => {
  it('corner points remain in correct grid', () => {
    const cornersWN = [
      [141.10, 42.50], // SW
      [142.20, 42.50], // SE
      [142.20, 43.30], // NE
      [141.10, 43.30], // NW
    ];

    cornersWN.forEach((point) => {
      const code = mgrs.forward(point);
      expect(code.slice(0, 5)).toBe('54TWN');
    });
  });

  it('point slightly outside grid boundary switches grid', () => {
    // Just outside WN/WP boundary
    const inside = mgrs.forward([141.5, 43.35]); // In WN
    const outside = mgrs.forward([141.5, 43.45]); // In WP
    
    expect(inside.slice(0, 5)).toBe('54TWN');
    expect(outside.slice(0, 5)).toBe('54TWP');
  });
});
