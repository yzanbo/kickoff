import { GitBranch, Settings } from "lucide-react";
import type { PlanUsage } from "../../../../core/types";
import type { ConnectionState } from "../../api";
import { href } from "../../router";
import { FIVE_HOUR_IDLE, planName, weeklyModel } from "../../usage";
import { useMainBranch } from "../../worktree/worktreeBranches";
import { CONNECTION_LABELS } from "./ConnectionPopover";
import { IconButton } from "../IconButton";
import { UsageMeter } from "./UsageMeter";

interface Props {
  onOpenSettings: () => void;
  connection: ConnectionState;
  connOpen: boolean;
  onConnClick: () => void;
  usage: PlanUsage | undefined;
  usageOpen: boolean;
  onUsageClick: () => void;
  /** いま開いているプロジェクト（ブランチを出す。全プロジェクトの画面ではなし） */
  projectId?: number;
}

/** 下の帯（左: 設定とサーバーとの接続・ブランチ / 右: 契約プランと使用状況。ターミナルの開閉は右上）。接続と使用状況は押すと詳細を出す */
export function AppFooter({ onOpenSettings, connection, connOpen, onConnClick, usage, usageOpen, onUsageClick, projectId }: Props) {
  return (
    <footer className="app-footer">
      {/* 設定は歯車だけ（ダイアログで開く）。サイドバーを閉じていても開ける */}
      <IconButton icon={Settings} label="設定" title="設定（⌘,）" className="footer-settings" onClick={onOpenSettings} />
      <button className={`footer-button conn conn-${connection} ${connOpen ? "active" : ""}`} title="接続の詳細" aria-expanded={connOpen} onClick={onConnClick}>
        {CONNECTION_LABELS[connection]}
      </button>
      {projectId !== undefined && <FooterBranch projectId={projectId} />}
      <span className="spacer" />
      {usage?.plan && (
        <span className="plan-chip" title={`${usage.provider_label} でログインしているアカウントの契約プラン`}>
          {planName(usage)}
        </span>
      )}
      {usage?.available ? (
        <button className={`footer-usage ${usageOpen ? "active" : ""}`} title="使用状況の詳細" aria-expanded={usageOpen} onClick={onUsageClick}>
          <UsageMeter window={usage.five_hour} inline idleText={FIVE_HOUR_IDLE} />
          <UsageMeter window={usage.seven_day} inline />
          {/* モデル別の週枠（Fable など）。フッターでは短く「Fable」と表示する */}
          {usage.model_weekly.map((w) => (
            <UsageMeter key={w.key} window={{ ...w, label: weeklyModel(w.label) ?? w.label }} inline />
          ))}
        </button>
      ) : (
        usage && <span className="muted">使用状況を取得できません</span>
      )}
    </footer>
  );
}

/** いまのプロジェクト（本体）のブランチ（VS Code の左下と同じ）。押すとエディタタブ（コミット・プッシュ・プル）を開く */
function FooterBranch({ projectId }: { projectId: number }) {
  const branch = useMainBranch(projectId);
  if (!branch) return null;
  return (
    <a className="footer-button footer-branch" href={href({ name: "project", id: projectId, tab: "changes" })} title={`ブランチ（本体）: ${branch}\n押すとエディタタブを開きます`}>
      <GitBranch size={13} aria-hidden /> {branch}
    </a>
  );
}
