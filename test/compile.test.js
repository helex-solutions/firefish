const { test } = require('node:test');
const assert = require('node:assert/strict');

const { fshToFhir, fhirToFsh, warmVersions, _test } = require('../lib/compile');

test('every release is warm by default', () => {
  assert.deepEqual([...warmVersions({})], ['4.0.1', '4.3.0', '5.0.0']);
});

test('FIREFISH_WARM_RELEASES narrows the warm set; unknown and blank entries are ignored', () => {
  assert.deepEqual([...warmVersions({ FIREFISH_WARM_RELEASES: ' R4, r5 ,,r9' })], ['4.0.1', '5.0.0']);
  assert.deepEqual([...warmVersions({ FIREFISH_WARM_RELEASES: '' })], []);
});

test('an invalid logLevel is refused before any definitions load', async () => {
  const sushi = await fshToFhir('Profile: X', { logLevel: 'loud' });
  assert.equal(sushi.fhir, null);
  assert.match(sushi.errors[0].message, /Invalid logLevel: loud/);

  const gofsh = await fhirToFsh([], { logLevel: 'loud' });
  assert.equal(gofsh.fsh, null);
  assert.match(gofsh.errors[0].message, /Invalid logLevel: loud/);

  assert.deepEqual(_test.pooledKeys(), []);
});
