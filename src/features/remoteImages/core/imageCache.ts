// 外の画像の覚え（ディスク）。チャットとノートで同じ形: 範囲（チャットの ID・ノートの範囲の ID）ごとのフォルダに、URL の SHA-256 の名前で置く。
// 同じ画像を同時に頼まれたら 1 回だけ取り、合計の大きさが上限を超えたら古いものから消す（消えたものは次に出すときに取り直す）
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchRemoteImage, type FetchedImage, type ImageFetcher } from "./fetchImage";

/** 1 枚の上限 */
const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

/** 覚えるときの名前（URL の SHA-256。URL には何が入っているか分からないので、そのままファイル名にしない） */
export const keyOf = (url: string) => createHash("sha256").update(url).digest("hex");

/** 外の画像を取る本物の口（1 枚の上限・時間・転送の回数を決めたもの） */
export const defaultImageFetcher: ImageFetcher = (url) => fetchRemoteImage(url, { maxBytes: REMOTE_IMAGE_MAX_BYTES, timeoutMs: FETCH_TIMEOUT_MS, maxRedirects: MAX_REDIRECTS });

/** 覚え書きの 1 行（scope は範囲の ID） */
export interface CachedRow {
  scope: number;
  key: string;
  size: number;
}

/** 覚え書きの表（チャット・ノートそれぞれの店を、この形にして渡す） */
export interface CacheRows {
  cached(scope: number, key: string): { content_type: string } | undefined;
  remember(row: CachedRow & { host: string; content_type: string }): void;
  forget(scope: number, key: string): void;
  totalSize(): number;
  oldest(limit: number): CachedRow[];
}

export class ScopedImageCache {
  private readonly inflight = new Map<string, Promise<FetchedImage>>();

  constructor(
    private readonly opts: {
      /** 範囲ごとのフォルダを置く所 */
      dir: string;
      rows: CacheRows;
      fetcher: ImageFetcher;
      /** 覚える合計の上限 */
      maxBytes: number;
    },
  ) {}

  /** 範囲のフォルダ */
  dirOf(scope: number): string {
    return path.join(this.opts.dir, String(scope));
  }

  fileOf(scope: number, key: string): string {
    return path.join(this.dirOf(scope), key);
  }

  /** 画像の中身（覚えていれば手元から、なければ取ってきて覚える）。許可の確かめは呼ぶ側 */
  async get(scope: number, remote: { host: string; url: string }): Promise<FetchedImage> {
    const key = keyOf(remote.url);
    const cached = this.opts.rows.cached(scope, key);
    if (cached) {
      const body = await fs.readFile(this.fileOf(scope, key)).catch(() => null);
      if (body) return { contentType: cached.content_type, body };
      this.opts.rows.forget(scope, key);
    }
    const id = `${scope}:${key}`;
    let pending = this.inflight.get(id);
    if (!pending) {
      pending = this.fetchAndRemember(scope, key, remote.host, remote.url).finally(() => this.inflight.delete(id));
      this.inflight.set(id, pending);
    }
    return pending;
  }

  /** 範囲の覚えた画像を何枚か消す（許可を外したホストの分。表の行は呼ぶ側が消す） */
  async removeKeys(scope: number, keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((k) => fs.rm(this.fileOf(scope, k), { force: true })));
  }

  /** 範囲のフォルダを丸ごと消す（チャットを本当に消した・ノートをゴミ箱に入れた） */
  async removeScopes(scopes: readonly number[]): Promise<void> {
    await Promise.all(scopes.map((s) => fs.rm(this.dirOf(s), { recursive: true, force: true })));
  }

  private async fetchAndRemember(scope: number, key: string, host: string, url: string): Promise<FetchedImage> {
    const image = await this.opts.fetcher(url);
    try {
      await fs.mkdir(this.dirOf(scope), { recursive: true });
      await fs.writeFile(this.fileOf(scope, key), image.body);
      this.opts.rows.remember({ scope, key, host, content_type: image.contentType, size: image.body.length });
    } catch {
      // 覚えられなくても、取ってきた画像は返す（次は取り直す）。取っている間に範囲が消えて覚え書きを書けなかったときは、
      // 書いたファイルを残さない（覚え書きにないファイルは合計にも数えず、消す時が来ない）
      await fs.rm(this.fileOf(scope, key), { force: true });
      return image;
    }
    await this.trim().catch(() => {});
    return image;
  }

  /** 合計が上限を超えていれば、古いものから消す */
  private async trim(): Promise<void> {
    let total = this.opts.rows.totalSize();
    while (total > this.opts.maxBytes) {
      const oldest = this.opts.rows.oldest(20);
      if (oldest.length === 0) return;
      for (const r of oldest) {
        if (total <= this.opts.maxBytes) return;
        this.opts.rows.forget(r.scope, r.key);
        await fs.rm(this.fileOf(r.scope, r.key), { force: true });
        total -= r.size;
      }
    }
  }
}
