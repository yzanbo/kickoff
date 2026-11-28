// ノートの外の画像: 表示を許可したホスト（ノートごと）と、コアが取ってきた画像の覚え（ディスク）。
// 取り方（手元・社内の宛先を断る・転送ごとに確かめ直す）はチャットと同じ fetchImage.ts。ノートを動かしたら付け替え、ゴミ箱に入れたら忘れる
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChatImageHost } from "@shared/chat/types";
import type { BusEvent } from "@shared/foundation/contract";
import { remoteImageOf } from "@shared/remoteImages/remoteImages";
import { Invalid } from "@/foundation/core/errors";
import type { createNoteImageStore } from "./db/noteImages";
import type { FetchedImage, ImageFetcher } from "./fetchImage";
import { defaultImageFetcher, keyOf } from "./service";

/** ノートのために覚えておく画像の合計の上限（超えたら古いものから消す） */
const NOTE_IMAGE_CACHE_MAX_BYTES = 256 * 1024 * 1024;

export interface NoteImageServiceOptions {
  store: ReturnType<typeof createNoteImageStore>;
  /** 覚えた画像の置き場（image-cache/notes） */
  dir: string;
  publish: (e: BusEvent) => void;
  fetcher?: ImageFetcher;
  maxCacheBytes?: number;
}

/** ノートのパスとして受け付けるか（ノートのフォルダからの相対。外・「.」の段・空の段を断る） */
export function isNotePath(value: string): boolean {
  return value.length > 0 && value.length <= 1024 && !value.startsWith("/") && value.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

export class NoteImageService {
  private readonly fetcher: ImageFetcher;
  private readonly maxCacheBytes: number;
  private readonly inflight = new Map<string, Promise<FetchedImage>>();

  constructor(private readonly opts: NoteImageServiceOptions) {
    this.fetcher = opts.fetcher ?? defaultImageFetcher;
    this.maxCacheBytes = opts.maxCacheBytes ?? NOTE_IMAGE_CACHE_MAX_BYTES;
  }

  hosts(projectId: number, note: string): ChatImageHost[] {
    return this.opts.store.hosts(projectId, this.checked(note));
  }

  /** ノートでホストの表示を許可する（押した「host から画像を n 件表示」） */
  allow(projectId: number, note: string, host: string): ChatImageHost[] {
    const normalized = host.trim().toLowerCase();
    if (!normalized || /[\s/@]/.test(normalized)) throw new Invalid("ホストの名前が正しくありません");
    this.opts.store.allow(projectId, this.checked(note), normalized);
    return this.changed(projectId, note);
  }

  /** 許可を外し、そのホストの覚えた画像も消す */
  async revoke(projectId: number, note: string, host: string): Promise<ChatImageHost[]> {
    const keys = this.opts.store.revoke(projectId, this.checked(note), host.trim().toLowerCase());
    await Promise.all(keys.map((k) => fs.rm(this.fileOf(projectId, note, k), { force: true })));
    return this.changed(projectId, note);
  }

  /** 画像の中身（そのノートで許可したホストだけ。覚えていれば手元から、なければ取ってきて覚える） */
  async image(projectId: number, note: string, src: string): Promise<FetchedImage> {
    this.checked(note);
    const remote = remoteImageOf(src);
    if (!remote) throw new Invalid("http・https の画像だけを読み込みます");
    if (!this.opts.store.allowed(projectId, note, remote.host)) throw new Invalid(`このノートでは ${remote.host} の画像の表示を許可していません`);
    const key = keyOf(remote.url);
    const cached = this.opts.store.cached(projectId, note, key);
    if (cached) {
      const body = await fs.readFile(this.fileOf(projectId, note, key)).catch(() => null);
      if (body) return { contentType: cached.content_type, body };
      this.opts.store.forget(projectId, note, key);
    }
    const id = `${projectId}\n${note}\n${key}`;
    let pending = this.inflight.get(id);
    if (!pending) {
      pending = this.fetchAndRemember(projectId, note, key, remote.host, remote.url).finally(() => this.inflight.delete(id));
      this.inflight.set(id, pending);
    }
    return pending;
  }

  /** ノート（かフォルダ）を動かした・ほかのプロジェクトへ移した: 許可と覚えた画像を付け替える */
  async moved(fromProject: number, from: string, toProject: number, to: string): Promise<void> {
    for (const note of this.opts.store.notesUnder(fromProject, from)) {
      const next = to + note.slice(from.length);
      // 覚えたファイルを先に動かしてから表を付け替える（付け替えた直後に読まれても、ファイルが見つかるように）
      const target = this.noteDir(toProject, next);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(this.noteDir(fromProject, note), target).catch(() => {});
      this.opts.store.move(fromProject, note, toProject, next);
      this.changed(toProject, next);
    }
  }

  /** ノート（かフォルダ）をゴミ箱に入れた: 許可と覚えた画像を忘れる（戻したら、また押して許可する） */
  async trashed(projectId: number, note: string): Promise<void> {
    const paths = this.opts.store.forgetNote(projectId, note);
    await Promise.all(paths.map((p) => fs.rm(this.noteDir(projectId, p), { recursive: true, force: true })));
  }

  private checked(note: string): string {
    if (!isNotePath(note)) throw new Invalid("ノートのパスが正しくありません");
    return note;
  }

  /** ノートの覚えた画像のフォルダ（パスは何が入っているか分からないので SHA-256 にする） */
  private noteDir(projectId: number, note: string): string {
    return path.join(this.opts.dir, String(projectId), createHash("sha256").update(note).digest("hex"));
  }

  private fileOf(projectId: number, note: string, key: string): string {
    return path.join(this.noteDir(projectId, note), key);
  }

  private async fetchAndRemember(projectId: number, note: string, key: string, host: string, url: string): Promise<FetchedImage> {
    const image = await this.fetcher(url);
    try {
      await fs.mkdir(this.noteDir(projectId, note), { recursive: true });
      await fs.writeFile(this.fileOf(projectId, note, key), image.body);
      this.opts.store.remember({ project_id: projectId, path: note, key, host, content_type: image.contentType, size: image.body.length });
      await this.trim();
    } catch {
      // 覚えられなくても、取ってきた画像は返す（次は取り直す）
    }
    return image;
  }

  private async trim(): Promise<void> {
    let total = this.opts.store.totalSize();
    while (total > this.maxCacheBytes) {
      const oldest = this.opts.store.oldest(20);
      if (oldest.length === 0) return;
      for (const r of oldest) {
        if (total <= this.maxCacheBytes) return;
        this.opts.store.forget(r.project_id, r.path, r.key);
        await fs.rm(this.fileOf(r.project_id, r.path, r.key), { force: true });
        total -= r.size;
      }
    }
  }

  private changed(projectId: number, note: string): ChatImageHost[] {
    const hosts = this.opts.store.hosts(projectId, note);
    this.opts.publish({ type: "note_image_hosts", project_id: projectId, path: note, hosts });
    return hosts;
  }
}
