/**
 * SUSHI / GoFSH compiles over FHIR definitions that are loaded once per release and then reused.
 *
 * `sushiClient.fshToFhir` and `gofshClient.fhirToFsh` build a fresh FHIRDefinitions per call and
 * re-index hl7.fhir.rX.core plus the automatic dependencies (tools, terminology, extensions) from the
 * package cache — thousands of JSON files, seconds per request. The two functions below are the same
 * pipelines assembled from the libraries' exported pieces, except the external definitions come from
 * a per-release pool.
 *
 * Sharing is safe because neither compiler writes to its external definitions: SUSHI exports into a
 * per-compile `Package` (fished ahead of the defs by its MasterFisher), GoFSH loads the request's own
 * resources into the `LakeOfFHIR`'s private defs, and FHIRDefinitions runs in SafeMode.FREEZE, so
 * anything fished from it is frozen. One request's profiles therefore never reach another's compile.
 *
 * Both libraries keep their errors/warnings and logger level in module globals ("not safe for true
 * asynchronous usage", per SUSHI), so every compile runs under one lock; that also makes the pool's
 * lazy load single-flight.
 *
 * Env:
 * - FIREFISH_WARM_RELEASES — comma-separated releases to keep warm (default all: r4,r4b,r5). A release
 *   left out compiles against freshly loaded definitions per request, as before, and holds no memory.
 * - FIREFISH_PRELOAD — `true` loads the warm releases at startup instead of on first use.
 */
const { sushiImport, sushiExport, fhirdefs, utils: sushiUtils } = require('fsh-sushi');
const { processor: gofshProcessor, gofshExport, utils: gofshUtils } = require('gofsh');

const { RELEASES } = require('./releases');

const LEVELS = ['silly', 'debug', 'verbose', 'http', 'info', 'warn', 'error', 'silent'];
const SUSHI_ARTIFACT_TYPES = ['profiles', 'extensions', 'instances', 'valueSets', 'codeSystems', 'logicals', 'resources'];

/** fhirVersions (e.g. `4.0.1`) whose definitions stay warm. */
function warmVersions(env = process.env) {
  const releases = (env.FIREFISH_WARM_RELEASES ?? Object.keys(RELEASES).join(','))
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  return new Set(releases.map((r) => RELEASES[r]).filter(Boolean));
}

const warm = warmVersions();

/** `${tool}:${fhirVersion}` → { defs, errors, warnings } once loaded. */
const pool = new Map();

let queue = Promise.resolve();

/** Run `fn` after every compile queued before it; a failure never blocks the queue. */
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/**
 * Definitions for one compile. Pooled when the release is warm and the compile adds no dependency
 * packages of its own (those would change what the defs contain); otherwise freshly loaded, as the
 * libraries do. A pooled load that logged errors (e.g. core could not be downloaded) is not kept, so
 * the next request retries. What a pooled load logged is replayed into every later compile's report,
 * so warm requests see the same warnings a cold one would.
 */
async function definitions({ tool, fhirVersion, hasDependencies, create, load, tracker }) {
  const key = `${tool}:${fhirVersion}`;
  const pooled = warm.has(fhirVersion) && !hasDependencies;
  const hit = pooled && pool.get(key);
  if (hit) {
    tracker.errors.push(...hit.errors);
    tracker.warnings.push(...hit.warnings);
    return hit.defs;
  }
  const [e0, w0] = [tracker.errors.length, tracker.warnings.length];
  const defs = await create();
  await load(defs);
  const errors = tracker.errors.slice(e0);
  if (pooled && errors.length === 0) {
    pool.set(key, { defs, errors, warnings: tracker.warnings.slice(w0) });
  }
  return defs;
}

/** Apply a request's logLevel to the given loggers; returns a function restoring their prior state. */
function applyLogLevel(logLevel, loggers) {
  const saved = loggers.map((l) => [l, l.level, l.transports[0].silent]);
  if (logLevel === 'silent') {
    loggers.forEach((l) => (l.transports[0].silent = true));
  } else if (logLevel != null) {
    loggers.forEach((l) => (l.level = logLevel));
  }
  return () =>
    saved.forEach(([l, level, silent]) => {
      l.level = level;
      l.transports[0].silent = silent;
    });
}

const invalidLogLevel = (logLevel) => ({
  message: `Invalid logLevel: ${logLevel}. Valid levels include: ${LEVELS.join(', ')}.`,
});

/** FSH → FHIR; the same contract as `sushiClient.fshToFhir`. */
function fshToFhir(input, options = {}) {
  return exclusive(async () => {
    if (options.logLevel != null && !LEVELS.includes(options.logLevel)) {
      return { fhir: null, errors: [invalidLogLevel(options.logLevel)], warnings: [] };
    }
    const tracker = sushiUtils.errorsAndWarnings;
    tracker.reset();
    tracker.shouldTrack = true;
    const restore = applyLogLevel(options.logLevel, [sushiUtils.logger]);
    try {
      const config = {
        canonical: options.canonical ?? 'http://example.org',
        FSHOnly: true,
        fhirVersion: [options.fhirVersion ?? '4.0.1'],
        dependencies: options.dependencies,
        version: options.version,
      };
      const defs = await definitions({
        tool: 'sushi',
        fhirVersion: config.fhirVersion[0],
        hasDependencies: config.dependencies?.length > 0,
        create: () => fhirdefs.createFHIRDefinitions(),
        load: (d) => sushiUtils.loadExternalDependencies(d, config),
        tracker,
      });
      const rawFSHes = Array.isArray(input)
        ? input.map((text, i) => new sushiImport.RawFSH(text, `Input_${i}`))
        : [new sushiImport.RawFSH(input)];
      const tank = sushiUtils.fillTank(rawFSHes, config);
      tank.checkDuplicateNameEntities();
      const outPackage = sushiExport.exportFHIR(tank, defs);
      const snapshot = options.snapshot ?? false;
      const fhir = SUSHI_ARTIFACT_TYPES.flatMap((type) => outPackage[type].map((a) => a.toJSON(snapshot)));
      return { fhir, errors: tracker.errors, warnings: tracker.warnings };
    } finally {
      restore();
    }
  });
}

/** FHIR → FSH; the same contract as `gofshClient.fhirToFsh`. */
function fhirToFsh(input, options = {}) {
  return exclusive(async () => {
    if (options.logLevel != null && !LEVELS.includes(options.logLevel)) {
      return { fsh: null, errors: [invalidLogLevel(options.logLevel)], warnings: [], configuration: null };
    }
    const { logger, errorsAndWarnings: tracker } = gofshUtils;
    tracker.reset();
    tracker.shouldTrack = true;
    const restore = applyLogLevel(options.logLevel, [logger, sushiUtils.logger]);
    try {
      const docs = [];
      input.forEach((resource, i) => {
        const location = `Input_${i}`;
        if (typeof resource === 'string') {
          try {
            resource = JSON.parse(resource);
          } catch {
            logger.error(`Could not parse ${location} to JSON`);
            return;
          }
        }
        if (gofshUtils.isProcessableContent(resource, location)) {
          docs.push(new gofshProcessor.WildFHIR({ content: resource }, location));
        }
      });
      const lake = new gofshProcessor.LakeOfFHIR(docs);
      await lake.prepareDefs();
      // processConfig reads only the lake, and it is what says which fhirVersion and dependencies the
      // external defs must hold — so it runs before they are picked.
      const configuration = new gofshProcessor.FHIRProcessor(lake).processConfig(
        (options.dependencies ?? []).map((d) => d.replace('#', '@')),
      );
      const defs = await definitions({
        tool: 'gofsh',
        fhirVersion: configuration.config.fhirVersion?.[0],
        hasDependencies: configuration.config.dependencies?.length > 0,
        create: async () => {
          const defs = new gofshUtils.FHIRDefinitions();
          await defs.initialize();
          return defs;
        },
        load: (d) => gofshUtils.loadExternalDependencies(d, configuration),
        tracker,
      });
      const processor = new gofshProcessor.FHIRProcessor(lake, new gofshUtils.MasterFisher(lake, defs));
      const pkg = await gofshUtils.getResources(processor, configuration, { indent: options.indent === true });
      return {
        fsh: new gofshExport.FSHExporter(pkg).apiExport(options.style === 'map' ? 'map' : 'string'),
        configuration: configuration.config,
        errors: tracker.errors,
        warnings: tracker.warnings,
      };
    } finally {
      restore();
    }
  });
}

/** Load the warm releases' definitions now (FIREFISH_PRELOAD). Failures are logged, not thrown. */
function preload() {
  const compiles = [...warm].flatMap((fhirVersion) => [
    fshToFhir('', { fhirVersion, logLevel: 'error' }),
    fhirToFsh([{ resourceType: 'ImplementationGuide', id: 'preload', fhirVersion: [fhirVersion] }], { logLevel: 'error' }),
  ]);
  return Promise.allSettled(compiles).then((results) =>
    results.filter((r) => r.status === 'rejected').forEach((r) => console.error('Firefish preload failed', r.reason)),
  );
}

/** Test hook: which definitions are pooled. */
const _test = { pooledKeys: () => [...pool.keys()] };

module.exports = { fshToFhir, fhirToFsh, preload, warmVersions, _test };
