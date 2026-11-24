#!/usr/bin/env node
// Should this commit publish a release? The answer the CI `version` job acts on.
//
// The version lives in package.json — the same value /health reports — and a release is cut by
// bumping it. A push that does not bump it publishes nothing. This is the publish-on-bump model
// forge uses: compare the source version with what the registry already holds, publish only if
// the source is strictly greater.
//
// "What the registry holds" is every semver tag on BOTH images. `firefish` still carries the
// suite-era tags tx-core put on it (0.5.48 … 1.1.7) before Firefish had a version line of its
// own, so a Firefish version inside that range would collide with an image that means something
// else. Counting them makes the check refuse it instead.
//
// Prints key=value lines (for $GITHUB_OUTPUT) on stdout and the reasoning on stderr.
// Exit 1 only when the check itself cannot run — a registry it cannot read is not "nothing to do".

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://ghcr.io';
const IMAGES = ['helex-solutions/firefish', 'helex-solutions/firefish-app'];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parse(v) {
  const m = SEMVER.exec(v);
  return m ? { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] } : null;
}

// Semver precedence: core numerically, then a release outranks its prereleases, then prerelease
// identifiers left to right (numeric < alphanumeric, numerics compared as numbers).
export function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn && +p !== +q) return +p - +q;
    if (pn !== qn) return pn ? -1 : 1;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

export function decide(version, published) {
  if (!parse(version)) return { publish: false, reason: `package.json version "${version}" is not semver` };
  const known = published.filter((t) => parse(t));
  if (known.includes(version)) return { publish: false, reason: `${version} is already published` };
  const highest = known.sort(compare).at(-1);
  if (highest && compare(version, highest) <= 0) {
    return { publish: false, reason: `${version} is not above the highest published version, ${highest}` };
  }
  return { publish: true, reason: `${version} is above ${highest ?? 'nothing published yet'}` };
}

async function tags(image) {
  // Both packages are public, so an anonymous pull token is enough — no secret, and the same on a
  // fork's pull request as on main.
  const t = await fetch(`${REGISTRY}/token?scope=repository:${image}:pull`);
  if (!t.ok) throw new Error(`token for ${image}: HTTP ${t.status}`);
  const { token } = await t.json();
  const all = [];
  let url = `${REGISTRY}/v2/${image}/tags/list?n=1000`;
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) break; // no such package yet: nothing published
    if (!r.ok) throw new Error(`tags of ${image}: HTTP ${r.status}`);
    all.push(...((await r.json()).tags ?? []));
    // The registry pages; the next page is in a Link header, relative to the registry root.
    const next = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get('link') ?? '');
    url = next ? new URL(next[1], REGISTRY).href : null;
  }
  return all;
}

async function main() {
  const pkg = new URL('../package.json', import.meta.url);
  const { version } = JSON.parse(readFileSync(pkg, 'utf8'));
  const published = (await Promise.all(IMAGES.map(tags))).flat();
  const { publish, reason } = decide(version, published);
  console.error(`firefish ${version}: ${publish ? 'will publish' : 'nothing to publish'} — ${reason}`);
  console.log(`version=${version}`);
  console.log(`publish=${publish}`);
  console.log(`prerelease=${parse(version)?.pre.length > 0}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`version check failed: ${e.message}`);
    process.exit(1);
  });
}
