// AI のツールが指せるプロジェクト。共通のチャット（共通のプロジェクトのチャット）からは、共通と、アーカイブしていない利用者のプロジェクトを指せる
// （全プロジェクトのチャット・ノートを読むため）。プロジェクトのチャットからは自分のプロジェクトだけ（ほかを指したら断る。ほかの名前も教えない）
import { z } from "zod";
import type { Chat } from "@shared/chat/types";
import { isActiveUserProject, isCommonProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import type { ProjectStore } from "@/features/projects/core/index";

type Projects = Pick<ProjectStore, "get" | "list">;

/** AI が渡すプロジェクトの指し方（名前か ID。省けば呼んだチャットのプロジェクト） */
export const projectRefInput = (what: string) =>
  z.union([z.number().int(), z.string().min(1)]).optional().describe(`${what}プロジェクトの名前か ID（省くと、このチャットのプロジェクト）。ほかのプロジェクトを指せるのは共通のチャットからだけ`);

/** projectId のプロジェクトが共通か（共通のチャットか、の見分け。ないプロジェクトは false） */
export function isCommonChatProject(projects: Pick<ProjectStore, "get">, projectId: number): boolean {
  const project = projects.get(projectId);
  return project !== undefined && isCommonProject(project);
}

/** 呼んだチャットから指せるプロジェクト（共通のチャット: 共通と、アーカイブしていない利用者のプロジェクト（サイドバーの並び）。ほか: 自分のプロジェクトだけ） */
export function readableProjects(projects: Projects, self: Chat): Project[] {
  const own = projects.get(self.project_id);
  if (!own) return [];
  if (!isCommonProject(own)) return [own];
  return [own, ...projects.list().filter(isActiveUserProject)];
}

/** 名前の比べ方（大文字・小文字・全角半角・前後の空白の違いは同じに見る） */
const loose = (s: string) => s.normalize("NFKC").trim().toLowerCase();

/** 指せるプロジェクトの一覧の文（断る文に添える） */
const choicesText = (list: readonly Project[]) => list.map((p) => `「${p.name}」（ID ${p.id}）`).join("、");

/** list の中で text（名前か ID）が指すもの: ID → 同じ名前 → 大文字・小文字などだけが違う名前の順（重なれば複数） */
function matchProjects(list: readonly Project[], text: string): Project[] {
  const byId = /^\d+$/.test(text) ? list.find((p) => p.id === Number(text)) : undefined;
  if (byId) return [byId];
  const exact = list.filter((p) => p.name === text);
  return exact.length > 0 ? exact : list.filter((p) => loose(p.name) === loose(text));
}

/**
 * given（名前か ID。省けば呼んだチャットのプロジェクト）が指す、呼んだチャットから指せるプロジェクト。
 * ID → 同じ名前 → 大文字・小文字などだけが違う名前の順に探す。指せない・見つからない・名前が重なるときは理由の文で throw
 */
export function projectForTool(projects: Projects, self: Chat, given: string | number | undefined): Project {
  const list = readableProjects(projects, self);
  const own = list.find((p) => p.id === self.project_id);
  if (!own) throw new Error("このチャットのプロジェクトが見つかりません");
  if (given === undefined) return own;
  const text = String(given).trim();
  const found = matchProjects(list, text);
  if (found.length === 1) return found[0];
  if (!isCommonProject(own)) throw new Error(`プロジェクトのチャットからは、ほかのプロジェクトを指せません（指せるのはこのプロジェクト「${own.name}」だけ。ほかのプロジェクトを読めるのは共通のチャットからだけです）`);
  if (found.length > 1) throw new Error(`「${text}」という名前のプロジェクトが複数あります。ID で指してください: ${choicesText(found)}`);
  throw new Error(`プロジェクト「${text}」は見つかりません（指せるのは、アーカイブしていないプロジェクトだけです）。指せるプロジェクト: ${choicesText(list)}`);
}

/**
 * チャットを移す先のプロジェクト（given = 名前か ID）。プロジェクトのチャットからも、共通とアーカイブしていない利用者のプロジェクトを指せる
 * （画面の「プロジェクトを変更」と同じ行き先。移すのは自分のチャットだけなので、ほかのプロジェクトの中身は教えない）
 */
export function moveTargetProject(projects: Projects, given: string | number): Project {
  const list = projects.list().filter((p) => isCommonProject(p) || isActiveUserProject(p));
  const text = String(given).trim();
  const found = matchProjects(list, text);
  if (found.length === 1) return found[0];
  if (found.length > 1) throw new Error(`「${text}」という名前のプロジェクトが複数あります。ID で指してください: ${choicesText(found)}`);
  throw new Error(`移す先のプロジェクト「${text}」は見つかりません（移せるのは、共通とアーカイブしていないプロジェクトだけです）。移せるプロジェクト: ${choicesText(list)}`);
}

/**
 * ほかのプロジェクトへの書き込みか（共通のチャットから利用者のプロジェクトに書く。設定「共通のチャットがほかのプロジェクトに書くとき」の場面）。
 * 共通の中・自分のプロジェクトの中・プロジェクトのチャットからは false
 */
export function isOtherProjectWrite(projects: Pick<ProjectStore, "get">, self: Chat, target: Project): boolean {
  return target.id !== self.project_id && !isCommonProject(target) && isCommonChatProject(projects, self.project_id);
}
