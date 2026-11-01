import { useEffect, useRef, useState } from "react";
import type { ProviderStatus, Run, UsageWindow } from "../../../core/types";
import { api } from "../api";
import { cachedLoader } from "../cachedLoader";
import { formatTokens } from "../format";
import { useDismiss } from "../hooks/useDismiss";
import { resetIn } from "../time";
import { planLabel, usageLevel, usageUnavailableText, useSharedPlanUsage, weeklyModel } from "../usage";
import { ClaudeMark } from "./ClaudeMark";
import { RefreshButton } from "./IconButton";

// ログイン中のアカウントは、アプリ全体で 1 回だけ取得する
const loadProviders = cachedLoader<ProviderStatus[]>(api.providers, []);


/** 使用率の色（70% から注意、90% から警告） */
const TONES = { normal: "ok", warning: "warn", critical: "danger" } as const;
const tone = (pct: number) => TONES[usageLevel(pct)];

/**
 * チャット欄の右下の丸いメーター: コンテキストウィンドウの使用率。
 * マウスを乗せる（押すと固定）と、コンテキストの詳細とプランの使用枠を出す。
 */
export function ContextMeter({ run }: { run: Run }) {
  const planUsage = useSharedPlanUsage();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [account, setAccount] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const tokens = run.context_tokens;
  const windowSize = run.context_window;
  const pct = tokens !== null && windowSize ? Math.min(100, Math.round((tokens / windowSize) * 100)) : null;

  useEffect(() => {
    if (open) void loadProviders().then((list) => setAccount(list.find((p) => p.id === "claude")?.account));
  }, [open]);

  const close = () => {
    setPinned(false);
    setOpen(false);
  };
  // 固定しているときは、外側のクリック・Esc で閉じる
  useDismiss(ref, close, { enabled: pinned });
  const show = () => {
    clearTimeout(hideTimer.current);
    setOpen(true);
  };
  // マウスがポップオーバーへ移る間に閉じないよう、少し待ってから閉じる
  const hide = () => {
    if (pinned) return;
    hideTimer.current = setTimeout(() => setOpen(false), 150);
  };

  const usage = planUsage?.usage;
  const windows: UsageWindow[] = usage?.available
    ? [usage.five_hour, usage.seven_day, ...usage.model_weekly].filter((w) => w.utilization !== null)
    : [];

  return (
    <div ref={ref} className="context-meter" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        className="context-ring-button"
        aria-label={pct === null ? "コンテキストウィンドウ" : `コンテキストウィンドウ ${pct}% 使用`}
        aria-expanded={open}
        onClick={() => (pinned ? close() : (setPinned(true), setOpen(true)))}
      >
        <Ring pct={pct ?? 0} />
      </button>
      {open && (
        <div className="context-popover" role="dialog" aria-label="コンテキストウィンドウと使用枠">
          <section className="context-section">
            <div className="context-title">コンテキストウィンドウ</div>
            {pct === null ? (
              <p className="context-sub">次の応答のあとに表示されます</p>
            ) : (
              <>
                <div className="context-pct">{pct}%使用</div>
                <div className="context-sub">
                  {formatTokens(tokens!)} / {formatTokens(windowSize!)}トークン
                </div>
              </>
            )}
            <div className="context-sub">セッションコスト: ${run.cost_usd.toFixed(2)}（API 換算）</div>
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
              windows.map((w) => <UsageBar key={w.key} window={w} />)
            )}
            {usage?.extra_usage !== undefined && usage.extra_usage !== null && (
              <div className="context-row">
                <span className="context-sub">Extra usage</span>
                <span>{usage.extra_usage.enabled ? "Enabled" : "Disabled"}</span>
              </div>
            )}
            {account && <div className="context-sub">{account}</div>}
          </section>
        </div>
      )}
    </div>
  );
}

/** 使用枠の 1 行（"週間  25% 使用済み · 3日後にリセット" と横棒） */
function UsageBar({ window: w }: { window: UsageWindow }) {
  const pct = Math.round(w.utilization ?? 0);
  const reset = resetIn(w.resets_at);
  // 「週（Fable）」は 「週 · Fable」と書く
  const model = weeklyModel(w.label);
  const label = model ? `週 · ${model}` : w.label === "週" ? "週間" : w.label;
  return (
    <div className="context-usage">
      <div className="context-row">
        <span className="context-sub">{label}</span>
        <span>
          <strong>{pct}%</strong> 使用済み{reset && <span className="context-sub"> · {reset}</span>}
        </span>
      </div>
      <div className="context-bar">
        <span className={`context-bar-fill tone-${tone(pct)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 丸い進み具合（使用率に合わせて弧が伸びる） */
function Ring({ pct }: { pct: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className={`context-ring tone-${tone(pct)}`} aria-hidden>
      <circle cx="9" cy="9" r={r} className="context-ring-track" />
      <circle
        cx="9"
        cy="9"
        r={r}
        className="context-ring-fill"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}
