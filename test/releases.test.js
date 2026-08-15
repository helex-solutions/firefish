const { test } = require('node:test');
const assert = require('node:assert/strict');

const { fhirVersionFor, RELEASES } = require('../lib/releases');

test('r4 resolves to R4B (4.3.0)', () => {
  assert.equal(fhirVersionFor('r4'), '4.3.0');
});

test('r5 resolves to R5 (5.0.0)', () => {
  assert.equal(fhirVersionFor('r5'), '5.0.0');
});

test('release lookup is case-insensitive', () => {
  assert.equal(fhirVersionFor('R5'), '5.0.0');
});

test('unknown / empty release is undefined', () => {
  assert.equal(fhirVersionFor('r9'), undefined);
  assert.equal(fhirVersionFor(''), undefined);
  assert.equal(fhirVersionFor(undefined), undefined);
});

test('only r4 and r5 are exposed', () => {
  assert.deepEqual(Object.keys(RELEASES).sort(), ['r4', 'r5']);
});
