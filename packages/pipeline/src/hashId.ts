// ids can be arbitrary strings (including full URLs), unsafe as filenames or BullMQ job ids as-is; a content hash sidesteps both. Uses Web Crypto rather than node:crypto - crypto.subtle is a global in Node 18+ and every browser, so this needs no platform split, unlike a SampleCache implementation's own read/write side.
export async function hashId(id: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(id),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
