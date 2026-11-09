import type { Chat, CompactingState, QueueAction, QueuedMessage } from "@shared/types";
import { useAppSettings } from "@/stores/settings";
import { autoCompactThreshold } from "@shared/chat/autoCompact";
import { cx } from "@/lib/cx";
import { useAction } from "@/hooks/useAction";
import { formatTokens } from "@/lib/format";
import { usageLevel } from "@/features/usage/usage";
import { UsageBar } from "@/features/usage/UsageMeter";
import { Popover, usePopover } from "@/ui/Popover";
import { compactingLabel } from "@/features/chat/status/workingLabel";
import { CompactPromptEditor } from "@/features/snippet/CompactPromptEditor";
import { AutoCompactSelect } from "./AutoCompactSelect";
import { FreeContextActions, type FreeContextAction } from "./FreeContextActions";

/** 丸いメーターの色（70% から注意、90% から警告） */
const TONES = { normal: "ok", warning: "warn", critical: "danger" } as const;
const tone = (pct: number) => TONES[usageLevel(pct)];

/**
 * チャット欄の右下の丸いメーター: コンテキストウィンドウの使用率。
 * 押すと、コンテキストの詳細を出す（使用率・ターン数と API 換算・自動圧縮・圧縮前指示・圧縮後指示・コンテキストを空ける。プランの使用枠は下の帯で見る。もう一度押す・ポップオーバーの外を押す・Esc で閉じる。マウスを乗せただけでは出さない）。
 * 会話を圧縮している間（手で圧縮した・上限に近づいて自動で）は、弧を回して知らせる（終わるとコンテキストの大きさが届き、弧が縮む）。
 * 設定で自動圧縮を始める使用率を決めていれば、円の外にそこを指す矢印を、詳細の棒に縦線を出す（Claude Code の既定のままなら出さない）。
 * 使用率は詳細の「自動圧縮」でも選べる（AutoCompactSelect。設定の「チャット」と同じ値）。その下の「圧縮前指示」「圧縮後指示」で、圧縮の前・後に送る指示も書ける（CompactPromptEditor）。
 * いちばん下の「コンテキストを空ける」で、会話を圧縮 / コンテキストを消去を選ぶ（FreeContextActions。作業中は予約になり、予約中は取り消せる）。
 * 送る前のチャット（新しいチャット・新しい子チャット。chat が null）でも、会話が始まったあとのチャット欄と同じ形で出す（0%・ターン 0。空けるものがないので「コンテキストを空ける」は出さない）
 */
export function ContextMeter({
  chat,
  projectId,
  compacting,
  reserved,
  afterTurn,
}: {
  /** メーターのチャット（送る前のチャットでは null） */
  chat: Chat | null;
  /** 圧縮前指示・圧縮後指示を書くプロジェクト */
  projectId: number;
  compacting: CompactingState | null;
  /** 作業中に予約した圧縮・コンテキストの消去（送信待ちのいちばん上の行。queuedHint の reservedAction。なければ null） */
  reserved: QueuedMessage | null;
  /** 作業中に手で頼んだ圧縮の圧縮前指示を、いまの作業に伝えた（その作業が終わったら圧縮する） */
  afterTurn: boolean;
}) {
  const compactingText = compacting ? compactingLabel(compacting.trigger) : null;
  // 押すとメーターの上に開く詳細（もう一度押す・外を押す・Esc で閉じる。右端をメーターにそろえる）
  const popover = usePopover<HTMLDivElement>();
  const open = popover.open;
  // 圧縮・消去の実行中と失敗の文（押すとポップオーバーを閉じるので、閉じても消えないここで持つ）
  const freeAction: FreeContextAction = useAction<QueueAction | "cancel">();

  // まだ数値が届いていないとき（新しいチャット・要約の直後など）は 0% として出す
  const tokens = chat?.context_tokens ?? 0;
  const windowSize = chat?.context_window ?? null;
  const pct = windowSize ? Math.min(100, Math.round((tokens / windowSize) * 100)) : 0;
  // 自動圧縮が始まるところ（設定で決めたときだけ。トークン数と、窓に対する %）
  const compactPct = useAppSettings().data?.auto_compact_pct ?? null;
  const compactAt = compactPct === null ? null : autoCompactThreshold(windowSize, compactPct);
  const markPct = compactAt !== null && windowSize ? (compactAt / windowSize) * 100 : null;
  const markText = compactAt !== null && markPct !== null ? `${Math.round(markPct)}%（${formatTokens(compactAt)} トークン）で自動圧縮` : null;

  return (
    <div ref={popover.anchor} className="context-meter">
      <button
        type="button"
        className="context-ring-button"
        aria-label={compactingText ? `${compactingText}（コンテキストウィンドウ ${pct}% 使用）` : `コンテキストウィンドウ ${pct}% 使用${markText ? `・${markText}` : ""}${afterTurn || (reserved?.compact && chat?.status === "running") ? "・いまの作業が終わったら圧縮します" : reserved?.clear && chat?.status === "running" ? "・いまの作業が終わったらコンテキストを消去します" : ""}`}
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
                <dd>{(chat?.num_turns ?? 0).toLocaleString()}</dd>
              </div>
              <div>
                <dt>セッションコスト（API 換算）</dt>
                <dd>${(chat?.cost_usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
              </div>
            </dl>
          </section>

          {/* 圧縮の設定: 自動圧縮を始める量（設定の「チャット」と同じ値）と、圧縮の前に AI に送る指示（設定の「圧縮前・圧縮後指示」と同じ値） */}
          <section className="context-section">
            <AutoCompactSelect windowSize={windowSize} />
            <CompactPromptEditor kind="pre" projectId={projectId} />
            <CompactPromptEditor kind="post" projectId={projectId} />
          </section>

          {/* コンテキストを空ける: 会話を圧縮（Claude Code の /compact）/ コンテキストを消去（新しい会話で始める）。押したら閉じ、できなかったら開き直して失敗の文を見せる */}
          {chat && (
            <FreeContextActions action={freeAction} chat={chat} compacting={compacting} reserved={reserved} afterTurn={afterTurn} onStart={popover.close} onFailed={() => popover.setOpen(true)} />
          )}
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
