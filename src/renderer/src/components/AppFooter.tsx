import type { PlanUsage } from "../../../core/types";
import type { ConnectionState } from "../api";
import { FIVE_HOUR_IDLE, planName, weeklyModel } from "../usage";
import { CONNECTION_LABELS } from "./ConnectionPopover";
import { UsageMeter } from "./UsageMeter";

interface Props {
  connection: ConnectionState;
  connOpen: boolean;
  onConnClick: () => void;
  usage: PlanUsage | undefined;
  usageOpen: boolean;
  onUsageClick: () => void;
}

/** 下の帯（左: サーバーとの接続 / 右: 契約プランと使用状況）。押すと詳細を出す */
export function AppFooter({ connection, connOpen, onConnClick, usage, usageOpen, onUsageClick }: Props) {
  return (
    <footer className="app-footer">
      <button className={`conn conn-${connection} ${connOpen ? "active" : ""}`} title="接続の詳細" aria-expanded={connOpen} onClick={onConnClick}>
        {CONNECTION_LABELS[connection]}
      </button>
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
