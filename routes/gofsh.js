const router = require('express').Router();

const { gofshClient } = require('gofsh');

const { getFhirOptionsFromHeader } = require('../lib/header-utils');
const { fhirVersionFor } = require('../lib/releases');
const { fail } = require('../lib/utils');

/** Normalise the body to an array of resources GoFSH can consume. */
const asResourceArray = (body) => (body && !Array.isArray(body) ? [body] : body || []);

/**
 * A marker ImplementationGuide pins the FHIR release for GoFSH (which otherwise
 * infers it from the input). Previously each caller appended this; now the route
 * segment (`/r4`, `/r5`) decides it server-side.
 */
const releaseMarker = (fhirVersion) => ({
  resourceType: 'ImplementationGuide',
  id: 'firefish-release-marker',
  url: 'ImplementationGuide/firefish-release-marker',
  version: '1.0.0',
  fhirVersion: [fhirVersion],
});

/**
 * GoFSH — FHIR → FSH. `POST /:release/gofsh` where `:release` ∈ {r4, r4b, r5}.
 * Body is raw `application/fhir+json`; options (logLevel, indent, style) come from
 * the Content-Type params. Returns raw FSH text as `application/fsh`.
 */
router.post('/:release/gofsh', async (req, res) => {
  const fhirVersion = fhirVersionFor(req.params.release);
  if (!fhirVersion) {
    return res.status(404).json({ errors: [{ message: `Unknown FHIR release '${req.params.release}' (expected r4, r4b or r5)` }] });
  }
  // Options from Content-Type params and/or query string; query wins.
  const options = { ...(await getFhirOptionsFromHeader(req)), ...req.query };
  const input = [...asResourceArray(req.body), releaseMarker(fhirVersion)];
  res.contentType('application/fsh');
  gofshClient
    .fhirToFsh(input, options)
    .then((results) => {
      if (results.errors?.length > 0) {
        fail(res, results);
      } else {
        res.send(results.fsh);
      }
    })
    .catch((err) => fail(res, err));
});

module.exports = router;
