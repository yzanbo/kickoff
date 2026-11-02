import { Settings, SquareTerminal } from "lucide-react";
import type { PlanUsage } from "../../../core/types";
import type { ConnectionState } from "../api";
import { FIVE_HOUR_IDLE, planName, weeklyModel } from "../usage";
import { CONNECTION_LABELS } from "./ConnectionPopover";
import { IconButton } from "./IconButton";
import { UsageMeter } from "./UsageMeter";

interface Props {
  onOpenSettings: () => void;
  connection: ConnectionState;
  connOpen: boolean;
  onConnClick: () => void;
  usage: PlanUsage | undefined;
  usageOpen: boolean;
  onUsageClick: () => void;
  /** 下のパネルのターミナルの開閉（Mac のアプリでだけ） */
  terminal?: { open: boolean; onClick: () => void; /** ほかのプロジェクトで動いているシェルの数 */ elsewhere: number };
}

/** 下の帯（左: 設定とサーバーとの接続・ターミナルの開閉 / 右: 契約プランと使用状況）。接続と使用状況は押すと詳細を出す */
export function AppFooter({ onOpenSettings, connection, connOpen, onConnClick, usage, usageOpen, onUsageClick, terminal }: Props) {
  return (
    <footer className="app-footer">
      {/* 設定は歯車だけ（ダイアログで開く）。サイドバーを閉じていても開ける */}
      <IconButton icon={Settings} label="設定" title="設定（⌘,）" className="footer-settings" onClick={onOpenSettings} />
      <button className={`footer-button conn conn-${connection} ${connOpen ? "active" : ""}`} title="接続の詳細" aria-expanded={connOpen} onClick={onConnClick}>
        {CONNECTION_LABELS[connection]}
      </button>
      {terminal && (
        <button className={`footer-button footer-terminal ${terminal.open ? "active" : ""}`} title="ターミナル（⌃` / ⌘J）" aria-expanded={terminal.open} onClick={terminal.onClick}>
          <SquareTerminal size={13} aria-hidden /> ターミナル
          {terminal.elsewhere > 0 && (
            <span className="tab-count" title={`ほかのプロジェクトで ${terminal.elsewhere} 個のターミナルが動いています`}>
              ほか {terminal.elsewhere}
            </span>
          )}
        </button>
      )}
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
