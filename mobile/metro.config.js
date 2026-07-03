// Metro config for the ONT mobile app.
//
// Expo SDK 56's default config already enables package `exports` resolution and
// includes `.cjs` in sourceExts, which is all bitcoinjs-lib v7 / ecpair v3 need
// to resolve to their CommonJS builds under Hermes.
//
// The one thing we add: a defensive alias so that if anything (ours or a
// transitive dep) imports `tiny-secp256k1` (a WASM module that will not run
// under Hermes), it resolves to the pure-JS, noble-backed `@bitcoinerlab/secp256k1`
// instead. That package implements the same TinySecp256k1Interface.
const { getDefaultConfig } = require("expo/metro-config");
const { ONT_PACKAGE_ROOTS, REPO_ROOT } = require("./ont-package-roots.cjs");

const config = getDefaultConfig(__dirname);

config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), REPO_ROOT]));
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  ...ONT_PACKAGE_ROOTS,
};

const ALIASES = {
  "tiny-secp256k1": "@bitcoinerlab/secp256k1",
};

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const aliased = ALIASES[moduleName];
  const next = upstreamResolveRequest ?? context.resolveRequest;
  return next(context, aliased ?? moduleName, platform);
};

module.exports = config;
