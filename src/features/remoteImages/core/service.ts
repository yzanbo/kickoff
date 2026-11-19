// チャット欄の外の画像: 表示を許可したホスト（チャットごと）と、コアが取ってきた画像の覚え（ディスク）
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import type { BusEvent, Chat, ChatImageHost } from "@shared/types";
import { remoteImageOf } from "@shared/remoteImages/remoteImages";
import type { Store } from "@/foundation/core/db/store";
import { Invalid } from "@/foundation/core/errors";
import { fetchRemoteImage, type FetchedImage, type ImageFetcher } from "./fetchImage";

/** 1 枚の上限 */
const REMOTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
/** 覚えておく画像の合計の上限（超えたら古いものから消す。消えたものは次に出すときに取り直す） */
const REMOTE_IMAGE_CACHE_MAX_BYTES = 1024 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

export interface RemoteImageServiceOptions {
  store: Store;
  /** 覚えた画像の置き場（データのフォルダの image-cache） */
  dir: string;
  publish: (e: BusEvent) => void;
  /** 外の画像を取る口（省けば本物。テストで差し替える） */
  fetcher?: ImageFetcher;
  /** 覚える合計の上限（テストで小さくする） */
  maxCacheBytes?: number;
}

/** 覚えるときの名前（URL の SHA-256。URL には何が入っているか分からないので、そのままファイル名にしない） */
const keyOf = (url: string) => createHash("sha256").update(url).digest("hex");

export class RemoteImageService {
  readonly dir: string;
  private readonly store: Store;
  private readonly publish: (e: BusEvent) => void;
  private readonly fetcher: ImageFetcher;
  private readonly maxCacheBytes: number;
  /** 同じ画像を同時に頼まれたら 1 回だけ取る */
  private readonly inflight = new Map<string, Promise<FetchedImage>>();

  constructor(opts: RemoteImageServiceOptions) {
    this.store = opts.store;
    this.dir = opts.dir;
    this.publish = opts.publish;
    this.maxCacheBytes = opts.maxCacheBytes ?? REMOTE_IMAGE_CACHE_MAX_BYTES;
    this.fetcher = opts.fetcher ?? ((url) => fetchRemoteImage(url, { maxBytes: REMOTE_IMAGE_MAX_BYTES, timeoutMs: FETCH_TIMEOUT_MS, maxRedirects: MAX_REDIRECTS }));
  }

  hosts(chatId: number): ChatImageHost[] {
    return this.store.chatImages.hosts(chatId);
  }

  /** ホストの表示を許可する（押した「host から画像を n 件表示」） */
  allow(chat: Chat, host: string): ChatImageHost[] {
    const normalized = host.trim().toLowerCase();
    if (!normalized || /[\s/@]/.test(normalized)) throw new Invalid("ホストの名前が正しくありません");
    this.store.chatImages.allow(chat.id, normalized);
    return this.changed(chat);
  }

  /** 許可を外し、そのホストの覚えた画像も消す */
  async revoke(chat: Chat, host: string): Promise<ChatImageHost[]> {
    const keys = this.store.chatImages.revoke(chat.id, host.trim().toLowerCase());
    await Promise.all(keys.map((k) => fs.rm(this.fileOf(chat.id, k), { force: true })));
    return this.changed(chat);
  }

  /** 画像の中身（許可したホストだけ。覚えていれば手元から、なければ取ってきて覚える） */
  async image(chat: Chat, src: string): Promise<FetchedImage> {
    const remote = remoteImageOf(src);
    if (!remote) throw new Invalid("http・https の画像だけを読み込みます");
    if (!this.store.chatImages.allowed(chat.id, remote.host)) throw new Invalid(`このチャットでは ${remote.host} の画像の表示を許可していません`);
    const key = keyOf(remote.url);
    const cached = this.store.chatImages.cached(chat.id, key);
    if (cached) {
      const body = await fs.readFile(this.fileOf(chat.id, key)).catch(() => null);
      if (body) return { contentType: cached.content_type, body };
      this.store.chatImages.forget(chat.id, key);
    }
    const id = `${chat.id}:${key}`;
    let pending = this.inflight.get(id);
    if (!pending) {
      pending = this.fetchAndRemember(chat.id, key, remote.host, remote.url).finally(() => this.inflight.delete(id));
      this.inflight.set(id, pending);
    }
    return pending;
  }

  /** 分岐: 許可と覚えた画像を新しいチャットに写す（ファイルは APFS なら複製で写す） */
  async copyChat(fromChatId: number, toChatId: number): Promise<void> {
    const rows = this.store.chatImages.copy(fromChatId, toChatId);
    if (rows.length === 0) return;
    await fs.mkdir(path.join(this.dir, String(toChatId)), { recursive: true });
    await Promise.all(
      rows.map((r) =>
        fs.copyFile(this.fileOf(fromChatId, r.key), this.fileOf(toChatId, r.key), fsConstants.COPYFILE_FICLONE).catch(() => this.store.chatImages.forget(toChatId, r.key)),
      ),
    );
  }

  /** 本当に消したチャットの覚えた画像のフォルダを消す（表の行はチャットと一緒に消える） */
  async forgetChats(chatIds: number[]): Promise<void> {
    await Promise.all(chatIds.map((id) => fs.rm(path.join(this.dir, String(id)), { recursive: true, force: true })));
  }

  private fileOf(chatId: number, key: string): string {
    return path.join(this.dir, String(chatId), key);
  }

  private async fetchAndRemember(chatId: number, key: string, host: string, url: string): Promise<FetchedImage> {
    const image = await this.fetcher(url);
    try {
      await fs.mkdir(path.join(this.dir, String(chatId)), { recursive: true });
      await fs.writeFile(this.fileOf(chatId, key), image.body);
      this.store.chatImages.remember({ chat_id: chatId, key, host, content_type: image.contentType, size: image.body.length });
      await this.trim();
    } catch {
      // 覚えられなくても、取ってきた画像は返す（次は取り直す）
    }
    return image;
  }

  /** 合計が上限を超えていれば、古いものから消す */
  private async trim(): Promise<void> {
    let total = this.store.chatImages.totalSize();
    while (total > this.maxCacheBytes) {
      const oldest = this.store.chatImages.oldest(20);
      if (oldest.length === 0) return;
      for (const r of oldest) {
        if (total <= this.maxCacheBytes) return;
        this.store.chatImages.forget(r.chat_id, r.key);
        await fs.rm(this.fileOf(r.chat_id, r.key), { force: true });
        total -= r.size;
      }
    }
  }

  private changed(chat: Chat): ChatImageHost[] {
    const hosts = this.hosts(chat.id);
    this.publish({ type: "chat_image_hosts", project_id: chat.project_id, chat_id: chat.id, hosts });
    return hosts;
  }
}
