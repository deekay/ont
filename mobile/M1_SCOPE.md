# Mobile M1 scope — package boundary decision

Read-only decision note. No packaging edits are included here.

Last updated: 2026-06-17.

## Context

M0 restored mobile conformance after the clean-stack rebuild:

- `mobile` typechecks under Expo SDK 56.
- `npm run check:crypto` proves the mobile Hermes-safe ports match clean `@ont/protocol`, `@ont/wire`, and `@ont/bitcoin` entrypoints under the Node/tsx check harness.
- Runtime mobile code still avoids direct `@ont/*` imports; this is deliberate until Metro/Hermes compatibility is proven.

Current package boundary:

- Root npm workspaces are `apps/*` and `packages/*`; `mobile/` is not a root workspace.
- `mobile/package.json` is a separate Expo app package named `mobile`, with Expo `~56.0.6`, React `19.2.3`, and React Native `0.85.3`.
- `mobile/metro.config.js` extends `expo/metro-config` and only adds the existing `tiny-secp256k1` -> `@bitcoinerlab/secp256k1` resolver alias.

## Expo / Metro constraints

Sources read:

- Expo SDK 56 reference: <https://docs.expo.dev/versions/v56.0.0/>
- Expo monorepos guide: <https://docs.expo.dev/guides/monorepos/>
- Expo SDK 56 Metro config reference: <https://docs.expo.dev/versions/v56.0.0/config/metro/>

Constraints that matter for this repo:

- Expo SDK 56 targets React Native `0.85`, React `19.2.3`, minimum Node `22.13.x`, iOS `16.4+`, and Xcode `26.4+`.
- Expo has first-class monorepo/workspace support, and SDK 52+ automatically configures Metro for monorepos when the app uses `expo/metro-config`.
- Expo explicitly says old manual monorepo Metro settings should not be carried forward blindly: `watchFolders`, `resolver.nodeModulesPath(s)`, `resolver.extraNodeModules`, and `resolver.disableHierarchicalLookup` should be avoided unless a specific tested need remains.
- Custom Metro resolution is allowed by chaining `config.resolver.resolveRequest` and falling back to the default resolver. The current mobile alias follows that shape.
- Monorepos increase dependency-resolution complexity. Expo calls out duplicate React Native, React, Turbo, and Expo module versions as runtime/build risks; native modules should not be duplicated.
- Metro/package `exports` behavior can expose incompatibilities in packages that are not prepared for Metro's resolver. Disabling package exports is an escape hatch, not a default plan.

## Options

### Option A — keep `mobile/` separate

Keep the current shape: mobile remains outside root workspaces and imports clean `@ont/*` packages only from the offline check harness.

Pros:

- Lowest risk to a working Expo app.
- Preserves the Hermes-safe runtime ports that M0 just proved against the clean stack.
- Avoids root workspace native dependency churn and duplicate React/React Native risk.

Cons:

- Root `npm test` / `npm run typecheck --workspaces` will not include mobile.
- Mobile runtime code stays duplicated by design, with `check:crypto` as the guardrail.

### Option B — register mobile as a workspace app, keep runtime ports

Add `mobile` to root workspaces but do not rename it to `@ont/mobile` and do not change runtime imports. Root scripts may then include mobile typecheck/check hooks deliberately.

Pros:

- Better root-level visibility for mobile gates.
- Keeps Expo app identity clear: this is an app, not a reusable package.
- Still avoids direct Hermes runtime consumption of server-oriented `@ont/*` packages.

Cons:

- Root npm install will now consider mobile's Expo/native dependencies, so duplicate React/React Native/Expo module checks become mandatory.
- The current root workspace build/test rhythm may need exclusions or explicit script naming to avoid surprising mobile runs.

### Option C — convert runtime mobile to `@ont/mobile` consuming `@ont/*`

Rename/register mobile as `@ont/mobile` and start importing clean ONT packages directly in runtime code.

Pros:

- Strongest single-source-of-truth story.
- Fewer hand-ported crypto/protocol modules over time.

Cons:

- Highest risk. Several clean packages are not proven Hermes-safe runtime dependencies, and some include Node/server-oriented or native-sensitive transitive dependencies.
- Could pull incompatible crypto, BIP322, or Bitcoin dependencies into the React Native bundle.
- Requires a deliberate Metro/Hermes compatibility matrix before code moves.

## Recommendation

Choose **Option A for now**, and make M1 a compatibility spike before any package move.

The overnight goal is already complete: four clean runnable apps plus mobile M0. The next question is not "can mobile conform?" but "which package boundary keeps Expo reliable while reducing duplication?" That is an architecture decision and should not be changed opportunistically.

Recommended M1 sequence:

1. Keep `mobile/` separate and committed as-is.
2. Create a read-only compatibility matrix for direct runtime imports of each candidate package: `@ont/protocol`, `@ont/wire`, `@ont/bitcoin`, and any adapter that mobile might consume later.
3. For each package, run a Metro/Hermes spike in a throwaway branch:
   - import one public package entrypoint from mobile runtime code;
   - `npm run typecheck`;
   - `npx expo start --clear` or equivalent bundle smoke;
   - iOS simulator launch smoke;
   - `npm run check:crypto`.
4. Only after the spike is green decide whether to:
   - stay separate with conformance checks only;
   - register `mobile` as a root workspace app while keeping runtime ports; or
   - introduce a narrower mobile-safe package/subpath for runtime imports.

## Decision criteria

M1 should be considered safe only if all of these hold:

- No duplicate React, React Native, Expo, Turbo, or native module versions after installation.
- Metro config still extends `expo/metro-config`; any resolver customization is minimal and chained to the default resolver.
- No direct imports of package internals (`packages/*/src`, `dist`, or `legacy`) from mobile runtime.
- Hermes bundle and simulator launch succeed with the candidate import.
- `mobile` typecheck and `check:crypto` remain green.
- The mobile trust boundary remains explicit: the app signs/verifies locally; resolver/indexer/publisher data is never treated as ownership authority without the existing proof checks.

## Non-goals for M1

- No mainnet activation.
- No live writes or bids.
- No BDK/Rust bridge work.
- No migration of mobile UI state or screens.
- No broad root workspace/package-lock churn without an explicit DK decision.
