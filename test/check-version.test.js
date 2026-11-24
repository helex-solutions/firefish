'use strict';
const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../scripts/check-version.mjs');

test('semver precedence: core, then release over prerelease, then identifiers', async () => {
  const { compare } = await load();
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.2.0', '1.10.0'];
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(compare(ordered[i - 1], ordered[i]) < 0, `${ordered[i - 1]} < ${ordered[i]}`);
  }
  assert.strictEqual(compare('1.2.0', '1.2.0'), 0);
});

test('a bump above everything published publishes; sha tags and latest are ignored', async () => {
  const { decide } = await load();
  assert.deepStrictEqual(decide('1.2.0', ['latest', '7707b3f', '0.5.48', '1.1.7']).publish, true);
  assert.deepStrictEqual(decide('1.2.0', []).publish, true);
});

test('an unbumped, already published or lower version publishes nothing', async () => {
  const { decide } = await load();
  assert.strictEqual(decide('1.2.0', ['1.2.0', 'latest']).publish, false);
  assert.strictEqual(decide('1.1.0', ['1.1.7']).publish, false);
  // A version inside the suite-era range is refused rather than overwriting what it names.
  assert.strictEqual(decide('0.6.0', ['0.5.48', '1.1.7']).publish, false);
});

test('prereleases: an rc publishes, and the release still outranks it', async () => {
  const { decide } = await load();
  assert.strictEqual(decide('1.3.0-rc.1', ['1.2.0']).publish, true);
  assert.strictEqual(decide('1.3.0', ['1.2.0', '1.3.0-rc.1']).publish, true);
  assert.strictEqual(decide('1.3.0-rc.1', ['1.3.0']).publish, false);
});

test('a non-semver package.json version is refused', async () => {
  const { decide } = await load();
  assert.strictEqual(decide('next', []).publish, false);
});
