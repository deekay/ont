import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // scripts/*.test.mjs are standalone node scripts with their own runners
    // (e.g. private-signet-auto-mine.test.mjs, run via npm run
    // test:private-signet-auto-mine-script). Vitest's default glob picks them up
    // and reports a confusing "no test suite found" failure on every run.
    exclude: [...configDefaults.exclude, "scripts/**"]
  }
});
