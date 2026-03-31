#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { encodeJpegFileToBlob, BLOB_BYTE_LENGTH } from "./blobEncode.js";

const input = process.argv[2] || "./bern.jpeg";
const out = process.argv[3] || "./bern.blob";

const blob = encodeJpegFileToBlob(input);
writeFileSync(resolve(out), blob);
console.log(
  `Wrote ${blob.length} bytes (${BLOB_BYTE_LENGTH} expected) to ${resolve(out)}`
);
