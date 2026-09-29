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

Standalone:

```bash
docker build -t firefish .
docker run -p 3000:3000 firefish
```

In the suite, Firefish is folded into the combined `docker/tx.Dockerfile` image and served under
`/firefish/` (see `docker/README.md`).
