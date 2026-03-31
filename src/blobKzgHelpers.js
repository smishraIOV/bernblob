import { getBytes, sha256 } from "ethers";

/** EIP-4844: `versioned_hash = 0x01 || sha256(commitment)[1:]` (32 bytes). */
export function commitmentToVersionedHash(commitmentHex) {
  const h = sha256(getBytes(commitmentHex));
  return `0x01${h.slice(4)}`;
}
