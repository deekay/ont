import { describe, expect, it } from "vitest";

import {
  computeRecoveryDescriptorHash,
  signRecoveryDescriptor
} from "@ont/protocol";
import {
  countRecoveryDescriptors,
  getRecoveryDescriptorChain,
  parseRecoveryDescriptorStoreSnapshot
} from "./recovery-store.js";

describe("recovery descriptor store", () => {
  it("loads contiguous recovery descriptor chains", () => {
    const first = signRecoveryDescriptor({
      name: "Alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "tb1qrecoveryexample000000000000000000000000v",
      issuedAt: "2026-05-07T12:00:00.000Z"
    });
    const second = signRecoveryDescriptor({
      name: "Alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 2,
      previousDescriptorHash: computeRecoveryDescriptorHash(first),
      recoveryAddress: "tb1qrecoveryexample111111111111111111111111j",
      issuedAt: "2026-05-07T12:01:00.000Z"
    });

    const store = parseRecoveryDescriptorStoreSnapshot({
      chains: [
        {
          name: "alice",
          ownershipRef: "aa".repeat(32),
          descriptors: [first, second]
        }
      ]
    });

    const chain = getRecoveryDescriptorChain(store, "alice", "aa".repeat(32));

    expect(countRecoveryDescriptors(store)).toBe(2);
    expect(chain?.descriptors).toHaveLength(2);
    expect(chain?.descriptors[1]?.previousDescriptorHash).toBe(computeRecoveryDescriptorHash(first));
  });

  it("rejects chains with skipped sequences", () => {
    const first = signRecoveryDescriptor({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "tb1qrecoveryexample000000000000000000000000v",
      issuedAt: "2026-05-07T12:00:00.000Z"
    });
    const skipped = signRecoveryDescriptor({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 3,
      previousDescriptorHash: computeRecoveryDescriptorHash(first),
      recoveryAddress: "tb1qrecoveryexample111111111111111111111111j",
      issuedAt: "2026-05-07T12:01:00.000Z"
    });

    expect(() =>
      parseRecoveryDescriptorStoreSnapshot({
        chains: [
          {
            name: "alice",
            ownershipRef: "aa".repeat(32),
            descriptors: [first, skipped]
          }
        ]
      })
    ).toThrow(/non-contiguous sequence/);
  });

  it("rejects chains with the wrong predecessor hash", () => {
    const first = signRecoveryDescriptor({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "tb1qrecoveryexample000000000000000000000000v",
      issuedAt: "2026-05-07T12:00:00.000Z"
    });
    const badSecond = signRecoveryDescriptor({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 2,
      previousDescriptorHash: "ff".repeat(32),
      recoveryAddress: "tb1qrecoveryexample111111111111111111111111j",
      issuedAt: "2026-05-07T12:01:00.000Z"
    });

    expect(() =>
      parseRecoveryDescriptorStoreSnapshot({
        chains: [
          {
            name: "alice",
            ownershipRef: "aa".repeat(32),
            descriptors: [first, badSecond]
          }
        ]
      })
    ).toThrow(/invalid predecessor hash/);
  });
});
