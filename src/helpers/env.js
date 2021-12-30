/**
 * Internal environment variables manager.
 *
 * Instantiation of EnvManager class will make a global variable `env` available
 * This class is recommended to globally available, as it can be instantiated
 * only once.
 * EnvManager.get() or EnvManager.set() allow manipulation of `env` object.
 * Environment variables of runtime (deno, node, worker) can be loaded via
 * EnvManager.loadEnv().
 *
 * @license
 * Copyright (c) 2021 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * "internal-name": is mapped to a runtime (deno | node | worker) specific
 * variable name. Right hand side can be a string (variable named the same on
 * all runtimes) or an object which can give it different names on different
 * runtimes or / and specify a type, if not string.
 */
const _ENV_VAR_MAPPINGS = {
  runTime: "RUNTIME",
  runTimeEnv: {
    worker: "WORKER_ENV",
    node: "NODE_ENV",
    deno: "DENO_ENV",
  },
  cloudPlatform: "CLOUD_PLATFORM",
  logLevel: "LOG_LEVEL",
  blocklistUrl: "CF_BLOCKLIST_URL",
  latestTimestamp: "CF_LATEST_BLOCKLIST_TIMESTAMP",
  dnsResolverUrl: "CF_DNS_RESOLVER_URL",
  onInvalidFlagStopProcessing: {
    type: "boolean",
    all: "CF_ON_INVALID_FLAG_STOPPROCESSING",
  },

  // parallel request wait timeout for download blocklist from s3
  fetchTimeout: {
    type: "number",
    all: "CF_BLOCKLIST_DOWNLOAD_TIMEOUT",
  },

  // env variables for td file split
  tdNodecount: {
    type: "number",
    all: "TD_NODE_COUNT",
  },
  tdParts: {
    type: "number",
    all: "TD_PARTS",
  },

  // set to on - off aggressive cache plugin
  // as of now Cache-api is available only on worker
  // so _getRuntimeEnv will set this to false for other runtime.
  isAggCacheReq: {
    type: "boolean",
    worker: "IS_AGGRESSIVE_CACHE_REQ",
  },
};

/**
 * Get runtime specific environment variables.
 * @param {String} runtime - Runtime name (deno, node, worker).
 * @return {Object} Runtime environment variables.
 */
function _getRuntimeEnv(runtime) {
  console.info("Loading env. from runtime:", runtime);

  const env = {};
  for (const [key, mapping] of Object.entries(_ENV_VAR_MAPPINGS)) {
    let name = null;
    let type = "string";

    if (typeof mapping === "string") {
      name = mapping;
    } else if (typeof mapping === "object") {
      name = mapping.all || mapping[runtime];
      type = mapping.type || type;
    } else throw new Error("Unfamiliar mapping");

    if (runtime === "node") env[key] = process.env[name];
    else if (runtime === "deno") env[key] = name && Deno.env.get(name);
    else if (runtime === "worker") env[key] = globalThis[name];
    else throw new Error(`Unknown runtime: ${runtime}`);

    // All env are assumed to be strings, so typecast them.
    if (type === "boolean") env[key] = !!env[key];
    else if (type === "number") env[key] = Number(env[key]);
    else if (type === "string") env[key] = env[key] || "";
    else throw new Error(`Unsupported type: ${type}`);
  }

  return env;
}

function _getRuntime() {
  // As `process` also exists in worker, we need to check for worker first.
  if (globalThis.RUNTIME === "worker") return "worker";
  if (typeof Deno !== "undefined") return "deno";
  if (typeof process !== "undefined") return "node";
}

export default class EnvManager {
  /**
   * Initializes the env manager.
   */
  constructor() {
    if (globalThis.env) throw new Error("envManager is already initialized.");

    globalThis.env = {};
    this.envMap = new Map();
    this.isLoaded = false;
  }

  /**
   * Loads env variables from runtime env. and is made globally available
   * through `env` namespace. Existing env variables will be overwritten.
   */
  loadEnv() {
    const runtime = _getRuntime();
    const env = _getRuntimeEnv(runtime);
    for (const [key, value] of Object.entries(env)) {
      this.envMap.set(key, value);
    }

    // adding download timeout with worker time to determine worker's overall
    // timeout
    runtime === "worker" &&
      this.envMap.set(
        "workerTimeout",
        Number(WORKER_TIMEOUT) + Number(CF_BLOCKLIST_DOWNLOAD_TIMEOUT)
      );

    console.debug(
      "Loaded env: ",
      (runtime === "worker" && JSON.stringify(this.toObject())) ||
        this.toObject()
    );

    globalThis.env = this.toObject(); // Global `env` namespace.
    this.isLoaded = true;
  }

  /**
   * @return {Map} - Map of env variables.
   */
  getMap() {
    return this.envMap;
  }

  /**
   * @return {Object} - Object of currently loaded env variables.
   */
  toObject() {
    return Object.fromEntries(this.envMap);
  }

  /**
   * @param {String} key - env variable name
   * @return {*} - env variable value
   */
  get(key) {
    return this.envMap.get(key);
  }

  /**
   * @param {String} key - env variable name
   * @param {*} value - env variable value
   */
  set(key, value) {
    this.envMap.set(key, value);
    globalThis.env = this.toObject();
  }
}