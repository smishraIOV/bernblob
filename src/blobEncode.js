import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** One blob = 4096 BLS field elements, 32 bytes each (EIP-4844). */
export const FIELD_ELEMENTS_PER_BLOB = 4096;
export const BYTES_PER_FIELD_ELEMENT = 32;
export const DATA_BYTES_PER_FIELD_ELEMENT = 31;
export const BLOB_BYTE_LENGTH =
  FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT;

/** Max payload bytes that fit in one blob (31 data bytes per field × 4096 fields). */
export const MAX_PAYLOAD_BYTES_PER_BLOB =
  FIELD_ELEMENTS_PER_BLOB * DATA_BYTES_PER_FIELD_ELEMENT;

/** Max JPEG size: 4-byte length prefix + image must fit in MAX_PAYLOAD_BYTES_PER_BLOB. No multi-blob spillover in this demo. */
export const MAX_JPEG_BYTES_FOR_ONE_BLOB = MAX_PAYLOAD_BYTES_PER_BLOB - 4;

/** Minimal payload: BE uint32(jpeg length) || jpeg bytes. */
export function jpegFileToPayload(jpegBytes) {
  if (jpegBytes.length > 0xffffffff) {
    throw new Error("JPEG larger than 4 GiB — not supported");
  }
  if (jpegBytes.length > MAX_JPEG_BYTES_FOR_ONE_BLOB) {
    throw new Error(
      `JPEG is ${jpegBytes.length} bytes; max for one blob is ${MAX_JPEG_BYTES_FOR_ONE_BLOB} (${MAX_PAYLOAD_BYTES_PER_BLOB} payload bytes after the 4-byte length prefix). This demo does not use multiple blobs.`
    );
  }
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(jpegBytes.length, 0);
  return Buffer.concat([len, jpegBytes]);
}

/** 0x00 || up to 31 data bytes per field; pad to full blob size. */
export function payloadToBlobBytes(payload) {
  const needFields = Math.ceil(payload.length / DATA_BYTES_PER_FIELD_ELEMENT);
  if (needFields > FIELD_ELEMENTS_PER_BLOB) {
    throw new Error(
      `Payload is ${payload.length} bytes (${needFields} field elements); max is ${MAX_PAYLOAD_BYTES_PER_BLOB} bytes (${FIELD_ELEMENTS_PER_BLOB} fields). This demo does not use multiple blobs.`
    );
  }

  const parts = [];
  for (let offset = 0; offset < payload.length; offset += DATA_BYTES_PER_FIELD_ELEMENT) {
    const chunk = payload.subarray(
      offset,
      offset + DATA_BYTES_PER_FIELD_ELEMENT
    );
    const data = Buffer.alloc(DATA_BYTES_PER_FIELD_ELEMENT, 0);
    chunk.copy(data, 0, 0, chunk.length);
    const field = Buffer.allocUnsafe(BYTES_PER_FIELD_ELEMENT);
    field[0] = 0;
    data.copy(field, 1, 0, DATA_BYTES_PER_FIELD_ELEMENT);
    parts.push(field);
  }

  const body = Buffer.concat(parts);
  if (body.length > BLOB_BYTE_LENGTH) {
    throw new Error("Encoded body exceeds single blob size");
  }
  const padding = Buffer.alloc(BLOB_BYTE_LENGTH - body.length, 0);
  return Buffer.concat([body, padding]);
}

export function encodeJpegFileToBlob(imagePath) {
  const abs = resolve(imagePath);
  const jpegBytes = readFileSync(abs);
  if (jpegBytes.length < 2 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    throw new Error("File does not look like JPEG (expected FF D8)");
  }
  const payload = jpegFileToPayload(jpegBytes);
  return payloadToBlobBytes(payload);
}
