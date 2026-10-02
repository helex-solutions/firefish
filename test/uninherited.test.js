const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const { _test } = require('../lib/compile');

// lib/compile.js hands GoFSH each parent as SUSHI will start a profile from it, which means knowing
// which extensions SUSHI does not let a profile inherit. SUSHI does not export those two lists, so
// they are copied, and this holds the copies to SUSHI's source: an upgrade that changes them fails
// here rather than quietly losing a value on the way through FSH.
function listIn(file, name) {
  const source = readFileSync(require.resolve(file), 'utf8');
  const start = source.indexOf(`const ${name} = [`);
  assert.notEqual(start, -1, `${name} is no longer in ${file}`);
  const body = source.slice(start, source.indexOf('];', start));
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

test('the definition extensions a profile does not inherit are SUSHI\'s', () => {
  assert.deepEqual(
    [..._test.uninherited.definition].sort(),
    listIn('fsh-sushi/dist/export/StructureDefinitionExporter.js', 'UNINHERITED_SD_EXTENSIONS'),
  );
});

test('the element extensions a profile does not inherit are SUSHI\'s', () => {
  assert.deepEqual(
    [..._test.uninherited.element].sort(),
    listIn('fsh-sushi/dist/fhirtypes/ElementDefinition.js', 'UNINHERITED_ED_EXTENSIONS'),
  );
});
