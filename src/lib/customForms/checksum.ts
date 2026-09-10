/**
 * Deterministic checksums for template structures.
 *
 * Kept free of database and browser dependencies so the regression harness can
 * import it directly.
 */

/**
 * JSON with object keys sorted, so the same structure always produces the same
 * text regardless of how it was built or parsed.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(",")}}`;
}

/**
 * sha256 of the canonical JSON, hex encoded. Returns null where WebCrypto is
 * unavailable (an insecure context); the checksum column is nullable for
 * exactly that reason.
 */
export async function structureChecksum(
  structure: unknown,
): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(canonicalJson(structure));
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
