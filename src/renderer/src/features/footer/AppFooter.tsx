import { Check, GitBranch, Settings, Unplug, WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";
import type { ConnectionState } from "@/api/useServerConnection";
import { href } from "@/app/router";
import { FIVE_HOUR_IDLE, planName, type usePlanUsage } from "@/features/usage/usage";
import { useMainBranch } from "@/features/worktree/useWorkplace";
import type { SettingsSection } from "@/features/settings/SettingsDialog";
import { ConnectionPopover, connectionLabel } from "./ConnectionPopover";
import { useConnectionNotice } from "./useConnectionNotice";
import { IconButton } from "@/ui/IconButton";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { cx } from "@/lib/cx";
import { FOOTER_MODE_LABELS, FOOTER_MODES, useFooterMode } from "./footerMode";
import { usePopover } from "@/ui/Popover";
import { UsageMeter } from "@/features/usage/UsageMeter";
import { UsagePopover } from "@/features/usage/UsagePopover";
import { QueueResumeFooterButton } from "@/features/chat/queue/QueueResumeDialog";

interface Props {
  onOpenSettings: (section: SettingsSection) => void;
  /** Kickoff サーバーとの接続（状態と、最後につながった時刻） */
  connection: { state: ConnectionState; since: number | null };
  planUsage: ReturnType<typeof usePlanUsage>;
  /** いま開いているプロジェクト（ブランチを出す。全プロジェクトの画面ではなし） */
  projectId?: number;
}

/**
 * 下の帯（左: 設定・サーバーとの接続が切れたときの札・ブランチ / 右: 契約プランと使用状況。ターミナルの開閉は右上）。
 * 接続の札は、つながっている間は出さない（デスクトップ版ではサーバーはアプリの中で動き、いつも「接続済み」だったため）。
 * 接続の札と使用状況は押すと、その上に詳細を出す（画面は移らない）。
 * 出し方（表示 / 下端に寄せたときだけ表示 / 非表示。useFooterMode）は、帯の右クリックと設定の「表示」で選ぶ。下端に寄せたときだけ出すときは、
 * 画面の上に重ねて出し（縦の幅を取らない）、乗せている間・中の詳細を開いている間は出したままにする（.app-footer.auto-hide）
 */
export function AppFooter({ onOpenSettings, connection, planUsage, projectId }: Props) {
  const online = useOnline();
  const conn = usePopover();
  const notice = useConnectionNotice(connection.state);
  const usagePopover = usePopover();
  const usage = planUsage.usage;
  const [mode, setMode] = useFooterMode();
  const menu = useContextMenu();
  if (mode === "hide") return null;
  return (
    <footer className={cx("app-footer", mode === "hover" && "auto-hide")} onContextMenu={menu.open}>
      {/* 設定は歯車だけ（ダイアログで開く）。サイドバーを閉じていても開ける */}
      <IconButton icon={Settings} label="設定" title="設定（⌘,）" className="footer-settings" onClick={() => onOpenSettings("usage")} />
      {/* サーバーとの接続が切れたときだけ（SSE が切れると返答・状態・承認待ちが止まって見え、操作も失敗する）。
          詳細を開いている間につながったら、閉じるまで残す */}
      {(notice || conn.open) && (
        <button
          ref={conn.anchor}
          className={cx("footer-button conn", connection.state !== "open" && "conn-down", conn.open && "active")}
          title={connection.state === "open" ? "接続の詳細" : "Kickoff サーバーとの接続が切れています。返答・状態の知らせが止まり、操作も失敗します。押すと詳細を開きます"}
          aria-expanded={conn.open}
          onClick={conn.toggle}
        >
          {connection.state === "open" ? null : <Unplug size={13} aria-hidden />}
          {connectionLabel(connection.state, connection.since)}
        </button>
      )}
      {conn.open && (
        <ConnectionPopover
          anchor={conn.anchor}
          state={connection.state}
          since={connection.since}
          onClose={conn.close}
          onOpenSettings={() => onOpenSettings("connection")}
        />
      )}
      {/* Wi-Fi が切れている（作業中のチャットは止まることがある。つながったら自動で再開する） */}
      {!online && (
        <span className="footer-offline" title="ネットワークにつながっていません。作業中のチャットが止まったら、つながったときに自動で再開します（設定の「チャット」）">
          <WifiOff size={13} aria-hidden /> オフライン
        </span>
      )}
      {projectId !== undefined && <FooterBranch projectId={projectId} />}
      {/* 起動したときの送信待ちの確かめで、まだ決めていないもの（押すとダイアログを開き直す） */}
      <QueueResumeFooterButton />
      <span className="spacer" />
      {usage?.plan && (
        <span className="plan-chip" title={`${usage.provider_label} でログインしているアカウントの契約プラン`}>
          {planName(usage)}
        </span>
      )}
      {usage?.available ? (
        <button
          ref={usagePopover.anchor}
          className={`footer-usage ${usagePopover.open ? "active" : ""}`}
          title="使用状況の詳細"
          aria-expanded={usagePopover.open}
          onClick={usagePopover.toggle}
        >
          <UsageMeter window={usage.five_hour} inline idleText={FIVE_HOUR_IDLE} />
          <UsageMeter window={usage.seven_day} inline />
          {/* モデル別の週枠（Fable など）。1 行表示では短く「Fable」と出す（usageWindowLabel） */}
          {usage.model_weekly.map((w) => (
            <UsageMeter key={w.key} window={w} inline />
          ))}
        </button>
      ) : (
        usage && <span className="muted">使用状況を取得できません</span>
      )}
      {usagePopover.open && <UsagePopover anchor={usagePopover.anchor} planUsage={planUsage} onClose={usagePopover.close} />}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="下の帯の出し方" onClose={menu.close}>
          <div className="menu-label">下の帯</div>
          {FOOTER_MODES.map((m) => (
            <MenuItem
              key={m}
              role="menuitemradio"
              checked={m === mode}
              title={m === "hide" ? "戻すときは、設定（⌘,）の「表示」→「下の帯」から" : undefined}
              onSelect={() => setMode(m)}
            >
              <span className="project-switch-item">{FOOTER_MODE_LABELS[m]}</span>
              {m === mode && <Check size={14} aria-hidden />}
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </footer>
  );
}

/** いまのプロジェクト（本体）のブランチ（VS Code の左下と同じ）。押すとファイルタブ（コミット・プッシュ・プル）を開く */
function FooterBranch({ projectId }: { projectId: number }) {
  const branch = useMainBranch(projectId);
  if (!branch) return null;
  return (
    <a className="footer-button footer-branch" href={href({ name: "project", id: projectId, tab: "changes" })} title={`ブランチ（本体）: ${branch}\n押すと変更タブを開きます`}>
      <GitBranch size={13} aria-hidden /> {branch}
    </a>
  );
}
