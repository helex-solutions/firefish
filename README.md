# Firefish 🐟🔥

FSH ⇄ FHIR compiler service for the Helex terminology suite. A thin Express wrapper around
[SUSHI](https://fshschool.org/docs/sushi/) (FSH → FHIR) and [GoFSH](https://fshschool.org/docs/gofsh/)
(FHIR → FSH), exposed over HTTP so authoring tools (TEDY, the EMR FSH editor) can compile FSH without
a browser Node toolchain.

The FHIR release is chosen by the **path** (`/r4/…` = R4/4.0.1, `/r4b/…` = R4B/4.3.0, `/r5/…` = R5/5.0.0); the source is
the **raw request body**; any remaining compiler options ride on the `Content-Type` header.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/health` | Liveness probe → `{"status":"UP","service":"firefish", ...}` |
| `POST` | `/r4/sushi` · `/r4b/sushi` · `/r5/sushi` | FSH → FHIR JSON (body `application/fsh`) |
| `POST` | `/r4/gofsh` · `/r4b/gofsh` · `/r5/gofsh` | FHIR → FSH text (body `application/fhir+json`) |

Options may be given as `Content-Type` params **or** as query-string params (`?canonical=…`); query
wins. Query params are the portable channel for values that can't sit in a media-type param — e.g. a
`canonical` URL, whose `:` / `/` are not header tokens (which is why non-JS clients use them).

### SUSHI options
`canonical`, `version`, `logLevel` (`silly|debug|verbose|http|info|warn|error|silent`), `snapshot`
(boolean). The FHIR version comes from the path, not an option.

### GoFSH options (`Content-Type: application/fhir+json; k=v; …`)
`logLevel`, `indent` (boolean), `style` (`map|string`). Response is raw `application/fsh`.

### Context: definitions the caller holds

A profile may derive from, or name, a definition that is in no package Firefish can load: another
profile or an extension of the same project, or a dependency the caller holds and Firefish's package
cache does not (a deployment may have no way out to a package registry). The caller sends those
definitions with the compile, **with their snapshots**, and they are found before anything else:

```bash
# FSH → FHIR, with the parent sent along
curl -X POST http://localhost:3000/r5/sushi \
  -H 'Content-Type: application/json' \
  --data-binary '{"fsh": "Profile: Child\nParent: MyParent\n* birthDate 1..", "context": [ { "resourceType": "StructureDefinition", "name": "MyParent", "snapshot": { } } ]}'

# FHIR → FSH: the parent is named, and nothing is written for it
curl -X POST http://localhost:3000/r5/gofsh \
  -H 'Content-Type: application/fhir+json' \
  --data-binary '{"resources": [ { } ], "context": [ { } ]}'
```

`fsh` is one document or an array of documents. A plain JSON array body is still the documents of one
project, and a plain resource or array of resources is still what GoFSH decompiles. The context is
read, never compiled or decompiled, and it is that request's alone: it is laid over the shared
definitions as a view and never written into them, so the definitions stay warm and the next request
does not see it.

### What GoFSH is told a parent has

GoFSH writes no rule for a value the parent already has. SUSHI, for its part, does not let a profile
inherit a definition's maturity, standards status and a dozen more extensions (nor some on its
elements): it removes them from what it clones from the parent. A profile whose value equalled its
parent's therefore got no rule and came back without it. Firefish hands GoFSH each parent as SUSHI
will start from it, without those extensions, so the value becomes a rule. The two lists are SUSHI's
and it does not export them; `test/uninherited.test.js` holds the copies in `lib/compile.js` to
SUSHI's source.

## Warm FHIR definitions

The FHIR definitions a compile resolves against (`hl7.fhir.rX.core` plus SUSHI's automatic
dependencies: tools, terminology, extensions) are loaded **once per release** and then shared by every
compile (`lib/compile.js`). Before this change each request re-indexed them from the package cache: a
trivial profile took ~2.5 s on a laptop and ~15 s in the suite image. Now it takes tens of milliseconds
after the first compile of that release. Neither compiler writes to these definitions (compiled
resources go into a per-compile package, and the definitions are frozen), so one request's profiles are
never visible to another's. Compiles run one at a time, because SUSHI and GoFSH keep their
errors/warnings and log level in module globals.

A compile that brings its own dependency packages (a GoFSH input whose ImplementationGuide declares
`dependsOn`, or a `dependencies` option) still loads fresh definitions for that request.

| Env | Default | Effect |
|---|---|---|
| `FIREFISH_WARM_RELEASES` | `r4,r4b,r5` | Releases whose definitions stay loaded. A release left out holds no memory and pays the full load on every compile. |
| `FIREFISH_PRELOAD` | unset | `true` loads the warm releases at startup rather than on first use. |

## Quick start

```bash
npm ci
npm start            # PORT defaults to 3000; FPL_REGISTRY overrides the FHIR package registry

# FSH → FHIR (R5)
curl -X POST http://localhost:3000/r5/sushi \
  -H 'Content-Type: application/fsh' \
  --data-binary $'Profile: MyPatient\nParent: Patient\n* name 1..1'

# FHIR → FSH (R5)
curl -X POST http://localhost:3000/r5/gofsh \
  -H 'Content-Type: application/fhir+json' \
  --data-binary @StructureDefinition-MyPatient.json
```

## Docker

Two images are published from this repository by [`ci.yml`](.github/workflows/ci.yml), both for
`linux/amd64` and `linux/arm64`, both tagged with the short commit sha, `latest` on `main`, and the
bare version on a `v*` tag:

| Image | What it is |
|---|---|
| `ghcr.io/helex-solutions/firefish` | The runnable service (`--target serve`): `node:22-slim`, `EXPOSE 3000`, `CMD node index.js`. |
| `ghcr.io/helex-solutions/firefish-app` | A `FROM scratch` carrier (`--target app`): the tree without `test/`, plus production `node_modules`, under `/bundle/firefish/`. Not a server. |

Standalone:

```bash
docker build --target serve -t firefish .
docker run -p 3000:3000 firefish
```

### In the Helex terminology suite

The suite image ([helex-solutions/tx-core](https://github.com/helex-solutions/tx-core)) copies the
`firefish-app` carrier in, runs it on `18660` and serves it under `/firefish/`. It pins one tag,
`FIREFISH_APP_IMAGE` in tx-core's `.github/workflows/build-tx.yml`; bump that pin to ship a Firefish
change in the suite. The callers (TEDY, Tailorbird, Beagle, Owliki) and how they reach Firefish are
mapped in tx-core's `docs/architecture/firefish/`.

Firefish lived in tx-core as `modules/firefish` until 2026-11; its history came along with it, and
`(helex-solutions/tx-core#N)` in an old commit subject names the tx-core pull request.

## Development

```bash
npm ci
npm test                    # unit + route tests
FIREFISH_E2E=1 npm test     # also the SUSHI/GoFSH round trip (downloads FHIR packages once)
```
