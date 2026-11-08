import type { ReactNode } from "react";
import type { FolderInspection } from "@shared/types";
import { href } from "@/app/router";
import { useProjects } from "@/stores/projects";
import { folderOverlapLines, folderOverlaps } from "@/features/project/folderOverlaps";

export function InspectionPanel({ info, isSubfolder }: { info: FolderInspection; isSubfolder: boolean }) {
  const { projects, projectName } = useProjects();
  const items: { kind: "ok" | "warn" | "ng" | "info"; text: ReactNode }[] = [];

  if (!info.exists) {
    items.push({ kind: "ng", text: "フォルダが見つかりません" });
  } else if (!info.is_directory) {
    items.push({ kind: "ng", text: "フォルダではありません" });
  } else if (info.registered_project_id) {
    items.push({
      kind: "ng",
      text: (
        <>
          このフォルダは「{projectName(info.registered_project_id)}」としてすでに登録されています（<a href={href({ name: "project", id: info.registered_project_id, tab: "board" })}>開く</a>）
        </>
      ),
    });
  } else if (!info.is_git) {
    items.push({ kind: "warn", text: "git で管理されていません（下で、git の管理を始めるかを選べます）" });
  } else {
    if (isSubfolder) {
      items.push({
        kind: "info",
        text: info.parent_tracked
          ? `git リポジトリ（${info.git_root}）の中のフォルダです。変更・履歴・ワークツリーは、このフォルダの中だけを扱います（親のリポジトリがこの中のファイルを管理しているので、別のリポジトリにはできません）`
          : `git リポジトリ（${info.git_root}）の中のフォルダです（下で、このフォルダで別に git の管理を始めるかを選べます）`,
      });
    }
    items.push(
      info.has_commits
        ? { kind: "ok", text: `git リポジトリ（ブランチ: ${info.branch ?? "不明"}）` }
        : { kind: "warn", text: "git リポジトリですが、コミットがまだありません（下で、最初のコミットを作るかを選べます）" },
    );
    if (info.dirty) items.push({ kind: "info", text: "未コミットの変更があります（そのまま残ります）" });
    items.push(
      info.remote_url
        ? { kind: "ok", text: `remote: ${info.remote_url}` }
        : { kind: "info", text: "GitHub の remote（origin）が未設定です。PR を作るまでに設定してください" },
    );
  }

  // ほかのプロジェクトのフォルダの中・中にある（取り込める。同じフォルダは上の「登録されています」で止める）
  if (info.exists && info.is_directory && !info.registered_project_id) {
    items.push(...folderOverlapLines({ ...folderOverlaps(info.path, projects), same: [] }, "warn"));
  }

  return (
    <ul className="inspection">
      {items.map((item, i) => (
        <li key={i} className={`inspection-${item.kind}`}>
          <span className="inspection-icon" aria-hidden>
            {ICONS[item.kind]}
          </span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

const ICONS = { ok: "✓", warn: "⚠", ng: "✕", info: "ℹ" } as const;
