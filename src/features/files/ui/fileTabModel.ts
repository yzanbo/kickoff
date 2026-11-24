// ファイルのタブの種類（fileTabKinds.ts）の決め方のうち、部品を読まない純粋なもの（作業場所を移したときの付け替え）
import { fileTab, repointedAt, type WorkplaceMove } from "@/features/panel/ui";
import type { FileTab } from "./fileTabPages";
import { isFileTabDirty } from "./fileTabs";

/** 作業場所を移したら新しい作業場所の同じファイルにする（行は引き継ぐ）。保存していない変更があれば、移す前の作業場所のまま残す */
export function repointFileTab(t: FileTab, move: WorkplaceMove, panel: string) {
  const at = repointedAt(t, move);
  if (!at) return null;
  if (isFileTabDirty(panel, t.key)) return { kept: t.path };
  return fileTab({ ...at, path: t.path, ...(t.line ? { line: t.line } : {}) });
}
