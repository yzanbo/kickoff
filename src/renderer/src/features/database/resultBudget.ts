// 裏のタブ（いま見ていない DB クライアントのタブ）が持つ結果の量。合わせて DB_BACKGROUND_RESULT_BYTES を超えたら、
// 裏に回った時刻の古いタブから結果を捨て（evict）、そのタブに戻ったら取り直す（タブごとの部品が受ける）
import { useEffect, useRef } from "react";
import type { DbValue } from "@shared/types";

/** 裏のタブの結果を合わせてこれだけ持つ（50MB ほど） */
export const DB_BACKGROUND_RESULT_BYTES = 50 * 1024 * 1024;

/** 結果の行のおおよその大きさ（JS の文字は 2 バイト。数・真偽値・NULL は 8 バイト・セルごとに 16 バイトの入れ物。純粋な関数） */
export function estimateRowsBytes(rows: DbValue[][]): number {
  let bytes = 0;
  for (const row of rows) {
    bytes += 16;
    for (const v of row) {
      bytes += 16;
      if (typeof v === "string") bytes += v.length * 2;
      else if (v !== null && typeof v === "object") bytes += ("head" in v ? v.head.length * 2 : 0) + 16;
      else bytes += 8;
    }
  }
  return bytes;
}

/** 量を数えるタブ（hiddenAt: 裏に回った時刻。見ているタブは null） */
export interface BudgetEntry {
  key: string;
  bytes: number;
  hiddenAt: number | null;
}

/** 捨てるタブ（裏のタブを、裏に回った時刻の古い順に、裏のタブの合計が limit 以下になるまで。純粋な関数） */
export function pickEvictions(entries: BudgetEntry[], limit: number): string[] {
  const hidden = entries.filter((e) => e.hiddenAt !== null && e.bytes > 0).sort((a, b) => a.hiddenAt! - b.hiddenAt!);
  let total = hidden.reduce((sum, e) => sum + e.bytes, 0);
  const out: string[] = [];
  for (const e of hidden) {
    if (total <= limit) break;
    out.push(e.key);
    total -= e.bytes;
  }
  return out;
}

const entries = new Map<string, BudgetEntry & { evict: () => void }>();

function enforce() {
  for (const key of pickEvictions([...entries.values()], DB_BACKGROUND_RESULT_BYTES)) {
    const e = entries.get(key);
    if (!e) continue;
    e.bytes = 0;
    e.evict();
  }
}

/**
 * タブの結果の量を知らせる（key は置き場所とタブのキーで、ウィンドウの中で 1 つ。bytes が 0 なら数えない = 捨てられない）。
 * 裏の結果が多すぎれば evict が呼ばれる（結果を捨て、戻ったら取り直すのは呼ぶ側）
 */
export function useResultBudget(key: string, bytes: number, active: boolean, evict: () => void) {
  const evictRef = useRef(evict);
  evictRef.current = evict;
  useEffect(() => {
    const prev = entries.get(key);
    const hiddenAt = active ? null : (prev?.hiddenAt ?? Date.now());
    entries.set(key, { key, bytes, hiddenAt, evict: () => evictRef.current() });
    enforce();
  }, [key, bytes, active]);
  useEffect(() => () => void entries.delete(key), [key]);
}
