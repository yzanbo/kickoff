import { Shrink, X } from "lucide-react";
import type { Chat, CompactingState, UsageWindow } from "@shared/types";
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
import { compactingLabel } from "@/features/chat/status/workingLabel";

/** 丸いメーターの色（70% から注意、90% から警告） */
const TONES = { normal: "ok", warning: "warn", critical: "danger" } as const;
const tone = (pct: number) => TONES[usageLevel(pct)];

/**
 * チャット欄の右下の丸いメーター: コンテキストウィンドウの使用率。
 * 押すと、コンテキストの詳細とプランの使用枠を出す（もう一度押す・ポップオーバーの外を押す・Esc で閉じる。マウスを乗せただけでは出さない）。
 * 会話を圧縮している間（手で圧縮した・上限に近づいて自動で）は、弧を回して知らせる（終わるとコンテキストの大きさが届き、弧が縮む）。
 * 作業中の「会話を圧縮」は「このやり取りのあとで圧縮」（予約。終わったら送信待ちより先にすぐ圧縮する）になり、予約中は「取り消す」を出す。
 */
export function ContextMeter({ chat, compacting, compactNext }: { chat: Chat; compacting: CompactingState | null; compactNext: boolean }) {
  const compactingText = compacting ? compactingLabel(compacting.trigger) : null;
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

  // 手で圧縮する。作業中なら予約（このやり取りが終わったら、送信待ちより先にすぐ圧縮する）。まだ会話がない・圧縮中はできない。
  // 終わると compact イベントとコンテキストの大きさが届く
  const running = chat.status === "running";
  const canCompact = (Boolean(chat.session_id) || running) && !compacting;
  // 押したらポップオーバーを閉じ、圧縮中の弧（作業中なら流れの予約の行）で知らせる（できなかったときは開き直して失敗の文を見せる）
  const compactAction = useAction<"compact" | "cancel">();
  const compact = async () => {
    popover.close();
    if (!(await compactAction.run("compact", () => api.compactChat(chat.id)))) popover.setOpen(true);
  };
  const cancelReserved = () => void compactAction.run("cancel", () => api.cancelCompact(chat.id));
  const compactButton = compacting
    ? { label: "圧縮中…", title: "これまでの会話を要約して、コンテキストを空けています" }
    : running
      ? { label: "このやり取りのあとで圧縮", title: "いまのやり取りが終わったら、送信待ちの指示より先にすぐ会話を圧縮します" }
      : { label: "会話を圧縮", title: "これまでの会話を要約して、コンテキストを空けます" };

  return (
    <div ref={popover.anchor} className="context-meter">
      <button
        type="button"
        className="context-ring-button"
        aria-label={compactingText ? `${compactingText}（コンテキストウィンドウ ${pct}% 使用）` : `コンテキストウィンドウ ${pct}% 使用${compactNext ? "・このやり取りのあとで圧縮します" : ""}`}
        aria-busy={compacting ? true : undefined}
        aria-expanded={open}
        title={open ? "閉じる" : compactingText ? `${compactingText}（これまでの会話を要約して、コンテキストを空けています）` : "コンテキストと使用枠の詳細を表示"}
        onClick={popover.toggle}
      >
        <Ring pct={pct} compacting={compacting !== null} />
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
            {/* チャットの見出しの行を隠していても見られるよう、見出しのターン数と API 換算をここにも出す */}
            <div className="context-sub">
              {chat.num_turns > 0 && `${chat.num_turns} ターン · `}セッションコスト: ${chat.cost_usd.toFixed(2)}（API 換算）
            </div>
            {/* 会話を要約して、コンテキストを空ける（Claude Code の /compact） */}
            <div className="context-compact">
              {compactNext && running && !compacting ? (
                // 予約している: このやり取りが終わったら圧縮が始まる。取り消せる
                <>
                  <span className="context-compact-note">
                    <Shrink size={13} aria-hidden /> このやり取りが終わったら圧縮します
                  </span>
                  <button type="button" className="btn btn-sm" title="圧縮の予約を取り消します" onClick={cancelReserved}>
                    <X size={13} /> 取り消す
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-sm" title={compactButton.title} disabled={!canCompact} onClick={() => void compact()}>
                  <Shrink size={13} /> {compactButton.label}
                </button>
              )}
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
