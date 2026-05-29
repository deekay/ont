// Session-scoped record of demo actions, so the demo loop feels end-to-end:
// a simulated claim / value-set / recovery / bid is remembered and surfaced in
// "My ONT" instead of vanishing when you leave the screen. In-memory only — this
// is throwaway demo state, not ownership (real ownership lives on the resolver).
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface DemoClaim {
  readonly name: string;
  readonly anchorHeight: number;
  readonly noticeWindowCloseHeight: number;
  readonly at: string;
}
export interface DemoValue {
  readonly name: string;
  readonly valueType: number;
  readonly value: string;
  readonly sequence: number;
  readonly at: string;
}
export interface DemoRecovery {
  readonly name: string;
  readonly recoveryAddress: string;
  readonly sequence: number;
  readonly at: string;
}
export interface DemoBid {
  readonly auctionId: string;
  readonly name: string;
  readonly bidAmountSats: string;
  readonly leading: boolean;
  readonly at: string;
}

interface DemoHoldingsValue {
  readonly claims: DemoClaim[];
  readonly values: DemoValue[];
  readonly recoveries: DemoRecovery[];
  readonly bids: DemoBid[];
  recordClaim: (c: DemoClaim) => void;
  recordValue: (v: DemoValue) => void;
  recordRecovery: (r: DemoRecovery) => void;
  recordBid: (b: DemoBid) => void;
  clear: () => void;
}

const CAP = 30;
const prepend = <T,>(list: T[], item: T): T[] => [item, ...list].slice(0, CAP);

const DemoHoldingsContext = createContext<DemoHoldingsValue | null>(null);

export function DemoHoldingsProvider({ children }: { children: React.ReactNode }) {
  const [claims, setClaims] = useState<DemoClaim[]>([]);
  const [values, setValues] = useState<DemoValue[]>([]);
  const [recoveries, setRecoveries] = useState<DemoRecovery[]>([]);
  const [bids, setBids] = useState<DemoBid[]>([]);

  const recordClaim = useCallback((c: DemoClaim) => setClaims((l) => prepend(l, c)), []);
  const recordValue = useCallback((v: DemoValue) => setValues((l) => prepend(l, v)), []);
  const recordRecovery = useCallback((r: DemoRecovery) => setRecoveries((l) => prepend(l, r)), []);
  const recordBid = useCallback((b: DemoBid) => setBids((l) => prepend(l, b)), []);
  const clear = useCallback(() => {
    setClaims([]);
    setValues([]);
    setRecoveries([]);
    setBids([]);
  }, []);

  const value = useMemo<DemoHoldingsValue>(
    () => ({ claims, values, recoveries, bids, recordClaim, recordValue, recordRecovery, recordBid, clear }),
    [claims, values, recoveries, bids, recordClaim, recordValue, recordRecovery, recordBid, clear],
  );

  return <DemoHoldingsContext.Provider value={value}>{children}</DemoHoldingsContext.Provider>;
}

export function useDemoHoldings(): DemoHoldingsValue {
  const ctx = useContext(DemoHoldingsContext);
  if (!ctx) {
    throw new Error("useDemoHoldings must be used inside a DemoHoldingsProvider");
  }
  return ctx;
}
