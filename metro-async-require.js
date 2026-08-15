/**
 * Metro asyncRequire used as transformer.asyncRequireModulePath.
 *
 * Expo's web path tries a synchronous importAll() first and only fetches the
 * split chunk if that throws. In Expo web, Metro's guardedLoadModule swallows
 * the throw via ErrorUtils.reportFatalError, so you get "Requiring unknown
 * module N" and the chunk never loads. Always fetch the split bundle first —
 * the same path Expo already uses on native.
 *
 * Fork of expo/src/async-require/asyncRequireModule.ts (SDK 57).
 */

function makeWorkerContent(url) {
  return `
    const ASYNC_WORKER_BASE = ${JSON.stringify(url)};
    const IMPORT_SCRIPTS = importScripts;
    const FETCH = fetch;
    const fromBaseURL = (input) => new URL(input, ASYNC_WORKER_BASE).href;
    self.fetch = function(input, init) {
      return FETCH(typeof input === 'string' ? fromBaseURL(input) : input, init);
    };
    self.importScripts = function(...urls) {
      return IMPORT_SCRIPTS.apply(self, urls.map(fromBaseURL));
    };
    importScripts(ASYNC_WORKER_BASE);
  `;
}

function maybeLoadBundle(moduleID, paths) {
  const prefix = typeof __METRO_GLOBAL_PREFIX__ !== "undefined" ? __METRO_GLOBAL_PREFIX__ : "";
  const loadBundle = globalThis[`${prefix}__loadBundleAsync`];
  if (loadBundle != null && paths != null) {
    const bundlePath = paths[String(moduleID)];
    if (bundlePath != null) return loadBundle(bundlePath);
  }
  return undefined;
}

function asyncRequireImpl(moduleID, paths, moduleName) {
  const importAll = () => require.importAll(moduleID, moduleName);
  const pending = maybeLoadBundle(moduleID, paths);
  if (pending != null) return pending.then(importAll);
  return importAll();
}

function asyncRequire(moduleID, paths, moduleName) {
  const ret = asyncRequireImpl(moduleID, paths, moduleName);
  const promise = Promise.resolve(ret);
  promise._result = ret;
  return promise;
}

asyncRequire.unstable_importMaybeSync = function (moduleID, paths) {
  return asyncRequireImpl(moduleID, paths);
};

asyncRequire.prefetch = function (moduleID, paths) {
  maybeLoadBundle(moduleID, paths)?.then(
    () => {},
    () => {}
  );
};

asyncRequire.unstable_resolve = function (moduleID, paths) {
  if (!paths) throw new Error("Bundle splitting is required for Web Worker imports");
  const id = paths[moduleID];
  if (!id) throw new Error("Worker import is missing from split bundle paths: " + id);
  return id;
};

asyncRequire.unstable_createWorker = function (workerUrl, workerOpts) {
  if (typeof crossOriginIsolated !== "undefined" && crossOriginIsolated) {
    try {
      const content = makeWorkerContent(workerUrl);
      workerUrl = URL.createObjectURL(new Blob([content], { type: "text/javascript" }));
      return new Worker(workerUrl, workerOpts);
    } finally {
      URL.revokeObjectURL(workerUrl);
    }
  }
  return new Worker(workerUrl, workerOpts);
};

module.exports = asyncRequire;
