// ターミナルを開くフォルダの決め方（パソコンの下の欄の行き先と、スマホから始めるシェルで同じにする）
import { HOME_FOLDER } from "@shared/foundation/path";
import { isCommonProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";

/**
 * プロジェクトのターミナルを開くフォルダ: ふつうは本体、共通はホームフォルダ（HOME_FOLDER の印。開くときにコアが展開する）。
 * 共通のチャットの AI は作業フォルダ（.common-work）で動くが、共通のターミナルはどこにも属さないコマンド（brew install・git clone など）用なので場所を分ける
 */
export function terminalFolderOf(project: Pick<Project, "kind" | "repo_path">): string {
  return isCommonProject(project) ? HOME_FOLDER : project.repo_path;
}
