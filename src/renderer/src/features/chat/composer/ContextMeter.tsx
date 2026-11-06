import { Shrink, X } from "lucide-react";
import type { Chat, CompactingState, QueuedMessage } from "@shared/types";
import { api } from "@/api";
import { useAppSettings } from "@/stores/settings";
import { autoCompactThreshold } from "@shared/chat/autoCompact";
import { cx } from "@/lib/cx";
import { useAction } from "@/hooks/useAction";
import { formatTokens } from "@/lib/format";
import { usageLevel } from "@/features/usage/usage";
import { UsageBar } from "@/features/usage/UsageMeter";
import { ErrorText } from "@/ui/ErrorText";
import { Popover, usePopover } from "@/ui/Popover";
import { compactingLabel } from "@/features/chat/status/workingLabel";
import { CompactPromptEditor } from "@/features/snippet/CompactPromptEditor";
import { AutoCompactSelect } from "./AutoCompactSelect";

/** 丸いメーターの色（70% から注意、90% から警告） */
const TONES = { normal: "ok", warning: "warn", critical: "danger" } as const;
const tone = (pct: number) => TONES[usageLevel(pct)];

/**
 * チャット欄の右下の丸いメーター: コンテキストウィンドウの使用率。
 * 押すと、コンテキストの詳細を出す（使用率・ターン数と API 換算・自動圧縮・圧縮前指示・会話を圧縮。プランの使用枠は下の帯で見る。もう一度押す・ポップオーバーの外を押す・Esc で閉じる。マウスを乗せただけでは出さない）。
 * 会話を圧縮している間（手で圧縮した・上限に近づいて自動で）は、弧を回して知らせる（終わるとコンテキストの大きさが届き、弧が縮む）。
 * 設定で自動圧縮を始める使用率を決めていれば、円の外にそこを指す矢印を、詳細の棒に縦線を出す（Claude Code の既定のままなら出さない）。
 * 使用率は詳細の「自動圧縮」でも選べる（AutoCompactSelect。設定の「チャット」と同じ値）。その下の「圧縮前指示」「圧縮後指示」で、圧縮の前・後に送る指示も書ける（CompactPromptEditor）。
 * 作業中の「会話を圧縮」は「このやり取りのあとで圧縮」（予約。送信待ちのいちばん上に「会話を圧縮」の行を入れ、終わったら送信待ちより先にすぐ圧縮する）になり、
 * 予約中は「取り消す」（その行を送信待ちから消す）を出す。
 */
export function ContextMeter({
  chat,
  compacting,
  reserved,
}: {
  chat: Chat;
  compacting: CompactingState | null;
  /** 作業中に予約した圧縮（送信待ちのいちばん上の「会話を圧縮」の行。queuedHint の reservedCompact。なければ null） */
  reserved: QueuedMessage | null;
}) {
  const compactingText = compacting ? compactingLabel(compacting.trigger) : null;
  // 押すとメーターの上に開く詳細（もう一度押す・外を押す・Esc で閉じる。右端をメーターにそろえる）
  const popover = usePopover<HTMLDivElement>();
  const open = popover.open;

  // まだ数値が届いていないとき（新しいチャット・要約の直後など）は 0% として出す
  const tokens = chat.context_tokens ?? 0;
  const windowSize = chat.context_window;
  const pct = windowSize ? Math.min(100, Math.round((tokens / windowSize) * 100)) : 0;
  // 自動圧縮が始まるところ（設定で決めたときだけ。トークン数と、窓に対する %）
  const compactPct = useAppSettings().data?.auto_compact_pct ?? null;
  const compactAt = compactPct === null ? null : autoCompactThreshold(windowSize, compactPct);
  const markPct = compactAt !== null && windowSize ? (compactAt / windowSize) * 100 : null;
  const markText = compactAt !== null && markPct !== null ? `${Math.round(markPct)}%（${formatTokens(compactAt)} トークン）で自動圧縮` : null;

  // 手で圧縮する。作業中なら予約（送信待ちのいちばん上に圧縮の行を入れ、このやり取りが終わったら、送信待ちより先にすぐ圧縮する）。まだ会話がない・圧縮中はできない。
  // 終わると compact イベントとコンテキストの大きさが届く
  const running = chat.status === "running";
  const canCompact = (Boolean(chat.session_id) || running) && !compacting;
  // 押したらポップオーバーを閉じ、圧縮中の弧（作業中なら送信待ちのいちばん上の圧縮の行）で知らせる（できなかったときは開き直して失敗の文を見せる）
  const compactAction = useAction<"compact" | "cancel">();
  const compact = async () => {
    popover.close();
    if (!(await compactAction.run("compact", () => api.compactChat(chat.id)))) popover.setOpen(true);
  };
  const cancelReserved = (id: string) => void compactAction.run("cancel", () => api.removeQueued(chat.id, id));
  const compactButton = compacting
    ? { label: "圧縮中…", title: "これまでの会話を要約して、コンテキストを空けています" }
    : running
      ? { label: "このやり取りのあとで圧縮", title: "送信待ちのいちばん上に「会話を圧縮」を入れ、いまのやり取りが終わったら、送信待ちの指示より先にすぐ会話を圧縮します" }
      : { label: "会話を圧縮", title: "これまでの会話を要約して、コンテキストを空けます" };

  return (
    <div ref={popover.anchor} className="context-meter">
      <button
        type="button"
        className="context-ring-button"
        aria-label={compactingText ? `${compactingText}（コンテキストウィンドウ ${pct}% 使用）` : `コンテキストウィンドウ ${pct}% 使用${markText ? `・${markText}` : ""}${reserved ? "・このやり取りのあとで圧縮します" : ""}`}
        aria-busy={compacting ? true : undefined}
        aria-expanded={open}
        title={open ? "閉じる" : compactingText ? `${compactingText}（これまでの会話を要約して、コンテキストを空けています）` : "コンテキストの詳細を表示"}
        onClick={popover.toggle}
      >
        <Ring pct={pct} mark={markPct} compacting={compacting !== null} />
      </button>
      {open && (
        <Popover anchor={popover.anchor} side="above" align="end" gap={8} label="コンテキストウィンドウ" className="context-popover" onClose={popover.close}>
          {/* 使っている量: 大きな % と トークン数、棒（自動圧縮が始まる位置に縦線）、ターン数と API 換算 */}
          <section className="context-section">
            <div className="context-title">コンテキストウィンドウ</div>
            <div className="context-amount">
              <span className="context-pct">
                {pct}
                <small>%</small>
              </span>
              <span className="context-pct-label">使用</span>
              {windowSize && (
                <span className="context-tokens">
                  {formatTokens(tokens)} / {formatTokens(windowSize)} トークン
                </span>
              )}
            </div>
            <UsageBar percent={pct} mark={markPct} label="コンテキストウィンドウの使用率" valueText={`${pct}% 使用`} />
            {/* チャットの見出しの行を隠していても見られるよう、見出しのターン数と API 換算をここにも出す */}
            <dl className="context-stats">
              <div>
                <dt>ターン</dt>
                <dd>{chat.num_turns.toLocaleString()}</dd>
              </div>
              <div>
                <dt>セッションコスト（API 換算）</dt>
                <dd>${chat.cost_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
              </div>
            </dl>
          </section>

          {/* 圧縮の設定: 自動圧縮を始める量（設定の「チャット」と同じ値）と、圧縮の前に AI に送る指示（設定の「定型文」と同じ値） */}
          <section className="context-section">
            <AutoCompactSelect windowSize={windowSize} />
            <CompactPromptEditor kind="pre" projectId={chat.project_id} />
            <CompactPromptEditor kind="post" projectId={chat.project_id} />
          </section>

          {/* 会話を要約して、コンテキストを空ける（Claude Code の /compact） */}
          <section className="context-section context-compact">
            {reserved && running && !compacting ? (
              // 予約している: このやり取りが終わったら圧縮が始まる。取り消せる（送信待ちの圧縮の行を消す）
              <>
                <span className="context-compact-note">
                  <Shrink size={13} aria-hidden /> このやり取りが終わったら圧縮します
                </span>
                <button type="button" className="btn btn-sm" title="圧縮の予約を取り消します（送信待ちの「会話を圧縮」の行を消します）" onClick={() => cancelReserved(reserved.id)}>
                  <X size={13} /> 取り消す
                </button>
              </>
            ) : (
              <button type="button" className="btn context-compact-button" title={compactButton.title} disabled={!canCompact} onClick={() => void compact()}>
                <Shrink size={14} /> {compactButton.label}
              </button>
            )}
            <ErrorText message={compactAction.error} />
          </section>
        </Popover>
      )}
    </div>
  );
}

/** 圧縮している間に回す弧の長さ（%） */
const COMPACTING_ARC = 28;

/**
 * 丸い進み具合（使用率に合わせて弧が伸びる。圧縮している間は、短い弧をアクセントの色で回す（使用率が高いときは弧がほぼ一周で、回しても分かりにくいため））。
 * mark があれば、円の外にその位置（自動圧縮が始まるところ）を指す小さな矢印を出す（円の大きさは変えず、矢印の分だけ描く範囲を外へ広げる）
 */
function Ring({ pct, mark, compacting }: { pct: number; mark: number | null; compacting: boolean }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width="24" height="24" viewBox="-3 -3 24 24" className={cx("context-ring", `tone-${tone(pct)}`, compacting && "compacting")} aria-hidden>
      <circle cx="9" cy="9" r={r} className="context-ring-track" />
      <circle
        cx="9"
        cy="9"
        r={r}
        className="context-ring-fill"
        strokeDasharray={`${(c * (compacting ? COMPACTING_ARC : pct)) / 100} ${c}`}
        transform="rotate(-90 9 9)"
      />
      {/* 真上（0%）に描いた内向きの矢印を、位置の分だけ回す（50% なら真下） */}
      {mark !== null && !compacting && <path className="context-ring-mark" d="M9 0.6 L7.1 -2.4 L10.9 -2.4 Z" transform={`rotate(${(mark * 3.6).toFixed(1)} 9 9)`} />}
    </svg>
  );
}
