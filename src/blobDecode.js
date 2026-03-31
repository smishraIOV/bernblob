import {
  BLOB_BYTE_LENGTH,
  BYTES_PER_FIELD_ELEMENT,
  DATA_BYTES_PER_FIELD_ELEMENT,
  FIELD_ELEMENTS_PER_BLOB,
} from "./blobEncode.js";

/**
 * Inverse of payloadToBlobBytes: 128 KiB blob → same payload as jpegFileToPayload produced.
 */
export function blobBytesToPayload(blob) {
  if (blob.length !== BLOB_BYTE_LENGTH) {
    throw new Error(`Expected ${BLOB_BYTE_LENGTH} bytes, got ${blob.length}`);
  }
  const parts = [];
  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    const field = blob.subarray(
      i * BYTES_PER_FIELD_ELEMENT,
      (i + 1) * BYTES_PER_FIELD_ELEMENT
    );
    if (field[0] !== 0) {
      throw new Error(`Field ${i}: expected leading 0 byte`);
    }
    parts.push(field.subarray(1, 1 + DATA_BYTES_PER_FIELD_ELEMENT));
  }
  const stream = Buffer.concat(parts);
  const jpegLen = stream.readUInt32BE(0);
  if (jpegLen > stream.length - 4) {
    throw new Error("Invalid length prefix");
  }
  return stream.subarray(4, 4 + jpegLen);
}

export function decodeBlobToJpegBytes(blob) {
  const jpeg = blobBytesToPayload(blob);
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error("Decoded bytes are not JPEG (expected FF D8)");
  }
  return jpeg;
}
