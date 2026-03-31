#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeBlobToJpegBytes } from "./blobDecode.js";

const input = process.argv[2] || "./bern.blob";
const out = process.argv[3] || "./bern.decoded.jpeg";

const blob = readFileSync(resolve(input));
const jpeg = decodeBlobToJpegBytes(blob);
writeFileSync(resolve(out), jpeg);
console.log(`Wrote ${jpeg.length} bytes to ${resolve(out)}`);
