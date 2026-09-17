---
sidebarTitle: Firefish
---

# Firefish (`tx-firefish`) — FSH ⇄ FHIR compiler service 🐟🔥

**Firefish** is a small Express service that exposes the two FHIR Shorthand compilers over HTTP.
[SUSHI](https://fshschool.org/docs/sushi/) turns FSH into FHIR, and
[GoFSH](https://fshschool.org/docs/gofsh/) turns FHIR back into FSH. With Firefish, the suite's
authoring tools can compile FSH without a Node toolchain of their own. The FHIR release is chosen by
the path (`/r4/…` for R4B 4.3.0, `/r5/…` for R5 5.0.0). The source is the raw request body, and any
other compiler options are sent as `Content-Type` parameters or in the query string.

Module: `modules/firefish` (npm package `@helex/firefish`, private, Apache-2.0), Node 22. It is
self-contained, with no `@helex/*` dependencies and no Java, so it builds and tests on its own. It
is stateless. The module's own README is the usage reference:
[`modules/firefish/README.md`](https://github.com/helex-solutions/tx-core/blob/main/modules/firefish/README.md).

## Images and port

| Image | What it is | Built by |
|---|---|---|
| `ghcr.io/helex-solutions/firefish` | The runnable service: `node:22-slim`, `npm ci --omit=dev`, `EXPOSE 3000`, `CMD node index.js` (`modules/firefish/Dockerfile`) | [`build-firefish.yml`](https://github.com/helex-solutions/tx-core/blob/main/.github/workflows/build-firefish.yml): on dispatch or a `v*` tag, native amd64 and arm64 builds. A tag with unchanged Firefish inputs retags the existing image instead of rebuilding. |
| `ghcr.io/helex-solutions/firefish-app` | A `FROM scratch` carrier holding the module tree (without `test/`) plus production `node_modules`. It is not a server. | [`publish-firefish-app.yml`](https://github.com/helex-solutions/tx-core/blob/main/.github/workflows/publish-firefish-app.yml), on push to `main`. `build-tx.yml` copies it into the suite image. |

The service listens on `PORT`, default `3000`. In the suite `tx` image it runs on `18660`. The
compose file publishes the standalone container on `${TX_FIREFISH_PORT:-18660}`.

## Inside `tx` versus standalone

- **Inside `tx`.** `docker/tx.Dockerfile` copies the bundle to `/app/firefish/` and sets
  `TX_NODE_SERVICES="firefish:18660"`. The entrypoint starts each listed service as
  `PORT=<port> node /app/<name>/index.js`, and like any other service process, if it exits the
  container stops. nginx serves it same-origin under **`/firefish/`**, which strips the prefix
  (`/firefish/r5/sushi` becomes `/r5/sushi`). The browser reaches it through
  `TX_FIREFISH_TARGET="/firefish"`, and the image HEALTHCHECK probes `/firefish/health` through the
  same proxy.
- **Shared instance.** The `/firefish/` upstream is `FIREFISH_SERVER_URL`, default
  `http://127.0.0.1:18660`. To have several suite containers on one host share a single Firefish,
  point it at that container (for example `http://firefish:3000`) and set `TX_NODE_SERVICES=""`.
- **Standalone.** Run the `firefish` image. `docker/compose.yaml` does this, with a Node
  `fetch('/health')` healthcheck. Backends then call it directly by URL (`TEDY_FIREFISH_URL`,
  `BEAGLE_FIREFISH_URL`). The EMR tx-backend also points `TX_FIREFISH_BASE_URL` at this image
  ([`docker/README.md`](https://github.com/helex-solutions/tx-core/blob/main/docker/README.md)).

Firefish is **optional** everywhere. With no Firefish configured, the TEDY SPA disables its FSH
export and StructureDefinition compile calls, TEDY's FSH file import reports that it is not
configured, and Beagle indexes a repository from its `.fsh` text alone.

## Run

```bash
cd modules/firefish
npm ci
npm start                          # :3000 (PORT overrides)
npm test                           # node --test; the SUSHI/GoFSH round-trip needs FIREFISH_E2E=1

curl -X POST http://localhost:3000/r5/sushi \
  -H 'Content-Type: application/fsh' \
  --data-binary $'Profile: MyPatient\nParent: Patient\n* name 1..1'
```

## In this section

| # | Document | Covers |
|---|---|---|
| 01 | [Architecture map](01-architecture-map.md) | Process layout, the routes and their request and response shapes, release selection, option parsing, dependency versions, configuration, callers and proxy paths, tests, and where to read further |
