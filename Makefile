.PHONY: dev server web gen test build

# Run the Go API (dev mode, demo data) and the Vite dev server together. Open http://localhost:5174
dev:
	@trap 'kill 0' INT TERM; \
	(cd server && go run ./cmd/newanki serve -dev -data ../data -addr 127.0.0.1:8080) & \
	(cd web && pnpm dev) & \
	wait

server:
	cd server && go run ./cmd/newanki serve -dev -data ../data

web:
	cd web && pnpm dev

# Regenerate sqlc queries and the TypeScript API types (web/src/api/types.gen.ts).
gen:
	cd server && sqlc generate && $$(go env GOPATH)/bin/tygo generate

test:
	cd server && go vet ./... && go test ./...
	cd web && pnpm typecheck && pnpm test

# Single binary with the PWA embedded: bin/newanki
build:
	cd web && pnpm install --frozen-lockfile && pnpm build
	find server/internal/web/dist -mindepth 1 ! -name .gitkeep -delete
	cp -R web/dist/. server/internal/web/dist/
	cd server && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o ../bin/newanki ./cmd/newanki
