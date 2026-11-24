// ノートを運ぶ・欄の間で動かすときの決まり（純粋）。ドラッグの落とせる所（noteDrag.ts）と、欄の間で動かす組・動かしたあとの開いているフォルダ（noteTransfer.ts・useNoteActions.ts）
import { ancestorsOf, baseName, isUnder, joinPath, remapPrefix } from "@shared/foundation/path";
import { topLevelPaths } from "@/foundation/ui/kit/list/treeModel";
import { parentOf } from "@/features/notes/ui/notePaths";

/** 運んでいるノート・フォルダ（どの欄 = プロジェクトの、どのパス。一覧で選んだものをまとめて運ぶこともある） */
export interface NoteDragData {
  projectId: number;
  paths: readonly string[];
}

/**
 * 運んでいるものを、その欄（projectId）のフォルダ folder（"" は欄の根）へ落とせるか。同じ欄なら、自分自身・自分の中のフォルダには入れられず
 * （まとめて運んでいれば、どれか 1 つでも）、どれもいまあるフォルダなら何も変わらないので落とせない。ほかの欄からならどのフォルダへも落とせる
 * （同じ名前はコアが断る）。何を運んでいるか分からないとき（ほかのウィンドウから運んできたなど）は落とせることにする
 */
export function canDropNotes(dragging: NoteDragData | null, projectId: number, folder: string): boolean {
  if (!dragging || dragging.paths.length === 0 || dragging.projectId !== projectId) return true;
  if (dragging.paths.some((p) => folder === p || isUnder(folder, p))) return false;
  return dragging.paths.some((p) => parentOf(p) !== folder);
}

/** 欄の間で動かす組（フォルダとその中を両方選んでいればフォルダだけ。行き先は行き先の欄の folder の下の同じ名前） */
export const crossMoves = (paths: readonly string[], folder: string): { from: string; to: string }[] => topLevelPaths(paths).map((from) => ({ from, to: joinPath(folder, baseName(from)) }));

/**
 * 欄の間で動かしたあとの開いているフォルダ（元の欄からは動かしたものとその中を外し、行き先の欄には付け替えたものと、動かした先を見せる親のフォルダを足す）
 */
export function foldersAfterTransfer(fromOpen: readonly string[], toOpen: readonly string[], from: string, to: string): { from: string[]; to: string[] } {
  const moved = fromOpen.filter((p) => isUnder(p, from)).map((p) => remapPrefix(p, from, to));
  return { from: fromOpen.filter((p) => !isUnder(p, from)), to: [...new Set([...toOpen, ...moved, ...ancestorsOf(to)])] };
}
