import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  encodeJpegFileToBlob,
  jpegFileToPayload,
  payloadToBlobBytes,
  BLOB_BYTE_LENGTH,
  BYTES_PER_FIELD_ELEMENT,
  FIELD_ELEMENTS_PER_BLOB,
  MAX_JPEG_BYTES_FOR_ONE_BLOB,
  MAX_PAYLOAD_BYTES_PER_BLOB,
} from "../src/blobEncode.js";
import { decodeBlobToJpegBytes } from "../src/blobDecode.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const bernJpeg = join(root, "bern.jpeg");

describe("blob codec", () => {
  it("produces exactly 128 KiB blob", () => {
    const jpeg = readFileSync(bernJpeg);
    const payload = jpegFileToPayload(jpeg);
    const blob = payloadToBlobBytes(payload);
    assert.strictEqual(blob.length, BLOB_BYTE_LENGTH);
  });

  it("each field element starts with 0x00", () => {
    const blob = encodeJpegFileToBlob(bernJpeg);
    for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
      assert.strictEqual(blob[i * BYTES_PER_FIELD_ELEMENT], 0, `field ${i}`);
    }
  });

  it("round-trips bern.jpeg", () => {
    const original = readFileSync(bernJpeg);
    const blob = encodeJpegFileToBlob(bernJpeg);
    assert.deepStrictEqual(decodeBlobToJpegBytes(blob), original);
  });

  it("allows JPEG exactly at max size", () => {
    const jpeg = Buffer.alloc(MAX_JPEG_BYTES_FOR_ONE_BLOB, 0);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    const blob = payloadToBlobBytes(jpegFileToPayload(jpeg));
    assert.strictEqual(blob.length, BLOB_BYTE_LENGTH);
  });

  it("rejects JPEG larger than one blob (no spillover)", () => {
    const oversized = Buffer.alloc(MAX_JPEG_BYTES_FOR_ONE_BLOB + 1, 0);
    assert.throws(
      () => jpegFileToPayload(oversized),
      /max for one blob is/
    );
  });

  it("rejects raw payload larger than one blob", () => {
    const payload = Buffer.alloc(MAX_PAYLOAD_BYTES_PER_BLOB + 1, 0);
    assert.throws(
      () => payloadToBlobBytes(payload),
      /This demo does not use multiple blobs/
    );
  });
});
