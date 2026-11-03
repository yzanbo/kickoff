import fs from "node:fs";
import path from "node:path";
import { errorMessage } from "../errors.js";
import type { VoiceDownload } from "../types.js";
import { modelFile, modelUrl } from "./models.js";

/** 進み具合を知らせる間隔（ms。受け取るたびには知らせない） */
const PROGRESS_INTERVAL_MS = 300;

/** 進み具合が変わったとき（download が null なら終わった・やめた） */
type OnProgress = (id: string, download: VoiceDownload | null) => void;

interface Running extends VoiceDownload {
  controller?: AbortController;
}

/**
 * whisper のモデルのダウンロード（保存先の models/ に .part で書き、終わったら名前を変える）。
 * 進み具合はメモリだけに持ち、失敗したら理由を残す（もう一度落とすか、削除で消える）
 */
export class ModelDownloads {
  private readonly running = new Map<string, Running>();

  constructor(
    private readonly dir: string,
    private readonly onProgress: OnProgress,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** いまの進み具合（落としていなければ null） */
  state(id: string): VoiceDownload | null {
    const r = this.running.get(id);
    return r ? { received: r.received, total: r.total, ...(r.error ? { error: r.error } : {}) } : null;
  }

  isDownloaded(id: string): boolean {
    return fs.existsSync(modelFile(this.dir, id));
  }

  /** 落とし始める（終わるのは待たない。すでに落としている途中なら何もしない） */
  start(id: string): void {
    const current = this.running.get(id);
    if (current && !current.error) return;
    const entry: Running = { received: 0, total: null, controller: new AbortController() };
    this.running.set(id, entry);
    this.onProgress(id, this.state(id));
    void this.fetchTo(id, entry).catch((e: unknown) => {
      // やめたとき（削除）は、何も残さない
      if (this.running.get(id) !== entry) return;
      entry.error = errorMessage(e);
      entry.controller = undefined;
      this.onProgress(id, this.state(id));
    });
  }

  /** 落としている途中ならやめ、落としたファイルを消す */
  async remove(id: string): Promise<void> {
    const entry = this.running.get(id);
    this.running.delete(id);
    entry?.controller?.abort();
    await fs.promises.rm(modelFile(this.dir, id), { force: true });
    await fs.promises.rm(`${modelFile(this.dir, id)}.part`, { force: true });
    this.onProgress(id, null);
  }

  /** 落としている途中のものをすべてやめる（アプリを終えるとき） */
  stopAll() {
    for (const entry of this.running.values()) entry.controller?.abort();
    this.running.clear();
  }

  private async fetchTo(id: string, entry: Running) {
    const signal = entry.controller!.signal;
    const target = modelFile(this.dir, id);
    const part = `${target}.part`;
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const res = await this.fetchImpl(modelUrl(id), { signal });
    if (!res.ok || !res.body) throw new Error(`ダウンロードに失敗しました（HTTP ${res.status}）`);
    const length = Number(res.headers.get("content-length"));
    entry.total = Number.isFinite(length) && length > 0 ? length : null;
    const file = await fs.promises.open(part, "w");
    let last = 0;
    try {
      for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
        await file.write(chunk);
        entry.received += chunk.byteLength;
        if (Date.now() - last >= PROGRESS_INTERVAL_MS) {
          last = Date.now();
          this.onProgress(id, this.state(id));
        }
      }
    } catch (e) {
      await file.close();
      await fs.promises.rm(part, { force: true });
      throw e;
    }
    await file.close();
    if (entry.total !== null && entry.received !== entry.total) {
      await fs.promises.rm(part, { force: true });
      throw new Error("ダウンロードが途中で切れました。もう一度試してください");
    }
    // 途中でやめた（削除した）ときは、できたファイルを残さない
    if (this.running.get(id) !== entry) {
      await fs.promises.rm(part, { force: true });
      return;
    }
    await fs.promises.rename(part, target);
    this.running.delete(id);
    this.onProgress(id, null);
  }
}
