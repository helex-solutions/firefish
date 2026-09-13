---
sidebarTitle: Architecture map
---

# Firefish — architecture map

How the FSH compiler service is put together, what its routes accept and return, and who calls it
through which path. The usage examples are in the module
[README](https://github.com/helex-solutions/tx/blob/main/modules/firefish/README.md) and are not
repeated here.

## Process layout

| File | Role |
|---|---|
| `index.js` | The entry point. It reads `PORT` (parsed as an integer, default `3000`) and calls `createApp().listen(port)`. |
| `app.js` | `createApp()` builds the Express app without listening, so tests can bind it to an ephemeral port. In order: `express.json` for `application/json` and `application/fhir+json`, `express.text` for `application/fsh` (both with a `1000mb` limit), `cors()` with no restrictions, `express.static('public')`, `GET /health`, then the SUSHI and GoFSH routers. |
| `routes/sushi.js` | `POST /:release/sushi` over `sushiClient.fshToFhir` from `fsh-sushi` |
| `routes/gofsh.js` | `POST /:release/gofsh` over `gofshClient.fhirToFsh` from `gofsh` |
| `lib/releases.js` | Maps the release path segment to a `fhirVersion` |
| `lib/header-utils.js` | Parses compiler options out of the `Content-Type` parameters |
| `lib/utils.js` | `fail(res, err)`: answers 500 with the compiler result or error as the body |
| `public/index.html` | A static page describing the API, served at `/` |

There is no state, no cache and no authentication. Any origin may call it.

## Routes

| Method | Path | Request body | Success | Failure |
|---|---|---|---|---|
| `GET` | `/health` | — | `{"status":"UP","service":"firefish","version":<package.json version>}` | — |
| `POST` | `/r4/sushi`, `/r5/sushi` | raw FSH, `Content-Type: application/fsh[; k=v…]` | 200 `application/json`: the SUSHI result object, whose `fhir` array holds the compiled resources (TEDY also reads `errors` and `warnings`) | 500 with the SUSHI result as the body when it reports `errors`, or 500 with the thrown error |
| `POST` | `/r4/gofsh`, `/r5/gofsh` | one FHIR resource or an array of them, `Content-Type: application/fhir+json[; k=v…]` | 200 `application/fsh`: the FSH text (`results.fsh`) | 500 with the GoFSH result as the body when it reports `errors`, or 500 with the thrown error |
| `POST` | any other `/:release/{sushi,gofsh}` | — | — | 404 `{"errors":[{"message":"Unknown FHIR release '…' (expected r4 or r5)"}]}`, returned before any compiler runs |

**A compile error is a 500, not a 4xx.** The status alone cannot tell "service down" apart from "the
FSH has an error on line 3", so callers read the body in both cases. `FirefishClient` in TEDY and
`FshCompiler` in Beagle parse it and report SUSHI's `errors`, with line numbers where SUSHI gives
them.

The routes the reference editor's compiler service exposed (`/fsh2fhir`, `/fhir2fsh` and their `/v2/`
forms) are gone and answer 404. `test/routes.test.js` checks this. The old `CHEF_URL` value
cannot be carried over to `TX_FIREFISH_TARGET`
([TEDY.18](../../specs/tedy/TEDY.18-configuration.md)).

## Release selection

The release comes **from the path** and never from an option. `lib/releases.js` defines
`RELEASES = { r4: '4.3.0', r5: '5.0.0' }`. `r4` means R4B, the version the suite standardised on.
`fhirVersionFor()` ignores case and returns `undefined` for anything else, which the routes turn
into the 404 above.

- **SUSHI.** `fhirVersion` is merged into the options **last**, after both header and query options,
  so a caller cannot override the release.
- **GoFSH.** GoFSH has no version option. Instead the route appends a marker `ImplementationGuide`
  (`id: firefish-release-marker`, `fhirVersion: [<version>]`) to the input array to pin the release.
  Callers used to append this marker themselves, and now must not. The TEDY frontend client's
  comment says so.

## Options

Options come from two places and are merged as `{ ...header, ...query }`, so **the query string
wins**:

- **`Content-Type` parameters.** `lib/header-utils.js` strips the media type (`application/fsh;?` or
  `application/fhir+json;?`) and parses the remaining semicolon-separated `name=value` pairs with
  `hthvParseSemiSep` from `http-header-value`. That package is ESM, so it is loaded once through a
  dynamic `import()`. A missing `Content-Type` yields no options.
- **Query parameters.** This is the portable channel for values that are not valid header tokens,
  such as a `canonical` URL containing `:` and `/`.

Both channels deliver strings (`indent=true` arrives as `'true'`). The options each compiler
accepts are listed in the module README: SUSHI takes `canonical`, `version`, `logLevel` and
`snapshot`, and GoFSH takes `logLevel`, `indent` and `style`.

## Dependencies

From `package.json`, with the version `package-lock.json` resolves in brackets:

| Package | Range | Locked | Used for |
|---|---|---|---|
| `fsh-sushi` | `^3.18.1` | 3.20.0 | FSH → FHIR |
| `gofsh` | `^2.6.1` | 2.6.1 | FHIR → FSH |
| `express` | `^4.22.1` | 4.22.2 | HTTP |
| `cors` | `^2.8.6` | — | open CORS |
| `http-header-value` | `^4.0.0` | — | `Content-Type` parameter parsing |

The standalone image and CI both use Node 22. The module README notes that SUSHI and GoFSH resolve
FHIR packages from a registry, which `FPL_REGISTRY` overrides, and the end-to-end test notes that
the first run downloads them.

## Configuration

| Variable | Where | Default | Meaning |
|---|---|---|---|
| `PORT` | Firefish | `3000` | Listen port |
| `FPL_REGISTRY` | Firefish (read by the FHIR package loader, per the module README) | — | FHIR package registry override |
| `TX_NODE_SERVICES` | `tx` image | `firefish:18660` | Starts Firefish in the container. Empty means no local process. |
| `FIREFISH_SERVER_URL` | `tx` image | `http://127.0.0.1:18660` | Upstream of `/firefish/`. Empty leaves `/firefish/` unserved. |
| `TX_FIREFISH_TARGET` | any image with the TEDY SPA | `/firefish` on `tx`, otherwise unset | Browser-side base, rendered into `shell/config.js`. Unset disables the SPA's Firefish calls. |
| `TX_FIREFISH_PORT` | `docker/compose.yaml` | `18660` | Host port for the standalone container's `3000` |
| `TEDY_FIREFISH_URL` (`tedy.firefish.url`) | tedy-server | unset | Server-side base. Unset disables FSH import and the FSH-compiled StructureDefinition read. |
| `tedy.firefish.connect-timeout` / `request-timeout` | tedy-server | `10s` / `120s` | Bounds on the TEDY call |
| `BEAGLE_FIREFISH_URL` (`beagle.firefish.url`) | Beagle | unset | Unset means lexical FSH scanning only |
| `beagle.firefish.release` / `request-timeout` | Beagle | `r4` / `120s` | Release path and response bound for the Beagle call |

## Callers and proxy paths

| Caller | Code | Path taken | Calls |
|---|---|---|---|
| TEDY SPA, in the browser | `modules/tedy/frontend/src/integration/firefishClient.ts`, base from `TX_FIREFISH_TARGET` (`config/tx.ts`) | same-origin `/firefish/…` on `tx`, otherwise whatever absolute URL is configured (CORS) | `fshToFhir` (`POST /{release}/sushi`, options as `Content-Type` params) and `fhirToFsh` (`POST /{release}/gofsh`), both defaulting to `r5` |
| TEDY file import | `tedy/fhir/FirefishClient`, called by `fileimport/ResourceFileImport` | direct to `TEDY_FIREFISH_URL` (unset by default, including on `tx`; the in-container service is `http://localhost:18660`) | `POST /r5/sushi`. The first resource produced is imported through `TedyFhirResourceImporter` ([TEDY.17](../../specs/tedy/TEDY.17-file-import.md)). |
| TEDY StructureDefinition read | `StructureDefinitionService.loadFhir` through `fhir/FshCompileCache`, serving `GET /structure-definitions/{id}/fhir` | direct to `TEDY_FIREFISH_URL` | `POST /r5/sushi?snapshot=true`. Results are cached by a hash of the source, release and snapshot flag (32 entries, single-flight, failures not cached). The endpoint exists so readers such as Owliki's `{{def:}}` macro need no Firefish integration of their own. |
| Beagle GitHub ingest | `beagle/ingest/github/FshCompiler` | direct to `BEAGLE_FIREFISH_URL` | `POST /{beagle.firefish.release}/sushi` with the repository's FSH files concatenated into one document ([BEAGLE.03.4](../../specs/beagle/BEAGLE.03.4-github-precedent.md)) |
| EMR | outside this repository | the standalone `firefish` image | per `docker/README.md` and `build-firefish.yml`, the EMR tx-backend's `TX_FIREFISH_BASE_URL`. The module README also names the EMR FSH editor. |

In the browser, TEDY uses Firefish in two places:
- the resource version export (`integration/resourceExport.ts`: JSON, FSH R4, FSH R5)
- the StructureDefinition tabs (Elements, JSON, FSH, UML, and the viewer)

The Service API page lists the configured base. Server-side, TEDY only ever calls SUSHI.
[TEDY.07](../../specs/tedy/TEDY.07-spaces.md) records that `FirefishClient` converts only *to* FHIR.

**The `/firefish/` location.** The entrypoint renders it into `/etc/nginx/firefish-proxy.conf`,
which `docker/nginx/tx.conf.template` includes. For a loopback upstream it is the literal form,
`proxy_pass <upstream>/`, where the trailing slash strips the prefix. For any other host, when
resolvers are available, the upstream is resolved per request with an explicit
`rewrite ^/firefish/(.*)$ /$1`, because a variable `proxy_pass` does not strip the prefix. Both
forms set `proxy_read_timeout 600s`, since compiling a module's FSH can take a while.

## Tests

`npm test` runs `node --test` over `test/`:

| File | Covers |
|---|---|
| `releases.test.js` | `r4` → 4.3.0, `r5` → 5.0.0, case-insensitive lookup, unknown or empty releases give `undefined`, and only `r4`/`r5` exist |
| `header-utils.test.js` | Options parsed from `application/fsh` and `application/fhir+json` parameters, a bare media type, and a missing header |
| `routes.test.js` | `/health`, an unknown release returning 404 before any compiler runs, and the removed `/fsh2fhir`, `/v2/fsh2fhir`, `/fhir2fsh`, `/v2/fhir2fsh` routes returning 404 |
| `conversion.e2e.test.js` | A real SUSHI and GoFSH round trip: R5 and R4 `fhirVersion`, a query-string `canonical` reaching SUSHI, and GoFSH output. Skipped unless `FIREFISH_E2E=1`. |

CI: `quality.yml`'s **Tests (Firefish)** job runs `npm ci && npm test` on Node 22 when
`modules/firefish` changes, with the end-to-end test off
([Test enforcement](../../development/test-enforcement.md)).

## Reading map

| Topic | Document |
|---|---|
| Endpoints, options, quick start, Docker | [`modules/firefish/README.md`](https://github.com/helex-solutions/tx/blob/main/modules/firefish/README.md) |
| `PORT`, and TEDY's FSH import settings | [Deployment §5 and "FSH import (Firefish)"](../../manuals/deployment.md) |
| Image roles, `TX_FIREFISH_TARGET`, workflows | [`docker/README.md`](https://github.com/helex-solutions/tx/blob/main/docker/README.md) |
| FSH as a resource import format | [TEDY.17 — File import](../../specs/tedy/TEDY.17-file-import.md), [TEDY file import](../tedy/06-file-import.md) |
| The configuration variable and the retired `CHEF_URL` | [TEDY.18 — Configuration](../../specs/tedy/TEDY.18-configuration.md) |
| FSH compilation in Beagle's GitHub ingest | [BEAGLE.03.4 — GitHub precedent](../../specs/beagle/BEAGLE.03.4-github-precedent.md) |
| `sd:` references rendered via Firefish in the wiki | [OWLIKI.04 — References](../../specs/owliki/OWLIKI.04-references.md) |
| Why Firefish ships as a carrier bundle and a runnable image | [CI build architecture](../../development/ci-build-architecture-plan.md) |
