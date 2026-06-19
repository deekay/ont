import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // scripts/*.test.mjs (if any) are standalone node scripts with their own
    // runners, not vitest suites. Vitest's default glob would otherwise pick them
    // up and report a confusing "no test suite found" failure on every run.
    exclude: [...configDefaults.exclude, "scripts/**"]
  }
});
