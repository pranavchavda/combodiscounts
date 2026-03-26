#!/bin/bash
set -e

EXTENSION_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$EXTENSION_DIR/../.." && pwd)"
ESBUILD="$PROJECT_ROOT/node_modules/.bin/esbuild"
JAVY="/home/pranav/.npm-global/lib/node_modules/@shopify/cli/bin/javy-7.0.1"

mkdir -p "$EXTENSION_DIR/dist"

# Step 1: Bundle TypeScript to JS with esbuild
"$ESBUILD" "$EXTENSION_DIR/src/index.ts" \
  --bundle \
  --outfile="$EXTENSION_DIR/dist/function.js" \
  --format=esm \
  --target=es2022 \
  --platform=neutral \
  --external:javy/* \
  2>&1

# Step 2: Compile JS to WASM with javy
PLUGIN="/home/pranav/.npm-global/lib/node_modules/@shopify/cli/bin/shopify_functions_javy_v3.wasm"

"$JAVY" build "$EXTENSION_DIR/dist/function.js" \
  -C dynamic \
  -C plugin="$PLUGIN" \
  -C source=omitted \
  -o "$EXTENSION_DIR/dist/function.wasm" \
  2>&1

echo "Build complete: $(ls -lh "$EXTENSION_DIR/dist/function.wasm" | awk '{print $5}')"
