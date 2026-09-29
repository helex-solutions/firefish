/**
 * FHIR release → `fhirVersion` map. The release is taken from the request path
 * (`/r4/…`, `/r5/…`) so callers never pass a version option — SUSHI's
 * `fhirVersion` and GoFSH's target are derived from it here.
 *
 * `r4` is R4 (4.0.1) — what an implementation guide, a national base package and SUSHI's own
 * default mean by "R4", and the only version a profile deriving from `hl7.fhir.r4.core` can target.
 * R4B (4.3.0), which `r4` used to resolve to, keeps its own segment, `r4b`.
 */
const RELEASES = {
  r4: '4.0.1',
  r4b: '4.3.0',
  r5: '5.0.0',
};

/** Resolve a path segment (`r4`/`r4b`/`r5`, case-insensitive) to a fhirVersion, or undefined. */
function fhirVersionFor(release) {
  return RELEASES[String(release || '').toLowerCase()];
}

module.exports = { RELEASES, fhirVersionFor };
