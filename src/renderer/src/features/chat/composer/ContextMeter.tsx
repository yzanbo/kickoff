import { Shrink } from "lucide-react";
import type { Chat, UsageWindow } from "@shared/types";
import { api } from "@/api";
import { useProviders } from "@/stores/providers";
import { cx } from "@/lib/cx";
import { useAction } from "@/hooks/useAction";
import { formatTokens } from "@/lib/format";
import { planLabel, usageLevel, usageUnavailableText, useSharedPlanUsage } from "@/features/usage/usage";
import { UsageBar, UsageMeter } from "@/features/usage/UsageMeter";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { ErrorText } from "@/ui/ErrorText";
import { RefreshButton } from "@/ui/IconButton";
import { Popover, usePopover } from "@/ui/Popover";
import { COMPACTING_LABEL } from "@/features/chat/status/workingLabel";

/** 丸いメーターの色（70% から注意、90% から警告） */
const TONES = { normal: "ok", warning: "warn", critical: "danger" } as const;
const tone = (pct: number) => TONES[usageLevel(pct)];

/**
 * チャット欄の右下の丸いメーター: コンテキストウィンドウの使用率。
 * 押すと、コンテキストの詳細とプランの使用枠を出す（もう一度押す・ポップオーバーの外を押す・Esc で閉じる。マウスを乗せただけでは出さない）。
 * 会話を圧縮している間（手で圧縮した・上限に近づいて自動で）は、弧を回して知らせる（終わるとコンテキストの大きさが届き、弧が縮む）。
 */
export function ContextMeter({ chat, compacting = false }: { chat: Chat; compacting?: boolean }) {
  const planUsage = useSharedPlanUsage();
  // 押すとメーターの上に開く詳細（もう一度押す・外を押す・Esc で閉じる。右端をメーターにそろえる）
  const popover = usePopover<HTMLDivElement>();
  const open = popover.open;
  // ログイン中のアカウント（開いたときに取り直す。届くまでは前に取ったもの）
  const account = useProviders({ active: open }).data?.find((p) => p.id === "claude")?.account;

  // まだ数値が届いていないとき（新しいチャット・要約の直後など）は 0% として出す
  const tokens = chat.context_tokens ?? 0;
  const windowSize = chat.context_window;
  const pct = windowSize ? Math.min(100, Math.round((tokens / windowSize) * 100)) : 0;

  const usage = planUsage?.usage;
  const windows: UsageWindow[] = usage?.available
    ? [usage.five_hour, usage.seven_day, ...usage.model_weekly].filter((w) => w.utilization !== null)
    : [];

  // 手で圧縮する（作業中・まだ会話がないときはできない）。終わると compact イベントとコンテキストの大きさが届く
  const canCompact = Boolean(chat.session_id) && chat.status !== "running";
  // 手で圧縮する操作の失敗（始めたら、終わるまでは圧縮中の弧で知らせる）
  const compactAction = useAction<"compact">();
  const compact = () => compactAction.run("compact", () => api.compactChat(chat.id));

  return (
    <div ref={popover.anchor} className="context-meter">
      <button
        type="button"
        className="context-ring-button"
        aria-label={compacting ? `${COMPACTING_LABEL}（コンテキストウィンドウ ${pct}% 使用）` : `コンテキストウィンドウ ${pct}% 使用`}
        aria-busy={compacting || undefined}
        aria-expanded={open}
        title={open ? "閉じる" : compacting ? `${COMPACTING_LABEL}（これまでの会話を要約して、コンテキストを空けています）` : "コンテキストと使用枠の詳細を表示"}
        onClick={popover.toggle}
      >
        <Ring pct={pct} compacting={compacting} />
      </button>
      {open && (
        <Popover anchor={popover.anchor} side="above" align="end" gap={8} label="コンテキストウィンドウと使用枠" className="context-popover" onClose={popover.close}>
          <section className="context-section">
            <div className="context-title">コンテキストウィンドウ</div>
            <div className="context-row">
              <span className="context-pct">{pct}%使用</span>
              {windowSize && (
                <span className="context-sub">
                  {formatTokens(tokens)} / {formatTokens(windowSize)}トークン
                </span>
              )}
            </div>
            {/* どれだけ使っているかを、数字だけでなく棒でも見せる（使用枠と同じバー） */}
            <UsageBar percent={pct} label="コンテキストウィンドウの使用率" valueText={`${pct}% 使用`} />
            <div className="context-sub">セッションコスト: ${chat.cost_usd.toFixed(2)}（API 換算）</div>
            {/* 会話を要約して、コンテキストを空ける（Claude Code の /compact） */}
            <div className="context-compact">
              <button
                type="button"
                className="btn btn-sm"
                title="これまでの会話を要約して、コンテキストを空けます"
                disabled={!canCompact}
                onClick={() => void compact()}
              >
                <Shrink size={13} /> {compacting ? "圧縮中…" : "会話を圧縮"}
              </button>
            </div>
            <ErrorText message={compactAction.error} />
          </section>

          <section className="context-section">
            <div className="context-plan-head">
              <ClaudeMark size={18} />
              <span className="context-plan-name">{usage?.provider_label ?? "Claude"}</span>
              {usage?.plan && <span className="context-plan-chip">{planLabel(usage.plan)}</span>}
              <span className="spacer" />
              <RefreshButton
                label="使用枠を更新"
                busy={Boolean(planUsage?.refreshing)}
                type="button"
                onClick={() => void planUsage?.refresh()}
              />
            </div>
            {!usage ? (
              <p className="context-sub">取得中…</p>
            ) : !usage.available ? (
              <p className="context-sub">{usageUnavailableText(usage)}</p>
            ) : (
              // 使用枠は、下の帯の使用状況の詳細と同じメーター
              windows.map((w) => <UsageMeter key={w.key} window={w} />)
            )}
            {usage?.extra_usage !== undefined && usage.extra_usage !== null && (
              <div className="context-row">
                <span className="context-sub">Extra usage</span>
                <span>{usage.extra_usage.enabled ? "Enabled" : "Disabled"}</span>
              </div>
            )}
            {account && <div className="context-sub">{account}</div>}
          </section>
        </Popover>
      )}
    </div>
  );
}

/** 圧縮している間に回す弧の長さ（%） */
const COMPACTING_ARC = 28;

/** 丸い進み具合（使用率に合わせて弧が伸びる。圧縮している間は、短い弧をアクセントの色で回す（使用率が高いときは弧がほぼ一周で、回しても分かりにくいため）） */
function Ring({ pct, compacting }: { pct: number; compacting: boolean }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className={cx("context-ring", `tone-${tone(pct)}`, compacting && "compacting")} aria-hidden>
      <circle cx="9" cy="9" r={r} className="context-ring-track" />
      <circle
        cx="9"
        cy="9"
        r={r}
        className="context-ring-fill"
        strokeDasharray={`${(c * (compacting ? COMPACTING_ARC : pct)) / 100} ${c}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}
