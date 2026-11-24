// GitHub タブで issue・PR を開く（チャットの見出し・ボードのカードの札は行き先 githubItem で、本文のリンクは直に呼ぶ）
import type { GitHubLink, GitHubKind } from "@shared/chat/types";
import { navigate } from "@/foundation/ui/navigation/router";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "./storage";
import { isSideViewShown, showSideView } from "@/features/projects/ui";

/** GitHub タブで開いているものをその issue・PR にする（一覧を issue｜PR のその種類にし、中身にそれを出す。プロジェクトのタブと右の欄で同じ値） */
export function selectGitHubItem(projectId: number, link: Pick<GitHubLink, "kind" | "number">) {
  writeSetting(storage.settings.filters(projectId), { ...readSetting(storage.settings.filters(projectId)), kind: link.kind });
  writeSetting(storage.settings.selected(projectId), `${link.kind}:${link.number}`);
}

/** 保存した開いているもの（「issue:12」「pr:5」）を読む（読めなければ null） */
export function parseGitHubSelected(text: string): { kind: GitHubKind; number: number } | null {
  const m = /^(issue|pr):(\d+)$/.exec(text);
  return m ? { kind: m[1] as GitHubKind, number: Number(m[2]) } : null;
}

/** プロジェクトの GitHub タブへ移って、その issue・PR を開く */
export function openGitHubItem(projectId: number, link: Pick<GitHubLink, "kind" | "number">) {
  selectGitHubItem(projectId, link);
  // 右サイドバーが GitHub を見せていれば、真ん中の画面は動かさずに右サイドバーで開く（開いているものは設定で共有）
  if (isSideViewShown(projectId, "github")) return showSideView(projectId, "github");
  navigate({ name: "project", id: projectId, tab: "github" });
}
