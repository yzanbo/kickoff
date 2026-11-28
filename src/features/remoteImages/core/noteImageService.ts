// ノートの外の画像: 表示を許可したホスト（ノートごと）と、コアが取ってきた画像の覚え（ディスク。imageCache.ts）。
// 取り方（手元・社内の宛先を断る・転送ごとに確かめ直す）はチャットと同じ fetchImage.ts。ノートを動かしたら範囲の path を書き換え、ゴミ箱に入れたら忘れる
import fs from "node:fs/promises";
import type { BusEvent } from "@shared/foundation/contract";
import type { ImageHost } from "@shared/remoteImages/types";
import { remoteImageOf } from "@shared/remoteImages/remoteImages";
import { Invalid } from "@/foundation/core/errors";
import type { createNoteImageStore } from "./db/noteImages";
import type { FetchedImage, ImageFetcher } from "./fetchImage";
import { normalizedHost } from "./hosts";
import { defaultImageFetcher, ScopedImageCache } from "./imageCache";

/** ノートのために覚えておく画像の合計の上限（超えたら古いものから消す） */
const NOTE_IMAGE_CACHE_MAX_BYTES = 256 * 1024 * 1024;

export interface NoteImageServiceOptions {
  store: ReturnType<typeof createNoteImageStore>;
  /** 覚えた画像の置き場（image-cache/notes。中はノートの範囲ごと） */
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
  private readonly store: NoteImageServiceOptions["store"];
  private readonly cache: ScopedImageCache;

  constructor(private readonly opts: NoteImageServiceOptions) {
    const store = (this.store = opts.store);
    this.cache = new ScopedImageCache({
      dir: opts.dir,
      fetcher: opts.fetcher ?? defaultImageFetcher,
      maxBytes: opts.maxCacheBytes ?? NOTE_IMAGE_CACHE_MAX_BYTES,
      rows: {
        cached: (scope, key) => store.cached(scope, key),
        remember: (r) => store.remember({ scope_id: r.scope, key: r.key, host: r.host, content_type: r.content_type, size: r.size }),
        forget: (scope, key) => store.forget(scope, key),
        totalSize: () => store.totalSize(),
        oldest: (limit) => store.oldest(limit).map((r) => ({ scope: r.scope_id, key: r.key, size: r.size })),
      },
    });
  }

  hosts(projectId: number, note: string): ImageHost[] {
    return this.store.hosts(this.store.scope(projectId, checked(note)));
  }

  /** ノートでホストの表示を許可する（押した「host から画像を n 件表示」。範囲がまだなければ作る） */
  allow(projectId: number, note: string, host: string): ImageHost[] {
    const scope = this.store.scope(projectId, checked(note), true)!;
    this.store.allow(scope, normalizedHost(host));
    return this.changed(projectId, note);
  }

  /** 許可を外し、そのホストの覚えた画像も消す */
  async revoke(projectId: number, note: string, host: string): Promise<ImageHost[]> {
    const scope = this.store.scope(projectId, checked(note));
    if (scope !== null) await this.cache.removeKeys(scope, this.store.revoke(scope, host.trim().toLowerCase()));
    return this.changed(projectId, note);
  }

  /** 画像の中身（そのノートで許可したホストだけ。覚えていれば手元から、なければ取ってきて覚える） */
  async image(projectId: number, note: string, src: string): Promise<FetchedImage> {
    const scope = this.store.scope(projectId, checked(note));
    const remote = remoteImageOf(src);
    if (!remote) throw new Invalid("http・https の画像だけを読み込みます");
    if (scope === null || !this.store.allowed(scope, remote.host)) throw new Invalid(`このノートでは ${remote.host} の画像の表示を許可していません`);
    return this.cache.get(scope, remote);
  }

  /** ノート（かフォルダ）を動かした・ほかのプロジェクトへ移した: 範囲の path を書き換える（覚えたファイルは範囲の ID の下なので動かさない） */
  async moved(fromProject: number, from: string, toProject: number, to: string): Promise<void> {
    const { moved, dropped } = this.store.move(fromProject, from, toProject, to);
    // 元のパスの分は空になったと知らせる（画面が覚えた許可を残さない。戻した・同じ名前で作り直したノートでは、また押して許可する）
    for (const m of moved) this.publishHosts(fromProject, m.from, []);
    for (const m of moved) this.changed(toProject, m.path);
    await this.cache.removeScopes(dropped);
  }

  /** ノート（かフォルダ）をゴミ箱に入れた: 許可と覚えた画像を忘れる（戻したら、また押して許可する） */
  async trashed(projectId: number, note: string): Promise<void> {
    const gone = this.store.forgetUnder(projectId, note);
    for (const g of gone) this.publishHosts(projectId, g.path, []);
    await this.cache.removeScopes(gone.map((g) => g.id));
  }

  /** 範囲の行がもうない覚えた画像のフォルダを消す（プロジェクトを本当に消したとき、行は一緒に消えるがファイルは残るため。起動したときに流す） */
  async sweep(): Promise<void> {
    const alive = this.store.scopeIds();
    const names = await fs.readdir(this.opts.dir).catch(() => [] as string[]);
    await this.cache.removeScopes(names.map(Number).filter((id) => Number.isInteger(id) && !alive.has(id)));
  }

  private changed(projectId: number, note: string): ImageHost[] {
    const hosts = this.hosts(projectId, note);
    this.publishHosts(projectId, note, hosts);
    return hosts;
  }

  private publishHosts(projectId: number, note: string, hosts: ImageHost[]): void {
    this.opts.publish({ type: "note_image_hosts", project_id: projectId, path: note, hosts });
  }
}

function checked(note: string): string {
  if (!isNotePath(note)) throw new Invalid("ノートのパスが正しくありません");
  return note;
}
