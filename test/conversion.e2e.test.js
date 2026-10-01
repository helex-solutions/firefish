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

test('SUSHI: /r4/sushi pins fhirVersion 4.0.1', { skip: !RUN }, async () => {
  const res = await fetch(`${base}/r4/sushi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fsh' },
    body: 'Profile: MyPatient\nParent: Patient\n* name 1..1',
  });
  const body = await res.json();
  assert.equal(body.fhir?.[0]?.fhirVersion, '4.0.1');
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

// GoFSH writes no `^status` rule for an active definition ("SUSHI always sets status to active"), so
// the compile has to supply it; without that an active profile came back with no status at all.
test('round trip: a definition keeps its status, active or not', { skip: !RUN }, async () => {
  const profile = (id, status) => ({
    resourceType: 'StructureDefinition',
    id,
    url: `http://example.org/StructureDefinition/${id}`,
    name: id,
    status,
    fhirVersion: '5.0.0',
    kind: 'resource',
    abstract: false,
    type: 'Patient',
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
    derivation: 'constraint',
    differential: { element: [{ id: 'Patient.name', path: 'Patient.name', min: 1 }] },
  });
  for (const status of ['active', 'draft', 'retired']) {
    const decompiled = await fetch(`${base}/r5/gofsh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify(profile(`Status${status}`, status)),
    });
    assert.equal(decompiled.status, 200);
    const compiled = await fetch(`${base}/r5/sushi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/fsh' },
      body: await decompiled.text(),
    });
    assert.equal(compiled.status, 200);
    assert.equal((await compiled.json()).fhir?.[0]?.status, status);
  }
});

test('SUSHI: a profile that names no status is active, and is never without one', { skip: !RUN }, async () => {
  const res = await fetch(`${base}/r5/sushi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fsh' },
    body: 'Profile: NoStatus\nParent: Patient\n* name 1..1',
  });
  assert.equal((await res.json()).fhir?.[0]?.status, 'active');
});

// Definitions are loaded once per release and shared (lib/compile.js); what one compile defines
// must never be visible to the next.
const sushi = (release, fsh) =>
  fetch(`${base}/${release}/sushi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fsh' },
    body: fsh,
  }).then(async (res) => ({ status: res.status, body: await res.json() }));

const elementIds = (sd) => sd.differential.element.map((e) => e.id);

test('SUSHI: two compiles defining the same profile name do not see each other', { skip: !RUN }, async () => {
  const first = await sushi('r4', 'Profile: Z\nParent: Observation\n* subject 1..1');
  assert.equal(first.status, 200);
  assert.deepEqual(elementIds(first.body.fhir[0]), ['Observation.subject']);

  const second = await sushi('r4', 'Profile: Z\nParent: Observation\n* status MS');
  assert.equal(second.status, 200);
  assert.deepEqual(elementIds(second.body.fhir[0]), ['Observation.status']);
});

test('SUSHI: a profile from an earlier compile is not resolvable as a parent', { skip: !RUN }, async () => {
  assert.equal((await sushi('r4', 'Profile: OnlyInFirst\nParent: Observation\n* status MS')).status, 200);
  const child = await sushi('r4', 'Profile: Child\nParent: OnlyInFirst');
  assert.equal(child.status, 500);
  assert.match(child.body.errors[0].message, /OnlyInFirst/);
});

test('SUSHI: concurrent compiles each report only their own errors', { skip: !RUN }, async () => {
  const [bad, good] = await Promise.all([
    sushi('r4', 'Profile: Broken\nParent: NoSuchParent'),
    sushi('r4', 'Profile: Fine\nParent: Observation\n* status MS'),
  ]);
  assert.equal(bad.status, 500);
  assert.match(bad.body.errors[0].message, /NoSuchParent/);
  assert.equal(good.status, 200);
  assert.equal(good.body.fhir[0].name, 'Fine');
});

test('SUSHI: a silent compile does not silence the next one', { skip: !RUN }, async () => {
  const { utils } = require('fsh-sushi');
  const res = await fetch(`${base}/r4/sushi?logLevel=silent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fsh' },
    body: 'Profile: Quiet\nParent: Observation',
  });
  assert.equal(res.status, 200);
  assert.ok(!utils.logger.transports[0].silent);
});

test('SUSHI → GoFSH → SUSHI round trip on warm definitions', { skip: !RUN }, async () => {
  const compiled = await sushi('r4', 'Profile: Trip\nParent: Patient\n* name 1..1');
  const decompiled = await fetch(`${base}/r4/gofsh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json' },
    body: JSON.stringify(compiled.body.fhir[0]),
  });
  assert.equal(decompiled.status, 200);
  const recompiled = await sushi('r4', await decompiled.text());
  assert.equal(recompiled.status, 200);
  assert.deepEqual(recompiled.body.fhir[0].differential, compiled.body.fhir[0].differential);
});
