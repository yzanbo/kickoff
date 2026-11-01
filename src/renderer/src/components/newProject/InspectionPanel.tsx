import type { ReactNode } from "react";
import type { WorkspaceInspection } from "../../../../core/types";
import { href } from "../../router";

export function InspectionPanel({
  info,
  isSubfolder,
  onUseRoot,
}: {
  info: WorkspaceInspection;
  isSubfolder: boolean;
  onUseRoot: () => void;
}) {
  const items: { kind: "ok" | "warn" | "ng" | "info"; text: ReactNode }[] = [];

  if (!info.exists) {
    items.push({ kind: "ng", text: "フォルダが見つかりません" });
  } else if (!info.isDirectory) {
    items.push({ kind: "ng", text: "フォルダではありません" });
  } else if (info.registered_project_id) {
    items.push({
      kind: "ng",
      text: (
        <>
          このフォルダはすでに登録されています（<a href={href({ name: "project", id: info.registered_project_id, tab: "board" })}>開く</a>）
        </>
      ),
    });
  } else if (isSubfolder) {
    items.push({
      kind: "ng",
      text: (
        <>
          git リポジトリの一部です。ルート（{info.gitRoot}）を指定してください{" "}
          <button type="button" className="link-button accent" onClick={onUseRoot}>
            ルートを使う
          </button>
        </>
      ),
    });
  } else if (!info.isGit) {
    items.push({ kind: "warn", text: "git で管理されていません" });
  } else {
    items.push(
      info.hasCommits
        ? { kind: "ok", text: `git リポジトリ（ブランチ: ${info.branch ?? "不明"}）` }
        : { kind: "warn", text: "git リポジトリですが、コミットがまだありません" },
    );
    if (info.dirty) items.push({ kind: "info", text: "未コミットの変更があります（そのまま残ります）" });
    items.push(
      info.remoteUrl
        ? { kind: "ok", text: `remote: ${info.remoteUrl}` }
        : { kind: "info", text: "GitHub の remote（origin）が未設定です。PR を作るまでに設定してください" },
    );
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
