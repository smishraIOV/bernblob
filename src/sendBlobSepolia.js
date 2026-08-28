import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Wallet, JsonRpcProvider, hexlify } from "ethers";
import { loadKZG } from "kzg-wasm";
import { encodeJpegFileToBlob, BLOB_BYTE_LENGTH } from "./blobEncode.js";
import { commitmentToVersionedHash } from "./blobKzgHelpers.js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v?.trim()) {
    console.error(`Missing ${name} (set in .env or the environment).`);
    process.exit(1);
  }
  return v.trim();
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const pos = argv.filter((a) => a !== "--dry-run");
  return { dryRun, inputPath: pos[0] ? resolve(pos[0]) : null };
}

function loadBlobBytes(inputPath) {
  if (inputPath && inputPath.endsWith(".blob")) {
    const buf = readFileSync(inputPath);
    if (buf.length !== BLOB_BYTE_LENGTH) {
      throw new Error(
        `Expected ${BLOB_BYTE_LENGTH}-byte .blob file, got ${buf.length}`
      );
    }
    return buf;
  }
  const jpegPath = inputPath ?? resolve("./bern.jpeg");
  return encodeJpegFileToBlob(jpegPath);
}

async function readBlobBaseFee(provider) {
  for (const method of ["eth_blobBaseFee", "eth_getBlobBaseFee"]) {
    try {
      const hex = await provider.send(method, []);
      if (hex) return BigInt(hex);
    } catch {
      /* try next */
    }
  }
  return null;
}

async function main() {
  const { dryRun, inputPath } = parseArgs(process.argv.slice(2));
  const blob = loadBlobBytes(inputPath);

  console.error("Loading KZG WASM (trust setup + wasm; can take a few seconds)…");
  const kzg = await loadKZG();
  const blobHex = hexlify(blob);
  const commitment = kzg.blobToKZGCommitment(blobHex);
  const proof = kzg.computeBlobKZGProof(blobHex, commitment);
  const versionedHash = commitmentToVersionedHash(commitment);

  console.log(
    JSON.stringify(
      {
        commitment,
        proofByteLength: (proof.length - 2) / 2,
        blobVersionedHash: versionedHash,
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.error("Dry run: not connecting to RPC or broadcasting.");
    return;
  }

  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  let pk = requireEnv("PVT_KEY_0");
  if (!pk.startsWith("0x")) pk = `0x${pk}`;

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(pk, provider);
  const to = await wallet.getAddress();

  const feeData = await provider.getFeeData();
  if (feeData.maxFeePerGas == null || feeData.maxPriorityFeePerGas == null) {
    throw new Error(
      "RPC did not return EIP-1559 fees (maxFeePerGas / maxPriorityFeePerGas). Try another Sepolia endpoint."
    );
  }

  let maxFeePerBlobGas = 3_000_000_000n;
  const blobFee = await readBlobBaseFee(provider);
  if (blobFee != null) {
    maxFeePerBlobGas = blobFee * 2n + blobFee / 2n;
    console.error(
      `Using maxFeePerBlobGas ${maxFeePerBlobGas} (from network blob base fee ${blobFee})`
    );
  } else {
    console.error(
      `No eth_blobBaseFee from RPC; using fallback maxFeePerBlobGas ${maxFeePerBlobGas}`
    );
  }

  const txRequest = {
    type: 3,
    to,
    value: 0n,
    data: "0x",
    gasLimit: 100_000n,
    maxFeePerGas: (feeData.maxFeePerGas * 3n) / 2n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    maxFeePerBlobGas,
    accessList: [],
    kzg,
    blobs: [blob],
  };

  console.error("Broadcasting type-3 tx…");
  const tx = await wallet.sendTransaction(txRequest);
  console.log(tx.hash);
  console.error(
    `Etherscan tx: https://sepolia.etherscan.io/tx/${tx.hash}#blobs`
  );
  const vh =
    (tx.blobVersionedHashes && tx.blobVersionedHashes[0]) || versionedHash;
  if (vh) {
    console.error(`Etherscan blob: https://sepolia.etherscan.io/blob/${vh}`);
  }
  console.error("Waiting for 1 confirmation…");
  await tx.wait(1);
  console.error("Confirmed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
