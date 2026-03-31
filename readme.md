# Posting blobs

This is a demo that blobs can be used to store data temporarily on ethereum.

The project will use ethereum's sepolia network to store a small jpeg image as a blob. The image to use is `./bern.jpeg` which is 47KB.

Goal: post a JPEG image as a blob on ethereum's sepolia network using a private key (stored in `.env` as `PVT_KEY_0`). See `.env.example` for two parameters that users should include in .env

**PNG (or other formats):** The payload is still **4-byte length + raw file bytes**; nothing in the blob layout is JPEG-specific. This repo’s code **asserts JPEG** (`FF D8`) and uses JPEG-oriented names—you would swap those checks for PNG (or drop them) and decode to a **`.png`** file. PNG is often **larger** than JPEG for similar images, so you are **more likely to exceed** the single-blob file-size limit. KZG and the **128 KiB** blob framing are the same if the file still fits.

Steps:
Phase 1: Encode
* read JPEG as raw bytes; payload is only **4-byte big-endian length + file bytes** (no extra metadata)
* encode the payload into field elements to fill **one** EIP-4844 blob only: the on-chain blob is always 128 KiB, but with the leading `0x00` per field only **126,976 bytes** of payload fit, and the 4-byte length prefix leaves **126,972 bytes** max for the JPEG. Larger inputs are rejected; there is **no spillover** into extra blobs in this demo.
* each **32-byte** slot is one BLS field element; EIP-4844 uses **little-endian** (byte **0** = least significant, byte **31** = most significant).
* we write **byte 0 = `0x00`** then bytes **1–31** = payload (last slot padded). In file order that is still the **first** byte of each segment; in little-endian it is the **LSB**, not the MSB. A **trailing** zero would mean fixing **byte 31** (MSB)—a different convention, often used to bound the integer below 2²⁴⁸; this project keeps the LSB-zero layout and relies on the length prefix plus real data staying valid under KZG for typical JPEG sizes.
* Once all data has been encoded, we use a length prefix (4-byte big-endian JPEG size) as the logical end-of-file marker. Then pad with zero field elements so the blob is exactly **128 KiB** (4096 × 32 bytes per EIP-4844).

Phase 2: Decode
* For each 32-byte field, drop **byte index 0** (`0x00`), concatenate bytes **1–31** from each slot, then read the length prefix and JPEG as in Phase 1. Implemented in `src/blobDecode.js` (`npm run decode`).

Phase 3: Generate Commitments, Proofs
* KZG uses the same ceremony as mainnet via **[kzg-wasm](https://www.npmjs.com/package/kzg-wasm)** (WASM build of [c-kzg-4844](https://github.com/ethereum/c-kzg-4844)).
* `npm run kzg:dry-run` (or `node src/sendBlobSepolia.js --dry-run`) loads `./bern.jpeg` (or a path to a `.jpeg`/`.blob`), prints **commitment**, **proof size**, and **blob versioned hash** as JSON—no RPC or keys.

Phase 4: Send the transaction
* Set **`SEPOLIA_RPC_URL`** and **`PVT_KEY_0`** in `.env` (hex key, with or without `0x`). Use an RPC that supports **blob transactions** (many free tiers do not).
* `npm run send:sepolia` builds a **type-3** self-transfer (`to` = your address, empty calldata) with one blob sidecar and broadcasts to Sepolia. Optional: pass a path to `.jpeg` or `.blob` as the first argument.
* Example (this repo’s demo): tx [`0x633071f81ee0082492bdc42f367c02cfdd001ca79ef44f91c8d1fb95c6df2725`](https://sepolia.etherscan.io/tx/0x633071f81ee0082492bdc42f367c02cfdd001ca79ef44f91c8d1fb95c6df2725), blob on Etherscan [`…016e3f9e3b…`](https://sepolia.etherscan.io/blob/0x016e3f9e3bcc5111610495a4857be446fa8d46bc112bcb10f608d5f1a59019dc?bid=18365159).


Phase 5: Test
* **Blobscan (recommended):** [Sepolia Blobscan](https://sepolia.blobscan.com/) indexes blobs and exposes a REST API; each blob lists storage URLs (e.g. Google Cloud `.bin` files with the raw **131072** bytes).  
  `npm run fetch:blobscan -- <txHash> [out.blob]` calls `https://api.sepolia.blobscan.com/transactions/<txHash>`, downloads the first blob’s file, and writes `out.blob` (default `./from-blobscan.blob`). Add `--decode from-blobscan.jpeg` to run the same decoder as Phase 2. Example tx on Blobscan: [same hash as Phase 4](https://sepolia.blobscan.com/tx/0x633071f81ee0082492bdc42f367c02cfdd001ca79ef44f91c8d1fb95c6df2725). For Ethereum mainnet use `--mainnet` or set **`BLOBSCAN_API_BASE`** (see [Blobscan API docs](https://docs.blobscan.com/docs/api)).
* **Etherscan (manual hex):** On [Sepolia Etherscan](https://sepolia.etherscan.io/), open the blob (e.g. from the Phase 4 example link) and copy the **full** blob as hex into a text file, e.g. `explorer-blob.hex` (Etherscan may show `0x…` with line breaks; that is fine).
* `npm run hex:blob -- explorer-blob.hex from-explorer.blob` — normalizes hex and writes a **131072-byte** raw blob (fails if the paste is incomplete).
* `npm run decode -- from-explorer.blob from-explorer.jpeg` — same path as Phase 2 (`src/blobDecode.js`).
* Compare to the original: `cmp bern.jpeg from-explorer.jpeg` (no output means identical), or open both images.