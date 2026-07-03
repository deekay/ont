const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

const ONT_PACKAGE_ROOTS = Object.freeze({
  "@ont/light-client": path.join(REPO_ROOT, "packages/light-client"),
  "@ont/consensus": path.join(REPO_ROOT, "packages/consensus"),
  "@ont/adapter-header": path.join(REPO_ROOT, "packages/adapter-header"),
  "@ont/bitcoin": path.join(REPO_ROOT, "packages/bitcoin"),
  "@ont/launch-config": path.join(REPO_ROOT, "packages/launch-config"),
});

module.exports = {
  REPO_ROOT,
  ONT_PACKAGE_ROOTS,
};
