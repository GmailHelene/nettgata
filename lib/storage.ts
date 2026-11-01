import { getCloudflareContext } from "@opennextjs/cloudflare";

export type StoredObject = { body: ReadableStream | Uint8Array; contentType: string; size: number };

export interface MediaStore {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Nøklene som starter med prefix, sortert. Brukes til å rydde gamle sikkerhetskopier. */
  list(prefix: string): Promise<string[]>;
}

/** Det vi bruker av R2-bindingen. Holdt minimalt for å slippe hele workers-types. */
type R2BucketLike = {
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
};

export class StorageNotConfiguredError extends Error {}

function r2Store(bucket: R2BucketLike): MediaStore {
  return {
    async put(key, data, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return { body: obj.body, size: obj.size, contentType: obj.httpMetadata?.contentType ?? "application/octet-stream" };
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor });
        keys.push(...page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys.sort();
    },
  };
}

/** Lokalt lager i .data/media. Nøklene er validert før de kommer hit, så de kan ikke peke ut av mappen. */
async function localStore(): Promise<MediaStore> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.resolve(".data/media");
  const file = (key: string) => path.join(root, ...key.split("/"));
  return {
    async put(key, data, contentType) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), data);
      await fs.writeFile(`${file(key)}.type`, contentType);
    },
    async get(key) {
      try {
        const [data, contentType] = await Promise.all([fs.readFile(file(key)), fs.readFile(`${file(key)}.type`, "utf8")]);
        return { body: new Uint8Array(data), contentType, size: data.byteLength };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await fs.rm(file(key), { force: true });
      await fs.rm(`${file(key)}.type`, { force: true });
    },
    async list(prefix) {
      const dir = path.dirname(file(`${prefix}x`));
      const names = await fs.readdir(dir).catch(() => [] as string[]);
      const base = path.relative(root, dir).split(path.sep).filter(Boolean).join("/");
      return names
        .filter((n) => !n.endsWith(".type"))
        .map((n) => (base ? `${base}/${n}` : n))
        .filter((k) => k.startsWith(prefix))
        .sort();
    },
  };
}

let override: MediaStore | null = null;
/** Brukes av tester. */
export function setMediaStoreForTests(store: MediaStore | null) {
  override = store;
}

export async function getMediaStore(): Promise<MediaStore> {
  if (override) return override;
  // Som med PGlite: grenen fjernes ved produksjonsbygg, så node:fs aldri havner i Worker-pakken.
  if (process.env.NODE_ENV !== "production") return localStore();
  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { MEDIA?: R2BucketLike }).MEDIA;
  if (!bucket) throw new StorageNotConfiguredError("Bildelageret (R2) er ikke koblet til ennå");
  return r2Store(bucket);
}
