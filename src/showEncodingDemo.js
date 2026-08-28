#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  jpegFileToPayload,
  DATA_BYTES_PER_FIELD_ELEMENT,
} from "./blobEncode.js";

function hex(buf) {
  return Buffer.from(buf).toString("hex");
}

function describePayloadByte(globalIndex, jpegLen) {
  if (globalIndex < 4) {
    const labels = ["length[0] (MSB)", "length[1]", "length[2]", "length[3] (LSB)"];
    return labels[globalIndex];
  }
  const j = globalIndex - 4;
  // SOI: Start Of Image — mandatory JPEG marker FF D8
  if (j === 0) return "JPEG SOI byte 0 (FF)  // SOI: start of image";
  if (j === 1) return "JPEG SOI byte 1 (D8)  // SOI: start of image";
  if (j < jpegLen) return `JPEG data byte ${j}`;
  return "payload padding (0x00)";
}

function lineFor(gi, byte, jpegLen) {
  return `  payload[${String(gi).padStart(5)}] = 0x${byte
    .toString(16)
    .padStart(2, "0")}  ${describePayloadByte(gi, jpegLen)}`;
}

/** Show a few head bytes, "…", then a few tail bytes (skip collapse if short). */
function printChunkSparse(chunk, off, jpegLen, headCount, tailCount) {
  const n = chunk.length;
  if (n <= headCount + tailCount) {
    for (let i = 0; i < n; i++) {
      console.log(lineFor(off + i, chunk[i], jpegLen));
    }
    return;
  }
  for (let i = 0; i < headCount; i++) {
    console.log(lineFor(off + i, chunk[i], jpegLen));
  }
  console.log(`  ...  (${n - headCount - tailCount} more bytes)`);
  for (let i = n - tailCount; i < n; i++) {
    console.log(lineFor(off + i, chunk[i], jpegLen));
  }
}

function parseArgs(argv) {
  let count = 2;
  let path = "./bern.jpeg";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) {
      count = Number(argv[++i]);
      continue;
    }
    if (!argv[i].startsWith("-")) path = argv[i];
  }
  return { count, path: resolve(path) };
}

const { count, path } = parseArgs(process.argv.slice(2));
const jpeg = readFileSync(path);
const payload = jpegFileToPayload(jpeg);
const totalFields = Math.ceil(payload.length / DATA_BYTES_PER_FIELD_ELEMENT);

console.log(`File: ${path} (${jpeg.length} bytes JPEG)`);
console.log(
  `Payload: 4-byte BE length (${jpeg.length} = 0x${jpeg.length.toString(16)}) + JPEG bytes = ${payload.length} bytes`
);
console.log(
  `Payload start (first 16 bytes): ${hex(payload.subarray(0, 16))}`
);
console.log(
  `  └─ ${hex(payload.subarray(0, 4))} | ${hex(payload.subarray(4, 16))}…`
);
console.log(
  `\nEach blob field = 0x00 (LSB in EIP-4844 LE layout) + 31 payload bytes:\n`
);

for (let field = 0; field < count; field++) {
  const off = field * DATA_BYTES_PER_FIELD_ELEMENT;
  if (off >= payload.length) break;

  const chunk = payload.subarray(off, off + DATA_BYTES_PER_FIELD_ELEMENT);
  const data = Buffer.alloc(DATA_BYTES_PER_FIELD_ELEMENT, 0);
  chunk.copy(data, 0, 0, chunk.length);
  const fieldBytes = Buffer.concat([Buffer.from([0x00]), data]);

  console.log(
    `── Field ${field} (payload bytes ${off}–${off + chunk.length - 1}) ──`
  );

  if (field === 0) {
    // length (4) + SOI (2) in full, then ellipsis, then last few of the slot
    printChunkSparse(chunk, off, jpeg.length, 6, 2);
  } else {
    printChunkSparse(chunk, off, jpeg.length, 3, 2);
  }

  if (chunk.length < DATA_BYTES_PER_FIELD_ELEMENT) {
    console.log(
      `  (slot padded to 31 bytes with ${DATA_BYTES_PER_FIELD_ELEMENT - chunk.length} trailing 0x00 in data part only)`
    );
  }
  console.log(`  data slot (31 B): ${hex(data)}`);
  console.log(`  field element (32 B):`);
  console.log(`    [0]     = 0x00  ← fixed prefix byte`);
  console.log(`    [1..31] = ${hex(data)}`);
  console.log(`    full    = ${hex(fieldBytes)}`);
  console.log();
}

const remaining = Math.max(0, totalFields - count);
console.log(
  `… then ${remaining} more field(s) for the rest of the payload, then zero-filled fields to 4096 total (128 KiB).`
);
