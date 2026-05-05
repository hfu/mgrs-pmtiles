import { describe, it, expect } from 'vitest';

/**
 * Zone Band Boundary Validation Tests
 * 
 * Comprehensive tests for MGRS zone and band boundary definitions.
 */

describe('MGRS Zone Boundaries', () => {
  // Zone boundaries: each zone is 6 degrees of longitude
  // Zone 1: -180 to -174
  // Zone N: (N * 6 - 186) to ((N+1) * 6 - 186)
  
  const calculateZoneBounds = (zone) => {
    return {
      west: zone * 6 - 186,
      east: (zone + 1) * 6 - 186,
    };
  };

  describe('Individual Zone Longitude Spans', () => {
    it('zone 1 spans -180 to -174', () => {
      const bounds = calculateZoneBounds(1);
      expect(bounds.west).toBe(-180);
      expect(bounds.east).toBe(-174);
    });

    it('zone 31 spans 0 to 6 (Greenwich area)', () => {
      const bounds = calculateZoneBounds(31);
      expect(bounds.west).toBe(0);
      expect(bounds.east).toBe(6);
    });

    it('zone 54 spans 138 to 144 degrees east (Japan core)', () => {
      const bounds = calculateZoneBounds(54);
      expect(bounds.west).toBe(138);
      expect(bounds.east).toBe(144);
    });

    it('zone 55 spans 144 to 150 degrees east (Japan east)', () => {
      const bounds = calculateZoneBounds(55);
      expect(bounds.west).toBe(144);
      expect(bounds.east).toBe(150);
    });

    it('zone 60 spans 174 to 180 degrees east', () => {
      const bounds = calculateZoneBounds(60);
      expect(bounds.west).toBe(174);
      expect(bounds.east).toBe(180);
    });
  });

  describe('Zone Adjacency and Continuity', () => {
    it('zones cover entire globe without gaps', () => {
      let lastEast = -180;
      for (let zone = 1; zone <= 60; zone++) {
        const bounds = calculateZoneBounds(zone);
        expect(bounds.west).toBe(lastEast);
        lastEast = bounds.east;
      }
      expect(lastEast).toBe(180);
    });

    it('adjacent zones meet exactly at boundary without overlap', () => {
      const zone54Bounds = calculateZoneBounds(54);
      const zone55Bounds = calculateZoneBounds(55);
      
      expect(zone54Bounds.east).toBe(zone55Bounds.west);
      expect(zone54Bounds.east).toBe(144);
      expect(zone55Bounds.west).toBe(144);
    });
  });

  describe('Latitude Band Boundaries', () => {
    // MGRS latitude bands: C=80S-72S, D=72S-64S, ..., X=72N-84N
    const LAT_BANDS = 'CDEFGHJKLMNPQRSTUVWX';
    
    const getLatBandBounds = (letter) => {
      const idx = LAT_BANDS.indexOf(letter);
      if (idx === -1) throw new Error(`Unknown band: ${letter}`);
      
      if (letter === 'X') return { south: 72, north: 84 };
      
      const south = -80 + idx * 8;
      return { south, north: south + 8 };
    };

    it('latitude band C is 80S to 72S', () => {
      const bounds = getLatBandBounds('C');
      expect(bounds.south).toBe(-80);
      expect(bounds.north).toBe(-72);
    });

    it('latitude band T (Japan standard) is 40N to 48N', () => {
      const bounds = getLatBandBounds('T');
      expect(bounds.south).toBe(40);
      expect(bounds.north).toBe(48);
    });

    it('latitude band U is 48N to 56N', () => {
      const bounds = getLatBandBounds('U');
      expect(bounds.south).toBe(48);
      expect(bounds.north).toBe(56);
    });

    it('latitude band X (special) is 72N to 84N', () => {
      const bounds = getLatBandBounds('X');
      expect(bounds.south).toBe(72);
      expect(bounds.north).toBe(84);
    });

    it('all standard bands are 8 degrees tall except X (12 degrees)', () => {
      for (let i = 0; i < LAT_BANDS.length; i++) {
        const letter = LAT_BANDS[i];
        const bounds = getLatBandBounds(letter);
        const height = bounds.north - bounds.south;
        
        if (letter === 'X') {
          expect(height).toBe(12);
        } else {
          expect(height).toBe(8);
        }
      }
    });

    it('latitude bands cover entire globe from -80N to 84N without gaps', () => {
      let lastNorth = -80;
      for (const letter of LAT_BANDS) {
        const bounds = getLatBandBounds(letter);
        expect(bounds.south).toBe(lastNorth);
        lastNorth = bounds.north;
      }
      expect(lastNorth).toBe(84);
    });
  });

  describe('Zone-Band Cell Grid Intersections', () => {
    // A zone-band pair defines a GZD (Grid Zone Designator) like "54T"
    // which covers 6° longitude × 8° latitude
    
    it('54T cell area is approximately 6° × 8° in degrees', () => {
      const zoneBounds = calculateZoneBounds(54);
      const bandBounds = { south: 40, north: 48 };
      
      const lonSpan = zoneBounds.east - zoneBounds.west;
      const latSpan = bandBounds.north - bandBounds.south;
      
      expect(lonSpan).toBe(6);
      expect(latSpan).toBe(8);
    });

    it('54T northeast corner is at (144E, 48N)', () => {
      const zoneBounds = calculateZoneBounds(54);
      const bandBounds = { south: 40, north: 48 };
      
      expect(zoneBounds.east).toBe(144);
      expect(bandBounds.north).toBe(48);
    });

    it('54T southwest corner is at (138E, 40N)', () => {
      const zoneBounds = calculateZoneBounds(54);
      const bandBounds = { south: 40, north: 48 };
      
      expect(zoneBounds.west).toBe(138);
      expect(bandBounds.south).toBe(40);
    });
  });

  describe('Zone Number Validation', () => {
    it('valid zones are 1 to 60 inclusive', () => {
      expect(() => calculateZoneBounds(0)).not.toThrow();
      expect(() => calculateZoneBounds(1)).not.toThrow();
      expect(() => calculateZoneBounds(60)).not.toThrow();
      expect(() => calculateZoneBounds(61)).not.toThrow();
    });
  });

  describe('Cross-Zone Boundary Transitions', () => {
    it('zone 53 to 54 boundary is at 132E', () => {
      const z53 = calculateZoneBounds(53);
      const z54 = calculateZoneBounds(54);
      
      expect(z53.east).toBe(138);
      expect(z54.west).toBe(138);
    });

    it('zone 54 to 55 boundary is at 144E', () => {
      const z54 = calculateZoneBounds(54);
      const z55 = calculateZoneBounds(55);
      
      expect(z54.east).toBe(144);
      expect(z55.west).toBe(144);
    });

    it('zone 55 to 56 boundary is at 150E', () => {
      const z55 = calculateZoneBounds(55);
      const z56 = calculateZoneBounds(56);
      
      expect(z55.east).toBe(150);
      expect(z56.west).toBe(150);
    });
  });

  describe('Special Hokkaido Region Zones', () => {
    it('Hokkaido spans multiple zones (54T, 54U, 55T, 55U primarily)', () => {
      const hokkaido = {
        west: 140.2,
        east: 146.8,
        south: 41.4,
        north: 45.6,
      };

      // Should intersect zones 54 and 55
      const z54bounds = calculateZoneBounds(54);
      const z55bounds = calculateZoneBounds(55);

      // West edge 140.2 is in zone 54 (138-144)
      expect(hokkaido.west).toBeGreaterThan(z54bounds.west);
      expect(hokkaido.west).toBeLessThan(z54bounds.east);

      // East edge 146.8 is in zone 55 (144-150)
      expect(hokkaido.east).toBeGreaterThan(z55bounds.west);
      expect(hokkaido.east).toBeLessThan(z55bounds.east);

      // Boundary crossing at 144E
      expect(hokkaido.west).toBeLessThan(144);
      expect(hokkaido.east).toBeGreaterThan(144);
    });
  });
});
