set shell := ["sh", "-cu"]

default:
  @just --list

help:
  @just --list

init:
  @mkdir -p src scripts data out
  @echo "Initialized project directories."

smoke-just:
  @echo "just is working on this machine."

test:
  @echo "Running MGRS grid tests..."
  @npm test

test-watch:
  @echo "Running tests in watch mode..."
  @npm run test:watch

precision-check:
  @echo "Checking MGRS inverse precision and boundary consistency..."
  @node scripts/check-precision.js

generate:
  @echo "Generating JSONL (GeoJSON Text Sequence) to stdout..."
  @node src/generate-grids.js

pmtiles:
  @echo "Generating PMTiles from MGRS grids..."
  @MGRS_STDOUT_BLOCKING=1 MGRS_TARGET=54t_core node src/generate-grids.js | tippecanoe --force --maximum-zoom=16 --no-feature-limit --no-tile-size-limit --extend-zooms-if-still-dropping -o out/mgrs_54T.pmtiles
  @echo "✓ Generated: out/mgrs_54T.pmtiles"

pmtiles-hokkaido:
  @echo "Generating PMTiles for full Hokkaido..."
  @MGRS_STDOUT_BLOCKING=1 MGRS_TARGET=hokkaido_all node src/generate-grids.js | tippecanoe --force --maximum-zoom=16 --no-feature-limit --no-tile-size-limit --extend-zooms-if-still-dropping -o out/mgrs_hokkaido.pmtiles
  @echo "✓ Generated: out/mgrs_hokkaido.pmtiles"

pmtiles-pipe-probe:
  @echo "Probing direct Unix pipe ingestion with RFC 8142 record separators..."
  @node src/generate-grids.js | node -e "const rl=require('readline').createInterface({input:process.stdin}); rl.on('line', line => process.stdout.write('\\x1e'+line+'\\n'));" | \
    tippecanoe --force --maximum-zoom=16 --no-feature-limit --no-tile-size-limit --extend-zooms-if-still-dropping -o out/mgrs_54T_pipe_probe.pmtiles
  @echo "✓ Generated: out/mgrs_54T_pipe_probe.pmtiles"



clean:
  @rm -f out/*.pmtiles
  @echo "Cleaned PMTiles files."
