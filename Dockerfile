# Proof of Dev — portable dev environment.
# This embeds Node.js + every dependency (including a correctly-compiled
# native `zeromq` binding) inside the image, so it behaves the same on
# Linux, macOS, and Windows hosts — no local Node install required.

FROM node:20-bookworm-slim

# Build tools needed for zeromq's native binding fallback (cmake/python3/g++),
# in case a prebuilt binary isn't available for the image's platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    cmake \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching) using the committed lockfile,
# so installs are reproducible instead of drifting.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/analysis/package.json services/analysis/package.json
COPY packages/chain-data-spec/package.json packages/chain-data-spec/package.json
COPY packages/scoring-spec/package.json packages/scoring-spec/package.json

RUN npm ci

# Now copy the rest of the source.
COPY . .

# Note: services/indexer is a separate Rust/Cargo service (not part of this
# npm image). Build/run it separately with `cargo build --release` if needed;
# it isn't required for `npm run dev` (API + worker + Next.js).

EXPOSE 3000 8000

CMD ["npm", "run", "dev"]
