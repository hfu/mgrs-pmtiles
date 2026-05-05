import mgrs from 'mgrs';

const testPoints = [
  { name: 'Near 138°E (Zone boundary)', lon: 137.5, lat: 43 },
  { name: '144°E (Z54-Z55 boundary)', lon: 144.0, lat: 43 },
  { name: 'Western Hokkaido', lon: 141, lat: 43 },
  { name: 'Central Hokkaido', lon: 143, lat: 43 },
  { name: 'Eastern Hokkaido', lon: 147, lat: 43 },
  { name: '150°E limit', lon: 150.0, lat: 43 },
];

console.log('MGRS Zone boundary test:');
testPoints.forEach(pt => {
  const code = mgrs.forward([pt.lon, pt.lat]);  
  const zone = code.substring(0, 2);
  const prefix = code.substring(0, 5);
  console.log(`${pt.name}: ${pt.lon}°E → Zone ${zone}, Prefix: ${prefix}`);
});

// Find all unique zones in hokkaido bounds
console.log('\nScanning hokkaido bounds (139°E to 149.8°E):');
const zones = new Set();
for (let lon = 139; lon <= 149.8; lon += 0.5) {
  const code = mgrs.forward([lon, 43]);
  zones.add(code.substring(0, 2));
}
console.log('Zones found:', Array.from(zones).sort().join(', '));
