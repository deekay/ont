// B5-WALLET — shared taproot / PSBT helpers for the wallet's transaction builders (gift transfer, cooperative
// sale, …). The wallet is the ONE crypto-exempt surface (bitcoinjs-lib + tiny-secp256k1 live only here). The
// owner private key stays inside keyPathSigner / signOwnerSchnorr closures — it is never returned or exposed.
import { payments, networks, crypto as bcrypto, initEccLib, type Network, type Signer } from "bitcoinjs-lib";
import * as tinysecp from "tiny-secp256k1";
import { hexToBytes } from "@ont/wire";

initEccLib(tinysecp);

export type TransferNetwork = "mainnet" | "testnet" | "signet" | "regtest";

export const AUX_RAND_ZERO = new Uint8Array(32); // BIP-340 deterministic signing (auxRand = 0)

export function networkOf(net: TransferNetwork): Network {
  switch (net) {
    case "mainnet":
      return networks.bitcoin;
    case "regtest":
      return networks.regtest;
    // signet shares testnet address encoding (hrp "tb"); signet is decommissioned regardless
    case "testnet":
    case "signet":
      return networks.testnet;
  }
}

export function parseSats(value: string): bigint | null {
  if (!/^-?[0-9]+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** The owner's internal x-only pubkey (untweaked), derived from the private key. */
export function ownerXOnly(ownerPrivateKeyHex: string): Uint8Array {
  const pub = tinysecp.pointFromScalar(hexToBytes(ownerPrivateKeyHex), true);
  if (!pub) throw new Error("invalid owner private key");
  return pub.slice(1, 33);
}

/** The owner's P2TR key-path (no script tree) scriptPubKey — OP_1 <tweaked output key>. Network-independent
 *  (the witness program bytes are identical across networks), so it is a stable "is this input mine?" matcher. */
export function ownerP2trScript(ownerPrivateKeyHex: string): Uint8Array {
  const out = payments.p2tr({ internalPubkey: ownerXOnly(ownerPrivateKeyHex), network: networks.bitcoin }).output;
  if (!out) throw new Error("could not derive owner P2TR script");
  return out;
}

/** Deterministic BIP-340 schnorr signature by the owner key over a digest (ONT-layer auth, not a Bitcoin spend). */
export function signOwnerSchnorr(digest: Uint8Array, ownerPrivateKeyHex: string): Uint8Array {
  return tinysecp.signSchnorr(digest, hexToBytes(ownerPrivateKeyHex), AUX_RAND_ZERO);
}

/** A BIP-341 key-path signer over the owner key, tweaked for the (script-tree-less) taproot output, signing
 *  deterministically (auxRand = 0). The owner key stays inside this closure — never returned. */
export function keyPathSigner(ownerPrivateKeyHex: string): Signer {
  let priv = hexToBytes(ownerPrivateKeyHex);
  const pub = tinysecp.pointFromScalar(priv, true);
  if (!pub) throw new Error("invalid owner private key");
  if (pub[0] === 0x03) {
    const negated = tinysecp.privateNegate(priv);
    priv = negated;
  }
  const internalXOnly = pub.slice(1, 33);
  const tweak = bcrypto.taggedHash("TapTweak", internalXOnly);
  const tweakedPriv = tinysecp.privateAdd(priv, tweak);
  if (!tweakedPriv) throw new Error("taproot tweak produced an invalid key");
  const tweakedPub = tinysecp.pointFromScalar(tweakedPriv, true);
  if (!tweakedPub) throw new Error("taproot tweak produced an invalid point");
  return {
    publicKey: tweakedPub,
    sign() {
      throw new Error("ECDSA signing is not used for taproot key-path spends");
    },
    signSchnorr(hash: Uint8Array): Uint8Array {
      return tinysecp.signSchnorr(hash, tweakedPriv, AUX_RAND_ZERO);
    },
  };
}
