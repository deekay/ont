// Real Esplora anchor broadcaster: builds a Bitcoin tx with an OP_RETURN
// carrying the RootAnchorEventPayload, signs it with the publisher's funding
// WIF, and POSTs the raw hex to an Esplora /tx endpoint.
//
// v0 scope: returns immediately with txid + height=0. Whether/when the tx
// confirms is the operator's concern for now; a follow-up will split the
// publisher's status into anchored (broadcast) vs confirmed (mined). The
// receipt the wallet receives is still verifiable — the inclusion proof
// validates against its own root regardless of on-chain confirmation.

import {
  encodeRootAnchorBody,
  type RootAnchorEventPayload
} from "@ont/protocol";
import { initEccLib, networks, opcodes, payments, Psbt, script as btcScript } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as tinysecp from "tiny-secp256k1";

import type { AnchorBroadcaster, AnchorBroadcastInput, AnchorBroadcastResult } from "./anchor.js";

initEccLib(tinysecp);
const ECPair = ECPairFactory(tinysecp);

export type EsploraNetwork = "main" | "signet" | "testnet" | "regtest";

export interface EsploraAnchorBroadcasterOptions {
  readonly esploraBaseUrl: string;
  readonly network: EsploraNetwork;
  readonly fundingWif: string;
  readonly feeSats: bigint;
}

interface EsploraUtxo {
  readonly txid: string;
  readonly vout: number;
  readonly value: number;
  readonly status?: { readonly confirmed?: boolean };
}

export class EsploraAnchorBroadcaster implements AnchorBroadcaster {
  readonly baseUrl: string;
  readonly network: EsploraNetwork;
  private readonly feeSats: bigint;
  private readonly bitcoinjsNetwork: ReturnType<typeof toBitcoinjsNetwork>;
  private readonly keyPair: ReturnType<typeof ECPair.fromWIF>;
  readonly fundingAddress: string;

  constructor(options: EsploraAnchorBroadcasterOptions) {
    this.baseUrl = options.esploraBaseUrl.replace(/\/+$/, "");
    this.network = options.network;
    this.feeSats = options.feeSats;
    this.bitcoinjsNetwork = toBitcoinjsNetwork(options.network);
    this.keyPair = ECPair.fromWIF(options.fundingWif, this.bitcoinjsNetwork);
    const payment = payments.p2wpkh({ pubkey: this.keyPair.publicKey, network: this.bitcoinjsNetwork });
    if (payment.address === undefined) {
      throw new Error("could not derive a P2WPKH address from the funding WIF");
    }
    this.fundingAddress = payment.address;
  }

  async broadcast(input: AnchorBroadcastInput): Promise<AnchorBroadcastResult> {
    const utxos = await this.fetchUtxos();
    if (utxos.length === 0) {
      throw new Error(
        `no confirmed UTXOs at funding address ${this.fundingAddress} — fund it first to enable anchor broadcast`
      );
    }
    const { hex, txid } = this.buildAndSign(utxos, input.payload);
    await this.postTx(hex);
    return { txid, height: 0 };
  }

  /** Pure helper exposed for tests — builds + signs without broadcasting. */
  buildAndSign(utxos: readonly EsploraUtxo[], payload: RootAnchorEventPayload): { hex: string; txid: string } {
    // Pick the largest UTXO; consume it entirely (anchor txs are small so the
    // change output is most of the input value).
    const utxo = [...utxos].sort((a, b) => b.value - a.value)[0];
    if (utxo === undefined) {
      throw new Error("no UTXOs to spend");
    }
    const totalIn = BigInt(utxo.value);
    if (totalIn < this.feeSats) {
      throw new Error(`UTXO value ${utxo.value} does not cover fee ${this.feeSats}`);
    }
    const changeValue = totalIn - this.feeSats;

    const opReturnPayload = encodeRootAnchorBody(payload);
    const opReturnScript = btcScript.compile([opcodes.OP_RETURN, Buffer.from(opReturnPayload)]);

    const psbt = new Psbt({ network: this.bitcoinjsNetwork });
    psbt.setVersion(2);

    const fundingScript = payments.p2wpkh({ pubkey: this.keyPair.publicKey, network: this.bitcoinjsNetwork }).output;
    if (fundingScript === undefined) {
      throw new Error("could not derive funding script");
    }
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: fundingScript, value: BigInt(utxo.value) }
    });
    psbt.addOutput({ script: opReturnScript, value: 0n });
    if (changeValue > 0n) {
      psbt.addOutput({ address: this.fundingAddress, value: changeValue });
    }

    psbt.signInput(0, this.keyPair);
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction(true);
    return { hex: tx.toHex(), txid: tx.getId() };
  }

  private async fetchUtxos(): Promise<EsploraUtxo[]> {
    const url = `${this.baseUrl}/address/${encodeURIComponent(this.fundingAddress)}/utxo`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`esplora UTXO lookup at ${url} returned HTTP ${res.status}`);
    }
    const parsed = (await res.json()) as EsploraUtxo[];
    return parsed.filter((u) => u.status?.confirmed === true);
  }

  private async postTx(hex: string): Promise<void> {
    const url = `${this.baseUrl}/tx`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: hex
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`esplora /tx returned HTTP ${res.status}: ${body.trim()}`);
    }
  }
}

function toBitcoinjsNetwork(network: EsploraNetwork) {
  switch (network) {
    case "main":
      return networks.bitcoin;
    case "signet":
    case "testnet":
      return networks.testnet;
    case "regtest":
      return networks.regtest;
  }
}
