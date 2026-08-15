const { test } = require('node:test');
const assert = require('node:assert/strict');

const { getFshOptionsFromHeader, getFhirOptionsFromHeader } = require('../lib/header-utils');

/** Minimal Express-request stub exposing only `get('Content-Type')`. */
const reqWith = (contentType) => ({ get: (h) => (h === 'Content-Type' ? contentType : undefined) });

test('FSH options parsed from application/fsh params', async () => {
  const opts = await getFshOptionsFromHeader(reqWith('application/fsh; canonical=http://ex.org; version=0.0.1'));
  assert.deepEqual(opts, { canonical: 'http://ex.org', version: '0.0.1' });
});

test('FSH media type with no params yields empty options', async () => {
  assert.deepEqual(await getFshOptionsFromHeader(reqWith('application/fsh')), {});
});

test('FHIR options parsed from application/fhir+json params', async () => {
  const opts = await getFhirOptionsFromHeader(reqWith('application/fhir+json; style=map; indent=true'));
  assert.deepEqual(opts, { style: 'map', indent: 'true' });
});

test('missing Content-Type is tolerated', async () => {
  assert.deepEqual(await getFshOptionsFromHeader(reqWith(undefined)), {});
});
