// Real SUSHI/GoFSH round-trip. Off by default (it downloads FHIR packages on
// first run); enable with FIREFISH_E2E=1. Run: FIREFISH_E2E=1 npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../app');

const RUN = !!process.env.FIREFISH_E2E;

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

test('SUSHI: /r5/sushi compiles FSH → FHIR at fhirVersion 5.0.0', { skip: !RUN }, async () => {
  const res = await fetch(`${base}/r5/sushi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fsh' },
    body: 'Profile: MyPatient\nParent: Patient\n* name 1..1',
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fhir?.[0]?.resourceType, 'StructureDefinition');
  assert.equal(body.fhir[0].fhirVersion, '5.0.0');
});

test('SUSHI: /r4/sushi pins fhirVersion 4.3.0', { skip: !RUN }, async () => {
  const res = await fetch(`${base}/r4/sushi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fsh' },
    body: 'Profile: MyPatient\nParent: Patient\n* name 1..1',
  });
  const body = await res.json();
  assert.equal(body.fhir?.[0]?.fhirVersion, '4.3.0');
});

test('SUSHI: query-string options reach SUSHI (canonical)', { skip: !RUN }, async () => {
  const res = await fetch(`${base}/r5/sushi?canonical=${encodeURIComponent('https://tx.helex.org/fhir')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fsh' },
    body: 'Profile: MyPatient\nParent: Patient\n* name 1..1',
  });
  const body = await res.json();
  assert.equal(body.fhir?.[0]?.url, 'https://tx.helex.org/fhir/StructureDefinition/MyPatient');
});

test('GoFSH: /r5/gofsh decompiles FHIR → FSH text', { skip: !RUN }, async () => {
  const sd = {
    resourceType: 'StructureDefinition',
    id: 'MyPatient',
    url: 'http://example.org/StructureDefinition/MyPatient',
    name: 'MyPatient',
    status: 'draft',
    fhirVersion: '5.0.0',
    kind: 'resource',
    abstract: false,
    type: 'Patient',
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
    derivation: 'constraint',
    differential: { element: [{ id: 'Patient.name', path: 'Patient.name', min: 1, max: '1' }] },
  };
  const res = await fetch(`${base}/r5/gofsh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: JSON.stringify(sd),
  });
  assert.equal(res.status, 200);
  const fsh = await res.text();
  assert.match(fsh, /Profile:\s*MyPatient/);
  assert.match(fsh, /Parent:\s*Patient/);
});
