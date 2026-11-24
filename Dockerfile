# Single image: the PWA is built, embedded into the Go binary, and served on :8080.
# Data (SQLite files, media) lives in /var/lib/newanki — mount a volume there.

FROM node:24-bookworm-slim AS web
RUN npm install -g pnpm@12.6.0
WORKDIR /src/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:1.26-bookworm AS server
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=web /src/web/dist/ ./internal/web/dist/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/newanki ./cmd/newanki

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /var/lib/newanki newanki \
    && mkdir -p /var/lib/newanki && chown newanki:newanki /var/lib/newanki
COPY --from=server /out/newanki /usr/local/bin/newanki
USER newanki
VOLUME /var/lib/newanki
EXPOSE 8080
ENTRYPOINT ["newanki", "serve", "-data", "/var/lib/newanki", "-addr", ":8080", "-trust-proxy"]
