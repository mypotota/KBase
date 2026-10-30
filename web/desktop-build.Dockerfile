FROM rust:1-slim-bookworm AS toolchain
RUN --mount=type=secret,id=ca,target=/tmp/kbase-ca.pem,mode=0444 \
    kbase_ca=/etc/ssl/certs/ca-certificates.crt; if [ -f /tmp/kbase-ca.pem ]; then kbase_ca=/tmp/kbase-ca.pem; fi; \
    sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get -o Acquire::https::CaInfo="$kbase_ca" update && \
    apt-get -o Acquire::https::CaInfo="$kbase_ca" install -y --no-install-recommends libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev patchelf build-essential ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY src-tauri/ ./src-tauri/
COPY dist/ ./dist/
RUN --mount=type=secret,id=ca,target=/tmp/kbase-ca.pem,mode=0444 \
    if [ -f /tmp/kbase-ca.pem ]; then export CARGO_HTTP_CAINFO=/tmp/kbase-ca.pem; fi; CARGO_BUILD_JOBS=3 cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --release
FROM scratch AS artifact
COPY --from=toolchain /app/src-tauri/target/release/kbase /kbase
