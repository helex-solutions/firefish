const router = require('express').Router();

const { fshToFhir } = require('../lib/compile');
const { getFshOptionsFromHeader } = require('../lib/header-utils');
const { fhirVersionFor } = require('../lib/releases');
const { fail } = require('../lib/utils');

/**
 * SUSHI — FSH → FHIR. `POST /:release/sushi` where `:release` ∈ {r4, r4b, r5}.
 * Body is raw `application/fsh`; the FHIR version comes from the path, everything
 * else (canonical, version, snapshot, logLevel) from the Content-Type params.
 *
 * As `application/json` the body is the FSH documents of one project (an array), or an envelope
 * `{fsh, context}`: `fsh` the document or the documents, `context` the FHIR definitions the FSH may
 * lean on that are in no package Firefish loads (lib/compile.js, `withContext`).
 */
function envelope(body) {
  const isEnvelope = body && typeof body === 'object' && !Array.isArray(body) && 'fsh' in body;
  return isEnvelope ? { input: body.fsh, context: body.context } : { input: body, context: undefined };
}

router.post('/:release/sushi', async (req, res) => {
  const fhirVersion = fhirVersionFor(req.params.release);
  if (!fhirVersion) {
    return res.status(404).json({ errors: [{ message: `Unknown FHIR release '${req.params.release}' (expected r4, r4b or r5)` }] });
  }
  // Options come from Content-Type params and/or query string; query wins. Query
  // params are the portable channel for values that can't sit in a media-type
  // param — e.g. a `canonical` URL, whose `:` / `/` are not header tokens.
  const { input, context } = envelope(req.body);
  // The context is the body's, never an option: a query parameter of that name is not it.
  const options = { ...(await getFshOptionsFromHeader(req)), ...req.query, fhirVersion, context };
  res.contentType('application/json');
  fshToFhir(input, options)
    .then((results) => {
      if (results.errors?.length > 0) {
        fail(res, results);
      } else {
        res.send(results);
      }
    })
    .catch((err) => fail(res, err));
});

module.exports = router;
