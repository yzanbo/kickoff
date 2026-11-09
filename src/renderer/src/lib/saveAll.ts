// ⌘⇧S の「すべて保存」（利用者の依頼）: このウィンドウで開いている、まだ保存していない文書（メモ・ファイルタブで開いているファイル）を
// まとめて保存する。開いている文書が自分の様子と保存のしかたをここに知らせ、ショートカットが saveAll で順に保存する

/** 開いている文書（保存のしかたは文書ごと。ほかで変わっていたときの確かめなども、それぞれの ⌘S と同じ） */
export interface Savable {
  /** まだ保存していない書きかけがあるか */
  dirty: () => boolean;
  /** 保存する（保存できたか） */
  save: () => Promise<boolean>;
}

const savables = new Set<Savable>();

/** 開いている文書を知らせる（やめるときは返り値を呼ぶ） */
export function registerSavable(savable: Savable): () => void {
  savables.add(savable);
  return () => void savables.delete(savable);
}

/**
 * まだ保存していない文書を、1 つずつ順に保存する（ほかで変わっていたときの確かめのダイアログが重ならないように）。
 * 保存できた数と、保存できなかった数を返す（1 つが失敗しても、ほかは保存する）
 */
export async function saveAll(): Promise<{ saved: number; failed: number }> {
  let saved = 0;
  let failed = 0;
  for (const savable of [...savables].filter((s) => s.dirty())) {
    const ok = await savable.save().catch(() => false);
    if (ok) saved++;
    else failed++;
  }
  return { saved, failed };
}
