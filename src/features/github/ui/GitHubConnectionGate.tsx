import "./GitHubConnectionGate.css";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { GITHUB_DEFAULT_HOST } from "@shared/foundation/codeHost";
import { api } from "@/foundation/ui/api";
import { errorText, useQuery } from "@/foundation/ui/query";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";

/** プロジェクトの GitHub の連携先が使えるか（GitHub・CI のタブと新しい issue の確認が読む。使えなければ reason に理由） */
export const useGitHubConnection = (projectId: number) =>
  useQuery(["github.connection", projectId], () => api.githubConnection(projectId), { keepPrevious: true });

/**
 * GitHub の連携先が使えるときだけ中身を描く（確かめている間は「確認中…」、使えなければ理由と「もう一度確かめる」）。
 * title は使えないときの見出し（repo は連携先のリポジトリ。なければ null）、note はその下の補足
 */
export function GitHubConnectionGate({
  projectId,
  icon,
  title,
  note,
  children,
}: {
  projectId: number;
  icon: LucideIcon;
  title: (repo: string) => string;
  note: string;
  children: (conn: { host: string; repo: string }) => ReactNode;
}) {
  const connection = useGitHubConnection(projectId);
  const conn = connection.data;
  if (connection.error) return <div className="github-tab"><ErrorText message={errorText(connection.error)} /></div>;
  if (!conn) return <div className="github-tab muted small github-tab-loading">確認中…</div>;
  if (conn.reason)
    return (
      <div className="github-tab">
        <EmptyState
          icon={icon}
          title={conn.repo ? title(conn.repo) : "GitHub のリポジトリにつながっていません"}
          actions={
            <button type="button" className="btn" data-size="sm" onClick={connection.reload}>
              もう一度確かめる
            </button>
          }
        >
          <p>{conn.reason}</p>
          <p className="muted small">{note}</p>
        </EmptyState>
      </div>
    );
  return children({ host: conn.host ?? GITHUB_DEFAULT_HOST, repo: conn.repo ?? "" });
}
