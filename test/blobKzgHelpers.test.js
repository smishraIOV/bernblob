import { describe, it } from "node:test";
import assert from "node:assert";
import { Transaction } from "ethers";
import { loadKZG } from "kzg-wasm";
import { hexlify } from "ethers";
import { encodeJpegFileToBlob } from "../src/blobEncode.js";
import { commitmentToVersionedHash } from "../src/blobKzgHelpers.js";

describe("blobKzgHelpers", () => {
  it("commitmentToVersionedHash matches ethers Transaction blob hash", async () => {
    const kzg = await loadKZG();
    const blob = encodeJpegFileToBlob("./bern.jpeg");
    const hexBlob = hexlify(blob);
    const commitment = kzg.blobToKZGCommitment(hexBlob);

    const tx = new Transaction();
    tx.type = 3;
    tx.chainId = 11155111n;
    tx.nonce = 0;
    tx.maxPriorityFeePerGas = 1n;
    tx.maxFeePerGas = 2n;
    tx.gasLimit = 21000n;
    tx.to = "0x0000000000000000000000000000000000000001";
    tx.value = 0n;
    tx.data = "0x";
    tx.maxFeePerBlobGas = 1n;
    tx.accessList = [];
    tx.kzg = kzg;
    tx.blobs = [blob];

    assert.strictEqual(
      commitmentToVersionedHash(commitment),
      tx.blobVersionedHashes[0]
    );
  });
});
