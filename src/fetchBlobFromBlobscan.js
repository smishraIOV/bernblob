#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeBlobToJpegBytes } from "./blobDecode.js";
import { BLOB_BYTE_LENGTH } from "./blobEncode.js";

const DEFAULT_API_SEPOLIA = "https://api.sepolia.blobscan.com";
const DEFAULT_API_MAINNET = "https://api.blobscan.com";

function parseArgs(argv) {
  let decodeOut = null;
  let blobIndex = 0;
  let apiBase = null;
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--decode" && argv[i + 1]) {
      decodeOut = argv[++i];
      continue;
    }
    if (a === "--blob-index" && argv[i + 1]) {
      blobIndex = Number(argv[++i]);
      if (!Number.isInteger(blobIndex) || blobIndex < 0) {
        throw new Error("--blob-index must be a non-negative integer");
      }
      continue;
    }
    if (a === "--api" && argv[i + 1]) {
      apiBase = argv[++i].replace(/\/$/, "");
      continue;
    }
    if (a === "--mainnet") {
      apiBase = DEFAULT_API_MAINNET;
      continue;
    }
    pos.push(a);
  }
  let txHash = pos[0];
  const outBlob = pos[1] ?? "./from-blobscan.blob";
  if (txHash && !txHash.startsWith("0x")) txHash = `0x${txHash}`;
  return { txHash, outBlob, decodeOut, blobIndex, apiBase };
}

async function main() {
  let apiBase =
    process.env.BLOBSCAN_API_BASE?.replace(/\/$/, "") || DEFAULT_API_SEPOLIA;

  const { txHash, outBlob, decodeOut, blobIndex, apiBase: apiFlag } =
    parseArgs(process.argv.slice(2));
  if (apiFlag) apiBase = apiFlag;

  if (!txHash) {
    console.error(
      "Download raw EIP-4844 blob bytes via Blobscan API (see https://docs.blobscan.com/docs/api) and linked storage (e.g. Google Cloud).\n" +
        "\n" +
        "Usage: node src/fetchBlobFromBlobscan.js <txHash> [out.blob] [options]\n" +
        "  --decode <out.jpeg>   also decode with src/blobDecode.js\n" +
        "  --blob-index <n>      which blob index if the tx has multiple (default 0)\n" +
        "  --mainnet             use https://api.blobscan.com (default: Sepolia)\n" +
        "  --api <base>          override API base URL\n" +
        "\n" +
        "Env: BLOBSCAN_API_BASE — default Sepolia: " +
        DEFAULT_API_SEPOLIA
    );
    process.exit(1);
  }

  const txUrl = `${apiBase}/transactions/${txHash}`;
  const txRes = await fetch(txUrl);
  if (!txRes.ok) {
    const t = await txRes.text();
    throw new Error(`Blobscan tx ${txRes.status}: ${txUrl}\n${t.slice(0, 500)}`);
  }
  const tx = await txRes.json();
  const blobs = tx.blobs;
  if (!Array.isArray(blobs) || blobs.length === 0) {
    throw new Error("Transaction has no blobs in Blobscan response");
  }
  if (blobIndex >= blobs.length) {
    throw new Error(`--blob-index ${blobIndex} out of range (${blobs.length} blobs)`);
  }

  const refs = blobs[blobIndex].dataStorageReferences;
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new Error("No dataStorageReferences for this blob (index " + blobIndex + ")");
  }

  const storageUrl = refs.find((r) => r.url)?.url;
  if (!storageUrl) {
    throw new Error("No download URL in dataStorageReferences");
  }

  const binRes = await fetch(storageUrl);
  if (!binRes.ok) {
    throw new Error(`Blob download ${binRes.status}: ${storageUrl}`);
  }
  const buf = Buffer.from(await binRes.arrayBuffer());

  if (buf.length !== BLOB_BYTE_LENGTH) {
    throw new Error(
      `Expected ${BLOB_BYTE_LENGTH} bytes from storage, got ${buf.length}`
    );
  }

  const absBlob = resolve(outBlob);
  writeFileSync(absBlob, buf);
  console.error(`Wrote ${buf.length} bytes to ${absBlob}`);

  if (decodeOut) {
    const jpeg = decodeBlobToJpegBytes(buf);
    const absJpeg = resolve(decodeOut);
    writeFileSync(absJpeg, jpeg);
    console.error(`Decoded JPEG: ${jpeg.length} bytes -> ${absJpeg}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
