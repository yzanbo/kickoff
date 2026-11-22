import { Check, GitBranch, Settings, TriangleAlert, Unplug, WifiOff } from "lucide-react";
import { useOnline } from "@/foundation/ui/hooks/useOnline";
import { usePopover } from "@/foundation/ui/kit/Popover";
import type { usePlanUsage } from "@/features/ai/ui/usage/usage";
import { FooterUsage } from "@/features/ai/ui/usage/FooterUsage";
import type { ConnectionState } from "@/foundation/ui/api/serverConnection";
import { href } from "@/foundation/ui/navigation/router";
import { useMainBranch } from "@/foundation/ui/workplace/useWorkplace";
import type { SettingsSection } from "@/features/settings/ui/SettingsDialog";
import { ConnectionPopover, connectionLabel } from "@/features/devices/ui/ConnectionPopover";
import { useConnectionNotice } from "@/features/devices/ui/useConnectionNotice";
import { toolNotices } from "@/features/ai/ui/toolNotices";
import { useGitHubStatus, useProviders } from "@/features/ai/ui/stores/providers";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { cx } from "@/foundation/ui/lib/cx";
import { FOOTER_MODE_LABELS, FOOTER_MODES, useFooterMode } from "@/foundation/ui/shell/footerMode";
import { RestartResumeFooterButton } from "@/features/queue/ui";
import { PortsButton, PortsFallback } from "@/features/ports/ui/PortsButton";
import { portsAvailable } from "@/features/ports/ui/portsStore";

interface Props {
  onOpenSettings: (section: SettingsSection) => void;
  /** Kickoff サーバーとの接続（状態と、最後につながった時刻） */
  connection: { state: ConnectionState; since: number | null };
  planUsage: ReturnType<typeof usePlanUsage>;
  /** いま開いているプロジェクト（ブランチを出す。全プロジェクトの画面ではなし） */
  projectId?: number;
}

/**
 * 下の帯（左: 設定・サーバーとの接続が切れたときの札・CLI が使えないときの札・ブランチ・ポートを使っているプロセス / 右: AI ごとの契約プランと使用状況（FooterUsage）。ターミナルの開閉は右上）。
 * 接続の札は、つながっている間は出さない（デスクトップ版ではサーバーはアプリの中で動き、いつも「接続済み」だったため）。
 * 接続の札と使用状況は押すと、その上に詳細を出す（画面は移らない）。
 * 出し方（表示 / 下端に寄せたときだけ表示 / 非表示。useFooterMode）は、帯の右クリックと設定の「表示」で選ぶ。下端に寄せたときだけ出すときは、
 * 画面の上に重ねて出し（縦の幅を取らない）、乗せている間・中の詳細を開いている間は出したままにする（.app-footer.auto-hide）
 */
export function AppFooter({ onOpenSettings, connection, planUsage, projectId }: Props) {
  const online = useOnline();
  const { anchor: connAnchor, ...conn } = usePopover();
  const notice = useConnectionNotice(connection.state);
  const [mode, setMode] = useFooterMode();
  const menu = useContextMenu();
  // 隠していても、⌘K から「ポートを使っているプロセス」を開ける
  if (mode === "hide") return portsAvailable() ? <PortsFallback /> : null;
  return (
    <footer className={cx("app-footer", mode === "hover" && "auto-hide")} onContextMenu={menu.open}>
      {/* 設定は歯車だけ（ダイアログで開く）。サイドバーを閉じていても開ける */}
      <IconButton icon={Settings} label="設定" title="設定（⌘,）" className="footer-settings" onClick={() => onOpenSettings("usage")} />
      {/* サーバーとの接続が切れたときだけ（SSE が切れると返答・状態・承認待ちが止まって見え、操作も失敗する）。
          詳細を開いている間につながったら、閉じるまで残す */}
      {(notice || conn.open) && (
        <button
          ref={connAnchor}
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
          anchor={connAnchor}
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
      <ToolNotices onOpen={() => onOpenSettings("connection")} />
      {projectId !== undefined && <FooterBranch projectId={projectId} />}
      {/* プロジェクトのフォルダでポートを開いているプロセス（0 なら出さない。AI が残した開発サーバーに気付いて止める。Mac のアプリの中だけ） */}
      {portsAvailable() && <PortsButton />}
      {/* 起動したときの再開の確かめで、まだ決めていないもの（押すとダイアログを開き直す） */}
      <RestartResumeFooterButton />
      <span className="spacer" />
      <FooterUsage planUsage={planUsage} />
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

/** Claude Code・gh が使えないときの札（ふだんは出さない。押すと設定の「接続」を開き、そこで確かめ直す） */
function ToolNotices({ onOpen }: { onOpen: () => void }) {
  const providers = useProviders();
  const github = useGitHubStatus();
  return toolNotices(providers.data, github.data).map((n) => (
    <button key={n.key} type="button" className="footer-button conn-down" title={n.title} onClick={onOpen}>
      <TriangleAlert size={13} aria-hidden /> {n.label}
    </button>
  ));
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
