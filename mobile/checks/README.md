# Crypto cross-checks

Runnable proofs that the app's ported crypto matches the ONT engine byte-for-byte
and that the demo stubs fake the *service*, not the *crypto*. They import the real
app modules (`../src/...`) and the engine source (`../../packages/...`) and assert
agreement, so a regression in either side fails loudly.

```sh
npm run check:crypto
```

Runs the offline suite (no network): `accumulator`, `claim`, `value-record`,
`recovery-descriptor`, `demo-claim`, `backup`.

The `*.live.mts` checks are **not** in that suite — they POST to a live resolver
(`config.API_BASE`) and need the local signet test accounts under
`.data/private-signet-demo/`. Run one directly with the repo's tsx, e.g.:

```sh
node_modules/.bin/tsx mobile/checks/value-write.live.mts
```

Note: `recovery.live.mts` currently fails against the public `opennametags.org/api`
(the resolver supports `POST /recovery-descriptors`, but the public proxy returns
405) — run it against the tunneled resolver until the proxy allowlist is updated.
