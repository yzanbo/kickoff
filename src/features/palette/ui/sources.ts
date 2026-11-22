// ⌘K の探す対象（持ち主の機能が ui/contributes.ts で paletteSources.item({…}) を出す）と、行の並べ方
import { definePoint } from "@/foundation/ui/points";
import type { PaletteItem } from "./paletteItem";

/** 名前で探す対象: 行の一覧を返す hook（enabled の間だけ読み込む。query は「何か入力したときだけ出す行」に使い、絞り込みは ⌘K がする） */
export interface PaletteNamedSource {
  id: string;
  label: string;
  order: number;
  /** 初めから探す対象に入れるか（覚えた値がないとき） */
  byDefault?: boolean;
  useItems(enabled: boolean, query: string): readonly PaletteItem[];
}

/** 中身の文で探す対象: 入力が止まってから探す（古い入力の結果は捨てる。失敗は 0 件） */
export interface PaletteTextSource {
  id: string;
  label: string;
  order: number;
  byDefault?: boolean;
  search(query: string): Promise<readonly PaletteItem[]>;
}

export type PaletteSource = PaletteNamedSource | PaletteTextSource;

/** ⌘K の探す対象（key は id） */
export const paletteSources = definePoint<PaletteSource>("paletteSources", { key: (s) => s.id, order: (a, b) => a.order - b.order });

/** 名前で探す対象の hook（id で引く。対象ごとの部品が 1 つずつ呼ぶ。登録は起動で 1 回なので、同じ id はいつも同じ hook） */
export function useNamedSourceItems(id: string, enabled: boolean, query: string): readonly PaletteItem[] {
  const source = paletteSources.items().find((s): s is PaletteNamedSource => s.id === id && "useItems" in s);
  if (!source) throw new Error(`⌘K の探す対象 ${id} がありません`);
  return source.useItems(enabled, query);
}

/** 名前で見つかったものを先に並べる数 */
export const NAMED_LIMIT = 50;

/**
 * ⌘K の行の並べ方: 名前で探した行（対象の order の順）を query で絞って 50 件まで先に、続けて中身の文で見つかった行。
 * 絞り込みは名前と右の薄い文（プロジェクト名など）で、大文字・小文字を区別しない
 */
export function arrangePaletteItems(named: readonly PaletteItem[], text: readonly PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  const filtered = q ? named.filter((i) => `${i.text} ${i.hint}`.toLowerCase().includes(q)) : named;
  return [...filtered.slice(0, NAMED_LIMIT), ...text];
}
