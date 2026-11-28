// チャット欄の外の画像: 表示を許可したホスト（チャットごと）と、コアが取ってきた画像の覚え（ディスク。imageCache.ts）
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { Chat } from "@shared/chat/types";
import type { BusEvent } from "@shared/foundation/contract";
import type { ImageHost } from "@shared/remoteImages/types";
import { remoteImageOf } from "@shared/remoteImages/remoteImages";
import type { createChatImageStore } from "./db/chatImages";
import { Invalid } from "@/foundation/core/errors";
import type { FetchedImage, ImageFetcher } from "./fetchImage";
import { defaultImageFetcher, ScopedImageCache } from "./imageCache";
import { hostKey, normalizedHost } from "./hosts";

/** 覚えておく画像の合計の上限（超えたら古いものから消す。消えたものは次に出すときに取り直す） */
const CHAT_IMAGE_CACHE_MAX_BYTES = 1024 * 1024 * 1024;

export interface ChatImageServiceOptions {
  /** 自分の表の店（表示を許可したホストと、取ってきた画像の覚え） */
  store: ReturnType<typeof createChatImageStore>;
  /** 覚えた画像の置き場（データのフォルダの image-cache。中はチャットごと） */
  dir: string;
  publish: (e: BusEvent) => void;
  /** 外の画像を取る口（省けば本物。テストで差し替える） */
  fetcher?: ImageFetcher;
  /** 覚える合計の上限（テストで小さくする） */
  maxCacheBytes?: number;
}

export class ChatImageService {
  private readonly store: ChatImageServiceOptions["store"];
  private readonly cache: ScopedImageCache;

  constructor(private readonly opts: ChatImageServiceOptions) {
    this.store = opts.store;
    this.cache = new ScopedImageCache({ dir: opts.dir, rows: opts.store, fetcher: opts.fetcher ?? defaultImageFetcher, maxBytes: opts.maxCacheBytes ?? CHAT_IMAGE_CACHE_MAX_BYTES });
  }

  hosts(chatId: number): ImageHost[] {
    return this.store.hosts(chatId);
  }

  /** ホストの表示を許可する（押した「host から画像を n 件表示」） */
  allow(chat: Chat, host: string): ImageHost[] {
    this.store.allow(chat.id, normalizedHost(host));
    return this.changed(chat);
  }

  /** 許可を外し、そのホストの覚えた画像も消す */
  async revoke(chat: Chat, host: string): Promise<ImageHost[]> {
    await this.cache.removeKeys(chat.id, this.store.revoke(chat.id, hostKey(host)));
    return this.changed(chat);
  }

  /** 画像の中身（許可したホストだけ。覚えていれば手元から、なければ取ってきて覚える） */
  async image(chat: Chat, src: string): Promise<FetchedImage> {
    const remote = remoteImageOf(src);
    if (!remote) throw new Invalid("http・https の画像だけを読み込みます");
    if (!this.store.allowed(chat.id, remote.host)) throw new Invalid(`このチャットでは ${remote.host} の画像の表示を許可していません`);
    return this.cache.get(chat.id, remote);
  }

  /** 分岐: 許可と覚えた画像を新しいチャットに写す（ファイルは APFS なら複製で写す） */
  async copyChat(fromChatId: number, toChatId: number): Promise<void> {
    const keys = this.store.copy(fromChatId, toChatId);
    if (keys.length === 0) return;
    await fs.mkdir(this.cache.dirOf(toChatId), { recursive: true });
    await Promise.all(
      keys.map((key) => fs.copyFile(this.cache.fileOf(fromChatId, key), this.cache.fileOf(toChatId, key), fsConstants.COPYFILE_FICLONE).catch(() => this.store.forget(toChatId, key))),
    );
  }

  /** 本当に消したチャットの覚えた画像のフォルダを消す（表の行はチャットと一緒に消える） */
  async forgetChats(chatIds: number[]): Promise<void> {
    await this.cache.removeScopes(chatIds);
  }

  private changed(chat: Chat): ImageHost[] {
    const hosts = this.hosts(chat.id);
    this.opts.publish({ type: "chat_image_hosts", project_id: chat.project_id, chat_id: chat.id, hosts });
    return hosts;
  }
}
