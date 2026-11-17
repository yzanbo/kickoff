import type { ProviderStatus } from "@shared/types";
import { CommandLine } from "@/ui/CommandLine";

/**
 * 設定の「接続」の AI のカードに添える CLI の版と、新しい版の知らせ（コアの /api/providers の version・bundled・update）。
 * 同梱の Claude Code は版だけ（上げるのは Kickoff の開発の側）。利用者が入れた CLI（いまは Codex）は、新しい版が出ていれば上げるコマンドも出す
 */
export function ProviderVersion({ provider }: { provider: Pick<ProviderStatus, "version" | "bundled" | "update"> }) {
  const { version, bundled, update } = provider;
  if (!version && !update) return null;
  return (
    <div className="provider-version">
      {version && <div className="muted small">版 {version}{bundled ? "（Kickoff に同梱）" : ""}</div>}
      {update && (
        <div className="provider-update">
          <div className="small">
            新しい版 {update.latest} が出ています（{update.source}）。ターミナルで流して上げてください。
          </div>
          <CommandLine command={update.command} />
        </div>
      )}
    </div>
  );
}
