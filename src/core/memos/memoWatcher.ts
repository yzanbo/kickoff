// メモのフォルダを見張り、Kickoff の外（Finder・Obsidian・エディタ）での変更も SSE の memos で知らせる。
// プロジェクトごとに 1 つ、一覧・中身を読まれたときに見張り始める（フォルダがまだなければ、作られて読まれたときに始める）
import fs from "node:fs";
import { toApiPath } from "../system/paths.js";

/** 続けて変わったものをまとめて知らせるまで（ミリ秒。保存のたびに何度も知らせない） */
const SETTLE_MS = 200;

interface Watch {
  dir: string;
  watcher: fs.FSWatcher;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** まだ知らせていない、変わったもの（メモのフォルダからの相対。分からなければ null） */
  changed: Set<string | null>;
}

/** 変わったものから、知らせるパス（1 つのファイルだけならそのパス、いくつも・分からなければ null） */
export function changedPath(changed: Iterable<string | null>): string | null {
  const paths = [...changed];
  return paths.length === 1 ? paths[0] : null;
}

/** 隠しファイル（「.」で始まる名前の中）か。メモとして扱わないので、変わっても知らせない */
function isHidden(file: string): boolean {
  return file.split("/").some((part) => part.startsWith("."));
}

export class MemoWatcher {
  private readonly watches = new Map<number, Watch>();

  constructor(private readonly onChange: (projectId: number, file: string | null) => void) {}

  /** プロジェクトのメモのフォルダを見張る（もう見張っていれば何もしない。フォルダが変わったら見張り直す） */
  watch(projectId: number, dir: string): void {
    const current = this.watches.get(projectId);
    if (current?.dir === dir) return;
    this.stop(projectId);
    let watcher: fs.FSWatcher;
    try {
      // macOS では FSEvents で、中のフォルダも含めて見張る
      watcher = fs.watch(dir, { recursive: true });
    } catch {
      // フォルダがまだない・読めない（作られたあと、読まれたときに見張り始める）
      return;
    }
    const w: Watch = { dir, watcher, timer: undefined, changed: new Set() };
    watcher.on("change", (_type, filename) => {
      const file = typeof filename === "string" ? toApiPath(filename) : null;
      if (file !== null && isHidden(file)) return;
      w.changed.add(file);
      clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        const path = changedPath(w.changed);
        w.changed.clear();
        this.onChange(projectId, path);
      }, SETTLE_MS);
      w.timer.unref();
    });
    // フォルダを消された・名前を変えられたなどで見張れなくなったら、やめる（次に読まれたときに見張り直す）
    watcher.on("error", () => {
      if (this.watches.get(projectId) === w) this.stop(projectId);
      this.onChange(projectId, null);
    });
    // 見張っているだけでは、プロセスの終わりを止めない
    watcher.unref();
    this.watches.set(projectId, w);
  }

  /** プロジェクトの見張りをやめる */
  stop(projectId: number): void {
    const w = this.watches.get(projectId);
    if (!w) return;
    clearTimeout(w.timer);
    w.watcher.close();
    this.watches.delete(projectId);
  }

  /** すべての見張りをやめる（終わるとき） */
  close(): void {
    for (const id of [...this.watches.keys()]) this.stop(id);
  }
}
