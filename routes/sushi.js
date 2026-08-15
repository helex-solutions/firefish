const router = require('express').Router();

const { sushiClient } = require('fsh-sushi');

const { getFshOptionsFromHeader } = require('../lib/header-utils');
const { fhirVersionFor } = require('../lib/releases');
const { fail } = require('../lib/utils');

/**
 * SUSHI — FSH → FHIR. `POST /:release/sushi` where `:release` ∈ {r4, r5}.
 * Body is raw `application/fsh`; the FHIR version comes from the path, everything
 * else (canonical, version, snapshot, logLevel) from the Content-Type params.
 */
router.post('/:release/sushi', async (req, res) => {
  const fhirVersion = fhirVersionFor(req.params.release);
  if (!fhirVersion) {
    return res.status(404).json({ errors: [{ message: `Unknown FHIR release '${req.params.release}' (expected r4 or r5)` }] });
  }
  // Options come from Content-Type params and/or query string; query wins. Query
  // params are the portable channel for values that can't sit in a media-type
  // param — e.g. a `canonical` URL, whose `:` / `/` are not header tokens.
  const options = { ...(await getFshOptionsFromHeader(req)), ...req.query, fhirVersion };
  res.contentType('application/json');
  sushiClient
    .fshToFhir(req.body, options)
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
