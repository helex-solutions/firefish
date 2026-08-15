const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../app');

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('GET /health reports the firefish service', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'UP');
  assert.equal(body.service, 'firefish');
});

test('unknown FHIR release → 404 (before invoking a compiler)', async () => {
  const res = await fetch(`${base}/r9/sushi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fsh' },
    body: 'Profile: X',
  });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.errors[0].message, /Unknown FHIR release/);
});

test('legacy v1 and v2 routes are gone → 404', async () => {
  for (const path of ['/fsh2fhir', '/v2/fsh2fhir', '/fhir2fsh', '/v2/fhir2fsh']) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(res.status, 404, `${path} should be 404`);
  }
});
