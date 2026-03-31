#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getBytes } from "ethers";
import { BLOB_BYTE_LENGTH } from "./blobEncode.js";

/**
 * Turn explorer-copied hex (optional 0x, any whitespace) into a raw blob file.
 * Usage: node src/hexToBlob.js <hex.txt> [out.blob]
 */
const inPath = process.argv[2];
const outPath = process.argv[3] ?? "./from-explorer.blob";

if (!inPath) {
  console.error(
    "Usage: node src/hexToBlob.js <hex-file.txt> [out.blob]\n" +
      "  hex-file: paste from Sepolia Etherscan blob view (full blob, one continuous hex string is fine)."
  );
  process.exit(1);
}

const raw = readFileSync(resolve(inPath), "utf8").replace(/\s+/g, "");
const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw : `0x${raw}`;
const bytes = getBytes(hex);

if (bytes.length !== BLOB_BYTE_LENGTH) {
  console.error(
    `Decoded ${bytes.length} bytes; EIP-4844 blob must be exactly ${BLOB_BYTE_LENGTH} (131072). ` +
      "Recheck you copied the full blob hex from the explorer."
  );
  process.exit(1);
}

const abs = resolve(outPath);
writeFileSync(abs, Buffer.from(bytes));
console.error(`Wrote ${bytes.length} bytes to ${abs}`);
