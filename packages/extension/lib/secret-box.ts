import * as z from "zod";

/**
 * Encrypts provider API keys at rest. The AES-GCM key is generated once, marked non-extractable
 * and kept in IndexedDB, so a copied chrome.storage dump, sync data or backup doesn't contain a
 * usable API key. It doesn't stop malware running as the user, which can use the same profile.
 */
const DB_NAME = "claymod-secrets";
const STORE = "keys";
const KEY_ID = "provider-api-key";

export const sealedSchema = z.object({ iv: z.string(), data: z.string() });
export type Sealed = z.infer<typeof sealedSchema>;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function openDb(): Promise<IDBDatabase> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  return request(open);
}

let cached: Promise<CryptoKey> | undefined;

async function loadOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb();
  try {
    const existing = await request(db.transaction(STORE).objectStore(STORE).get(KEY_ID));
    if (existing instanceof CryptoKey) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    try {
      await request(db.transaction(STORE, "readwrite").objectStore(STORE).add(key, KEY_ID));
      return key;
    } catch {
      // Another Claymod page created the key at the same moment: use that one.
      const winner = await request(db.transaction(STORE).objectStore(STORE).get(KEY_ID));
      if (winner instanceof CryptoKey) return winner;
      throw new Error("Couldn't store the encryption key.");
    }
  } finally {
    db.close();
  }
}

function encryptionKey(): Promise<CryptoKey> {
  cached ??= loadOrCreateKey().catch((error) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function seal(plain: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(plain),
  );
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/** undefined when the key is gone (site data cleared) or the data was tampered with. */
export async function unseal(sealed: Sealed): Promise<string | undefined> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.iv) },
      await encryptionKey(),
      fromBase64(sealed.data),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return undefined;
  }
}
