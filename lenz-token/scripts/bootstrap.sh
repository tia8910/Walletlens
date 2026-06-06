#!/usr/bin/env bash
# Clone the AUDITED SNIP-20 reference implementation at a pinned tag and compile a
# reproducible, optimized wasm artifact. We do not modify the contract source — only
# build it. $LENZ is configured purely through the instantiate message.
#
#   https://github.com/scrt-labs/snip20-reference-impl
set -euo pipefail
cd "$(dirname "$0")/.."

# Pin the reference implementation. Verify this tag exists and is the latest AUDITED
# release before mainnet: https://github.com/scrt-labs/snip20-reference-impl/releases
REF_REPO="https://github.com/scrt-labs/snip20-reference-impl.git"
REF_TAG="${REF_TAG:-v1.0.0}"

REF_DIR=".refimpl"
ARTIFACT_DIR="artifact"
mkdir -p "$ARTIFACT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required for the reproducible optimizer build." >&2
  exit 1
fi

if [ ! -d "$REF_DIR/.git" ]; then
  echo "==> Cloning $REF_REPO @ $REF_TAG"
  git clone --depth 1 --branch "$REF_TAG" "$REF_REPO" "$REF_DIR"
else
  echo "==> $REF_DIR already present; fetching $REF_TAG"
  git -C "$REF_DIR" fetch --depth 1 origin "refs/tags/$REF_TAG:refs/tags/$REF_TAG" || true
  git -C "$REF_DIR" checkout "$REF_TAG"
fi

echo "==> Building optimized, reproducible wasm (this uses Docker; first run is slow)"
( cd "$REF_DIR" && make compile-optimized-reproducible )

# The Makefile emits a gzipped wasm; locate it regardless of exact filename.
PRODUCED="$(find "$REF_DIR" -maxdepth 2 -name '*.wasm.gz' -newermt '-10 minutes' | head -n1 || true)"
if [ -z "$PRODUCED" ]; then
  PRODUCED="$(find "$REF_DIR" -maxdepth 2 -name '*.wasm.gz' | head -n1 || true)"
fi
if [ -z "$PRODUCED" ]; then
  echo "ERROR: could not find a produced *.wasm.gz under $REF_DIR" >&2
  exit 1
fi

cp "$PRODUCED" "$ARTIFACT_DIR/contract.wasm.gz"
echo
echo "==> Artifact ready: $ARTIFACT_DIR/contract.wasm.gz"
echo "    sha256: $(sha256sum "$ARTIFACT_DIR/contract.wasm.gz" | awk '{print $1}')"
echo "    Record this checksum so deployers can verify the same audited build."
