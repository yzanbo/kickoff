import { createContext, useContext, useMemo } from "react";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { boardLayout, parseLayout, type BoardKind, type BoardLayout, type BoardLayoutState } from "./layout";
import { storage } from "./storage";

const settingOf = (kind: BoardKind) => (kind === "all" ? storage.settings.layoutAll : storage.settings.layoutProject);

/**
 * ボードの見え方（全プロジェクトのボード・プロジェクトのボードで 1 つずつ覚える）と、一部を変える patch。
 * ボードを移る（全プロジェクト ⇄ プロジェクト）と、そのボードで最後に見ていた見え方で開く（覚えていなければ初めからあるビューの先頭）
 */
export function useBoardViewSetting(kind: BoardKind): [BoardLayoutState, (patch: Partial<BoardLayoutState>) => void] {
  const [raw] = useSetting(settingOf(kind));
  const view = useMemo(() => parseLayout(raw, kind), [raw, kind]);
  // 同じ回に続けて変えても前の変更を消さないよう、保存した値に重ねる
  const patch = (p: Partial<BoardLayoutState>) => writeSetting(settingOf(kind), { ...parseLayout(readSetting(settingOf(kind)), kind), ...p });
  return [view, patch];
}

export interface BoardContextValue {
  kind: BoardKind;
  /** プロジェクトのボードのプロジェクト（全プロジェクトのボードにはない） */
  projectId: number | undefined;
  view: BoardLayoutState;
  patch(p: Partial<BoardLayoutState>): void;
  layout: BoardLayout;
}

/** ボードの根（KanbanView）が置く。中の部品はボードの種類・見え方をここから読む（props で受け渡さない） */
export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const board = useContext(BoardContext);
  if (!board) throw new Error("useBoard は BoardContext の中で使う");
  return board;
}

/** 根で 1 つ作る（見え方が変わらない間は同じ値。覚えるのは React Compiler に任せる） */
export function useBoardContextValue(projectId: number | undefined): BoardContextValue {
  const kind: BoardKind = projectId === undefined ? "all" : "project";
  const [view, patch] = useBoardViewSetting(kind);
  const layout = boardLayout(view, kind);
  return { kind, projectId, view, patch, layout };
}
