# Clean Web Server

## Purpose

`@ont/web` is the clean runnable explorer web server. It wraps the existing server-rendered explorer views in
an HTTP shell so the read/display surface can run as a process.

## Scope

- The server is routing and rendering only.
- It consumes the existing pure render functions and an injected `WebReadPort`.
- It returns HTML for explorer views and JSON only for health/errors.
- It preserves `resolver-indexed-mirror`, `bitcoin-chain`, and `not-ownership-authority` copy from the renderers.
- It does not hold keys, sign, fetch live network data, import `legacy/`, or reimplement resolver/indexer/consensus rules.

## Tests

- In-process HTTP handler tests use mocked read ports; no live network.
- Routes must dispatch to the existing name, tx, and landing renderers.
- Invalid queries must not touch the port.
- Unsupported methods, unknown routes, and handler failures must return explicit responses and never throw.
