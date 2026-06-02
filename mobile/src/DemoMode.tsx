// App-wide demo-mode flag.
//
// When on, Lexe-shaped pieces that don't exist on the private signet (the
// Lightning payment for a cheap-rail claim; cloud backup) are stubbed locally so
// the whole app is walkable end to end. Only the external service is faked — the
// cryptographic verification still runs. Defaults from config.DEMO_MODE_DEFAULT;
// toggled at runtime on the Wallet screen.
import React, { createContext, useContext, useMemo, useState } from "react";

import { DEMO_MODE_DEFAULT } from "./config";

interface DemoModeValue {
  readonly demo: boolean;
  setDemo: (value: boolean) => void;
}

const DemoModeContext = createContext<DemoModeValue | null>(null);

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [demo, setDemo] = useState(DEMO_MODE_DEFAULT);
  const value = useMemo<DemoModeValue>(() => ({ demo, setDemo }), [demo]);
  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode(): DemoModeValue {
  const ctx = useContext(DemoModeContext);
  if (!ctx) {
    throw new Error("useDemoMode must be used inside a DemoModeProvider");
  }
  return ctx;
}
