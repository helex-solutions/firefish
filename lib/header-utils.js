const CONTENT_TYPE_HEADER = 'Content-Type';

const hthvParseSemiSepPromise = (async function () {
  const { hthvParseSemiSep } = await import('http-header-value');
  return hthvParseSemiSep;
})();

async function hthvParseSemiSep(header) {
  return (await hthvParseSemiSepPromise)(header);
}

/** Parse conversion options out of the Content-Type params, dropping the media type itself. */
async function parseOptions(req, mediaTypePattern) {
  const contentType = req.get(CONTENT_TYPE_HEADER) || '';
  const options = contentType.replace(mediaTypePattern, '');
  return (await hthvParseSemiSep(options)).reduce((map, { n, v }) => ({ ...map, [n]: v }), {});
}

/** SUSHI options from an `application/fsh; …` Content-Type. */
async function getFshOptionsFromHeader(req) {
  return parseOptions(req, /application\/fsh;?/);
}

/** GoFSH options from an `application/fhir+json; …` Content-Type. */
async function getFhirOptionsFromHeader(req) {
  return parseOptions(req, /application\/fhir\+json;?/);
}

module.exports = { getFshOptionsFromHeader, getFhirOptionsFromHeader };
