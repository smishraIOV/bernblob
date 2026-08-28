# Posting blobs

A demo to illustrate how blobs can be used to store data temporarily on ethereum

The project will use ethereum's sepolia test network to store a small jpeg image as a blob. The image to use is `./bern.jpeg` which is 47KB.

Goal: post a JPEG image as a blob on ethereum's sepolia network using a private key (stored in `.env` as `PVT_KEY_0`). See `.env.example` for two parameters that users should include in .env

This repo’s code **asserts JPEG** (`FF D8`) for image start of image and (`FF D9`) for end of image. PNG is often **larger** than JPEG for similar images, so you are **more likely to exceed** the single-blob file-size limit. KZG and the **128 KiB** blob framing are the same if the file still fits. Of course, the idea used here can be used for any underlying data - we just need it to encode into valid 128KB blob.

Steps:
Phase 1: Encode
* read JPEG as raw bytes; payload is only **4-byte big-endian length + file bytes** (no extra metadata)
* encode the payload into field elements to fill **one** EIP-4844 blob only: the on-chain blob is always 128 KiB, but with the leading `0x00` per field only **126,976 bytes** of payload fit, and the 4-byte length prefix leaves **126,972 bytes** max for the JPEG. Larger inputs are rejected; there is **no spillover** into extra blobs in this demo.
* each **32-byte** slot is one BLS field element; EIP-4844 uses **little-endian** (byte **0** = least significant, byte **31** = most significant).
* we write **byte 0 = `0x00`** then bytes **1–31** = payload (last slot padded). In file order that is still the **first** byte of each segment; in little-endian it is the **LSB**, not the MSB. A **trailing** zero would mean fixing **byte 31** (MSB)—a different convention, often used to bound the integer below 2²⁴⁸; this project keeps the LSB-zero layout and relies on the length prefix plus real data staying valid under KZG for typical JPEG sizes.
* Once all data has been encoded, we use a length prefix (4-byte big-endian JPEG size) as the logical end-of-file marker. Then pad with zero field elements so the blob is exactly **128 KiB** (4096 × 32 bytes per EIP-4844).
* To see the first two field elements visually: `npm run demo:encode` (`src/showEncodingDemo.js`). Example output for `./bern.jpeg`:

```
File: ./bern.jpeg (46574 bytes JPEG)
Payload: 4-byte BE length (46574 = 0xb5ee) + JPEG bytes = 46578 bytes
Payload start (first 16 bytes): 0000b5eeffd8ffe000104a4649460001
  └─ 0000b5ee | ffd8ffe000104a4649460001…

Each blob field = 0x00 (LSB in EIP-4844 LE layout) + 31 payload bytes:

── Field 0 (payload bytes 0–30) ──
  payload[    0] = 0x00  length[0] (MSB)
  payload[    1] = 0x00  length[1]
  payload[    2] = 0xb5  length[2]
  payload[    3] = 0xee  length[3] (LSB)
  payload[    4] = 0xff  JPEG SOI byte 0 (FF)  // SOI: start of image
  payload[    5] = 0xd8  JPEG SOI byte 1 (D8)  // SOI: start of image
  ...  (23 more bytes)
  payload[   29] = 0x02  JPEG data byte 25
  payload[   30] = 0x01  JPEG data byte 26
  data slot (31 B): 0000b5eeffd8ffe000104a46494600010100000100010000ffdb0043000201
  field element (32 B):
    [0]     = 0x00  ← fixed prefix byte
    [1..31] = 0000b5eeffd8ffe000104a46494600010100000100010000ffdb0043000201
    full    = 000000b5eeffd8ffe000104a46494600010100000100010000ffdb0043000201

── Field 1 (payload bytes 31–61) ──
  payload[   31] = 0x01  JPEG data byte 27
  payload[   32] = 0x01  JPEG data byte 28
  payload[   33] = 0x01  JPEG data byte 29
  ...  (26 more bytes)
  payload[   60] = 0x05  JPEG data byte 56
  payload[   61] = 0x06  JPEG data byte 57
  data slot (31 B): 01010101020101010202020202040302020202050404030406050606060506
  field element (32 B):
    [0]     = 0x00  ← fixed prefix byte
    [1..31] = 01010101020101010202020202040302020202050404030406050606060506
    full    = 0001010101020101010202020202040302020202050404030406050606060506

… then 1501 more field(s) for the rest of the payload, then zero-filled fields to 4096 total (128 KiB).
```

Phase 2: Decode
* For each 32-byte field, drop **byte index 0** (`0x00`), concatenate bytes **1–31** from each slot, then read the length prefix and JPEG as in Phase 1. Implemented in `src/blobDecode.js` (`npm run decode`).

Phase 3: Generate Commitments, Proofs
* KZG uses the same ceremony as mainnet via **[kzg-wasm](https://www.npmjs.com/package/kzg-wasm)** (WASM build of [c-kzg-4844](https://github.com/ethereum/c-kzg-4844)).
* `npm run kzg:dry-run` (or `node src/sendBlobSepolia.js --dry-run`) loads `./bern.jpeg` (or a path to a `.jpeg`/`.blob`), prints **commitment**, **proof size**, and **blob versioned hash** as JSON—no RPC or keys.

Phase 4: Send the transaction
* Set **`SEPOLIA_RPC_URL`** (e.g. Infura Sepolia HTTPS endpoint) and **`PVT_KEY_0`** in `.env` (hex key, with or without `0x`). Use an RPC that supports **blob transactions** (many free tiers do not). Infura is for **broadcast only**—execution RPCs typically do **not** return the raw 128 KiB blob bytes.
* `npm run send:sepolia` builds a **type-3** self-transfer (`to` = your address, empty calldata) with one blob sidecar and broadcasts to Sepolia. Optional: pass a path to `.jpeg` or `.blob` as the first argument. On success it prints Sepolia Etherscan links for the tx and blob versioned hash.
* Example (this repo’s demo): tx [`0xf8e6d04142e7722c6d396342f04bc8d79251fb549d1b53893b4d44966f09e0c0`](https://sepolia.etherscan.io/tx/0xf8e6d04142e7722c6d396342f04bc8d79251fb549d1b53893b4d44966f09e0c0#blobs), blob on Etherscan [`0x016e3f9e3bcc5111610495a4857be446fa8d46bc112bcb10f608d5f1a59019dc`](https://sepolia.etherscan.io/blob/0x016e3f9e3bcc5111610495a4857be446fa8d46bc112bcb10f608d5f1a59019dc?bid=24613657).

Phase 5: Test (Sepolia Etherscan, manual hex from explorer)
1. Open the tx **Blobs** tab: `https://sepolia.etherscan.io/tx/<hash>#blobs` (example above).
2. Follow the blob versioned-hash link to the blob page (Etherscan may append `?bid=…`).
3. Copy the **full** blob hex into a text file, e.g. `explorer-blob.hex` (`0x` and line breaks are fine).
4. `npm run hex:blob -- explorer-blob.hex from-explorer.blob` — normalizes hex and writes a **131072-byte** raw blob (fails if the paste is incomplete).
5. `npm run decode -- from-explorer.blob from-explorer.jpeg` — same path as Phase 2 (`src/blobDecode.js`).
6. Compare to the original: `cmp bern.jpeg from-explorer.jpeg` (no output means identical), or open both images.