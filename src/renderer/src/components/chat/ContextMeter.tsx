import { Shrink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProviderStatus, Run, UsageWindow } from "../../../../core/types";
import { api } from "../../api";
import { cachedLoader } from "../../cachedLoader";
import { cx } from "../../cx";
import { errorMessage } from "../../errors";
import { formatTokens } from "../../format";
import { useDismiss } from "../../hooks/useDismiss";
import { resetIn } from "../../time";
import { planLabel, usageLevel, usageUnavailableText, useSharedPlanUsage, weeklyModel } from "../../usage";
import { ClaudeMark } from "../ClaudeMark";
import { ErrorText } from "../ErrorText";
import { RefreshButton } from "../IconButton";
import { BUSY_STATUSES } from "../RunStatus";
import { COMPACTING_LABEL } from "./workingLabel";

// ログイン中のアカウントは、アプリ全体で 1 回だけ取得する
const loadProviders = cachedLoader<ProviderStatus[]>(api.providers, []);


/** 使用率の色（70% から注意、90% から警告） */
const TONES = { normal: "ok", warning: "warn", critical: "danger" } as const;
const tone = (pct: number) => TONES[usageLevel(pct)];

/**
 * チャット欄の右下の丸いメーター: コンテキストウィンドウの使用率。
 * 押すと、コンテキストの詳細とプランの使用枠を出す（もう一度押す・ポップオーバーの外を押す・Esc で閉じる。マウスを乗せただけでは出さない）。
 * 会話を圧縮している間（手で圧縮した・上限に近づいて自動で）は、弧を回して知らせる（終わるとコンテキストの大きさが届き、弧が縮む）。
 */
export function ContextMeter({ run, compacting = false }: { run: Run; compacting?: boolean }) {
  const planUsage = useSharedPlanUsage();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<string>();
  const ref = useRef<HTMLDivElement>(null);

  // まだ数値が届いていないとき（新しいチャット・要約の直後など）は 0% として出す
  const tokens = run.context_tokens ?? 0;
  const windowSize = run.context_window;
  const pct = windowSize ? Math.min(100, Math.round((tokens / windowSize) * 100)) : 0;

  useEffect(() => {
    if (open) void loadProviders().then((list) => setAccount(list.find((p) => p.id === "claude")?.account));
  }, [open]);

  // 開いている間は、ポップオーバーの外のクリック・Esc で閉じる（メーターのボタンは中なので、そちらは押すたびに開閉する）
  useDismiss(ref, () => setOpen(false), { enabled: open });

  const usage = planUsage?.usage;
  const windows: UsageWindow[] = usage?.available
    ? [usage.five_hour, usage.seven_day, ...usage.model_weekly].filter((w) => w.utilization !== null)
    : [];

  // 手で圧縮する（作業中・まだ会話がないときはできない）。終わると compact イベントとコンテキストの大きさが届く
  const canCompact = Boolean(run.session_id) && !BUSY_STATUSES.includes(run.status);
  const [compactError, setCompactError] = useState<string>();
  const compact = async () => {
    setCompactError(undefined);
    try {
      await api.compactRun(run.id);
    } catch (e) {
      setCompactError(errorMessage(e));
    }
  };

  return (
    <div ref={ref} className="context-meter">
      <button
        type="button"
        className="context-ring-button"
        aria-label={compacting ? `${COMPACTING_LABEL}（コンテキストウィンドウ ${pct}% 使用）` : `コンテキストウィンドウ ${pct}% 使用`}
        aria-busy={compacting || undefined}
        aria-expanded={open}
        title={open ? "閉じる" : compacting ? `${COMPACTING_LABEL}（これまでの会話を要約して、コンテキストを空けています）` : "コンテキストと使用枠の詳細を表示"}
        onClick={() => setOpen(!open)}
      >
        <Ring pct={pct} compacting={compacting} />
      </button>
      {open && (
        <div className="context-popover" role="dialog" aria-label="コンテキストウィンドウと使用枠">
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
            {/* どれだけ使っているかを、数字だけでなく棒でも見せる */}
            <div className="context-bar" role="img" aria-label={`${pct}% 使用`}>
              <span className={`context-bar-fill tone-${tone(pct)}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="context-sub">セッションコスト: ${run.cost_usd.toFixed(2)}（API 換算）</div>
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
            <ErrorText message={compactError} />
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
