import { describe, expect, it } from "vitest";
import { shapeRawReadQuery, type RawReadCommand } from "./shape-read-query.js";
import { renderResolverRaw } from "./render-read.js";
import type { CliReadPort, ResolverRawRead, ResolverRawQuery } from "./read-port.js";

// B5-CLI raw-read sub-slice red battery (lean ii): the 5 single/activity reads display the resolver's raw JSON
// under a stamped envelope. Shaping produces a discriminated ResolverRawQuery (never an endpoint string);
// renderResolverRaw carries the envelope stamps EXACTLY + passes data through unchanged; wrong/missing stamps →
// unavailable (authority never inferred from payload). RED until the cores land (stubs).

const NAME_KEYED: readonly RawReadCommand[] = ["get-name", "get-value", "get-recovery-descriptor", "get-name-activity"];
const ENV: ResolverRawRead = { provenance: "resolver-indexed-mirror", authority: "not-ownership-authority", data: { any: "opaque-json", n: 1 } };

describe("shapeRawReadQuery", () => {
  it("name-keyed reads → query {command, name} (canonical)", () => {
    for (const command of NAME_KEYED) {
      const r = shapeRawReadQuery(command, "alice");
      expect(r.ok).toBe(true);
      if (r.ok && r.query.command !== "list-activity") {
        expect(r.query.command).toBe(command);
        expect(r.query.name).toBe("alice");
      }
    }
  });
  it("list-activity → query {command:'list-activity'} (no arg)", () => {
    const r = shapeRawReadQuery("list-activity");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.query.command).toBe("list-activity");
  });
  it("name-keyed with non-canonical name → reject (don't normalize)", () => {
    const r = shapeRawReadQuery("get-name", "Alice");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("non-canonical-name");
  });
  it("unknown command → unknown-command (never throws)", () => {
    let r: ReturnType<typeof shapeRawReadQuery> | undefined;
    expect(() => { r = shapeRawReadQuery("frobnicate" as unknown as RawReadCommand, "x"); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("renderResolverRaw", () => {
  it("valid envelope → view carries stamps exactly + data unchanged", () => {
    const r = renderResolverRaw(ENV);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.provenance).toBe("resolver-indexed-mirror");
    expect(r.view.authority).toBe("not-ownership-authority");
    expect(r.view.data).toBe(ENV.data); // passed through unchanged (same reference)
  });
  it("wrong/missing stamps → unavailable (never infer authority from payload)", () => {
    const wrongAuthority = { provenance: "resolver-indexed-mirror", authority: "owned", data: {} } as unknown as ResolverRawRead;
    const missingStamps = { data: { authority: "not-ownership-authority" } } as unknown as ResolverRawRead;
    expect(renderResolverRaw(wrongAuthority).ok).toBe(false);
    expect(renderResolverRaw(missingStamps).ok).toBe(false);
  });
  it("malformed envelope → unavailable (never throws)", () => {
    let r: ReturnType<typeof renderResolverRaw> | undefined;
    expect(() => { r = renderResolverRaw(null as unknown as ResolverRawRead); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("raw-read walkthrough — shape → mocked port → render (hermetic)", () => {
  const mockPort: Pick<CliReadPort, "fetchResolverRaw"> = {
    fetchResolverRaw: async (query: ResolverRawQuery): Promise<ResolverRawRead> => ({
      provenance: "resolver-indexed-mirror",
      authority: "not-ownership-authority",
      data: { echoedCommand: query.command },
    }),
  };
  it("get-name: shape → fetchResolverRaw → renderResolverRaw stamps + data", async () => {
    const q = shapeRawReadQuery("get-name", "alice");
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const env = await mockPort.fetchResolverRaw(q.query);
    expect(env).not.toBeNull();
    const r = renderResolverRaw(env!);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.view.authority).toBe("not-ownership-authority");
  });
  it("list-activity: shape (no arg) → fetchResolverRaw → render", async () => {
    const q = shapeRawReadQuery("list-activity");
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const env = await mockPort.fetchResolverRaw(q.query);
    const r = renderResolverRaw(env!);
    expect(r.ok).toBe(true);
  });
});
