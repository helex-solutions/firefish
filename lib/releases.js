/**
 * FHIR release → `fhirVersion` map. The release is taken from the request path
 * (`/r4/…`, `/r5/…`) so callers never pass a version option — SUSHI's
 * `fhirVersion` and GoFSH's target are derived from it here.
 *
 * `r4` resolves to 4.3.0 (R4B), the version the terminology suite standardised on.
 */
const RELEASES = {
  r4: '4.3.0',
  r5: '5.0.0',
};

/** Resolve a path segment (`r4`/`r5`, case-insensitive) to a fhirVersion, or undefined. */
function fhirVersionFor(release) {
  return RELEASES[String(release || '').toLowerCase()];
}

module.exports = { RELEASES, fhirVersionFor };
