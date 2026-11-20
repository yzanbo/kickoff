// 未保存の登録簿: このウィンドウで開いている文書（ファイル・ノート・DB の表の変更など）が、自分の様子と保存のしかたをここに出す。
// ⌘⇧S（saveAll）・離れる前の確かめ（confirmLeave）・書きかけをすぐ残す（flushDrafts）が、置き場所を問わずここから読む
import { createCell, useCell } from "@/foundation/ui/store";
import { choose } from "@/foundation/ui/kit/ask";

/** 開いている文書 1 つ（同じ文書を 2 か所で開けば、同じ key の項目が 2 つ） */
export interface UnsavedEntry {
  /** 文書の見分け（"<projectId>:<path>" など） */
  key: string;
  /** 置き場所（パネルの欄の名前など。離れる前の確かめで絞り込む） */
  surface: string;
  /** 確かめの文に出す名前（ファイルの名前など） */
  title: string;
  /** まだ保存していない書きかけがあるか */
  dirty(): boolean;
  /** 保存する（保存できたか。ほかで変わっていた・失敗したら false） */
  save(): Promise<boolean>;
  /** 書きかけを捨てる（離れる前の確かめで「保存しない」を選んだとき） */
  discard?(): void;
  /** 書きかけを待たずに残す（残す文書だけ。ウィンドウを閉じる前・pagehide） */
  flush?(): void;
}

const entries = createCell<readonly UnsavedEntry[]>([]);

/** 開いている文書を出す（やめるときは返り値を呼ぶ） */
export function registerUnsaved(entry: UnsavedEntry): () => void {
  entries.set((list) => [...list, entry]);
  return () => entries.set((list) => list.filter((e) => e !== entry));
}

const sameItems = (a: readonly UnsavedEntry[], b: readonly UnsavedEntry[]) => a.length === b.length && a.every((e, i) => e === b[i]);

/** 開いている文書のうち filter に当てはまるもの（開く・閉じると描き直す。書きかけの有無では描き直さない） */
export function useUnsaved(filter: (entry: UnsavedEntry) => boolean): readonly UnsavedEntry[] {
  return useCell(entries, (list) => list.filter(filter), sameItems);
}

/**
 * filter に当てはまる、まだ保存していない文書を離れてよいか。文書ごとに「保存 / 保存しない / キャンセル」を聞く
 * （保存できなければ離れない。保存しないなら書きかけを捨てる）。action は何をするか（確かめの文の頭に出す 1 文）。
 * 書きかけがなければ聞かずに true
 */
export async function confirmLeave(filter: (entry: UnsavedEntry) => boolean, o: { action?: string } = {}): Promise<boolean> {
  const dirty = entries.get().filter((e) => filter(e) && e.dirty());
  for (const key of new Set(dirty.map((e) => e.key))) {
    const same = dirty.filter((e) => e.key === key);
    const picked = await choose({
      title: `「${same[0].title}」への変更を保存しますか？`,
      message: `${o.action ?? ""}保存しないと、変更は消えます。`,
      choices: [
        { value: "discard", label: "保存しない" },
        { value: "save", label: "保存", primary: true },
      ],
    }).then((r) => r?.value ?? null);
    if (picked === null) return false;
    if (picked === "discard") same.forEach((e) => e.discard?.());
    else for (const e of same) if (!(await e.save().catch(() => false))) return false;
  }
  return true;
}

/**
 * ⌘⇧S: まだ保存していない文書を、1 つずつ順に保存する（ほかで変わっていたときの確かめが重ならないように）。
 * 保存できた数と、保存できなかった数を返す（1 つが失敗しても、ほかは保存する）
 */
export async function saveAll(): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const entry of entries.get().filter((e) => e.dirty())) {
    const ok = await entry.save().catch(() => false);
    if (ok) saved++;
    else failed++;
  }
  return { saved, failed };
}

/** 開いている文書の書きかけを、待たずに残す（別ウィンドウを閉じて右の欄で開き直す前・pagehide） */
export function flushDrafts(): void {
  for (const entry of entries.get()) entry.flush?.();
}
