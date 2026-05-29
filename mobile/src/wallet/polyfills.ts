// Crypto/runtime polyfills for the on-device wallet.
//
// MUST be imported before any code that touches bitcoinjs-lib, ecpair, or
// @noble/* so the globals exist when those modules initialise.
//
//  - Buffer: bs58check / wif / ecpair internals and our own key code expect a
//    global Buffer. React Native / Hermes does not provide one.
//  - crypto.getRandomValues: @noble/curves uses it for Schnorr auxiliary
//    randomness; we back it with expo-crypto's CSPRNG (iOS SecRandomCopyBytes).
import { Buffer } from "buffer";
import * as Crypto from "expo-crypto";

const g = globalThis as unknown as {
  Buffer?: typeof Buffer;
  crypto?: { getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T };
};

if (typeof g.Buffer === "undefined") {
  g.Buffer = Buffer;
}

if (typeof g.crypto === "undefined") {
  g.crypto = {};
}

if (typeof g.crypto.getRandomValues !== "function") {
  g.crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
    if (array == null) {
      return array;
    }
    return Crypto.getRandomValues(array as unknown as Parameters<typeof Crypto.getRandomValues>[0]) as unknown as T;
  });
}

export {};
