import type { CSSProperties, ReactNode } from "react";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { RenderScope } from "@/features/chat/ui";
import type { RowWindow } from "@/features/conversation/ui/timeline/rowWindow/useRowWindow";
import { PastWorkplace } from "@/features/chat/ui/screen/pastWorkplace";
import type { TimelineItem } from "./timelineItems";
import { rowKindOf, type RowContext } from "./rowKinds";
import { scopeItems } from "./scopeItems";

/**
 * タイムライン（発言とツールのまとまり）。rel はリポジトリの絶対パスを相対パスにする。
 * active（作業中で、いまの作業まで描いている）なら、いまの作業（最後の作業の終わりより後）の結果の届いていないツールを実行中として見せる
 * （前の作業で中断したまま結果のない呼び出しは、実行中にしない）。main はメインの流れか（サブエージェントのカードの中は false）
 */
export function TimelineItems({ items, rel, active, main }: { items: TimelineItem[]; rel: (s: string) => string; active: boolean; main: boolean }) {
  const floor = active ? activeFloor(items) : items.length;
  // 各項目は memo して、変わっていない発言・ツールは描き直さない（作業中は返答が届くたびに流れ全体が描き直されるため。
  // 長いチャットで Markdown を毎回解析し直すと、そのたびに 100ms ほどかかり、入力が重くなる）
  const renderScope = renderScopeOf(rel);
  return items.map((item, i) => <TimelineRow key={item.key} item={item} ctx={{ live: i > floor, main, rel, renderScope }} />);
}

/**
 * サブエージェントの流れを描く関数（カードの中・右の欄の画面）。記録をその流れの項目にまとめ、同じ部品で描く（入れ子のカードもこの中で描かれる。
 * 流れを再帰して描くのはここだけ）
 */
export const renderScopeOf =
  (rel: (s: string) => string): RenderScope =>
  (events, scope, active, empty) => <ScopeTimeline events={events} scope={scope} active={active} empty={empty} rel={rel} />;

function ScopeTimeline({ events, scope, active, empty, rel }: { events: readonly ChatEvent[]; scope: readonly string[]; active: boolean; empty: ReactNode; rel: (s: string) => string }) {
  const items = scopeItems(events, scope);
  if (items.length === 0) return empty;
  return <TimelineItems items={items} rel={rel} active={active} main={false} />;
}

/** いまの作業の始まり（最後の作業の終わりの位置。これより後ろがいまの作業の行） */
export const activeFloor = (items: TimelineItem[]) => items.findLastIndex((item) => item.kind === "event" && item.event.type === "result");

/**
 * 会話の流れ: 窓（useRowWindow）が決めた行だけを描き、窓の外は測った高さの箱にする。
 * 行と箱は 1 つの並びにする（入れ子の配列にすると、箱が増えたときに後ろの行がすべて作り直される）。
 * activeFrom: いまの作業の始まり（流れ全体で求める。これより後ろの行に data-live）
 */
export function TimelineRows({ window: w, rel, activeFrom }: { window: RowWindow & { items: TimelineItem[] }; rel: (s: string) => string; activeFrom: number }) {
  const renderScope = renderScopeOf(rel);
  const { items } = w;
  return w.runs.flatMap((run) =>
    run.kind === "box"
      ? [<div key={`box-${items[run.start].key}`} className="timeline-box" style={{ height: run.height }} aria-hidden />]
      : items.slice(run.start, run.end).map((item, j) => (
          <TimelineRow
            key={item.key}
            item={item}
            ctx={{ live: run.start + j > activeFrom, main: true, rel, renderScope }}
            rowRef={w.measureRef(item.key)}
            style={w.rowStyle(item.key)}
          />
        )),
  );
}

/**
 * 行の包み（.timeline-row）: 測る・content-visibility を当てる・窓から外す単位。作業中のいまの作業の行には data-live（画面の外でも描くのを省かない）、
 * 自分の発言・質問への回答の行には data-prompt-id（上に貼り付ける指示が、行の位置だけで探す）、data-row-key は窓が選択の端の行を見分ける
 */
function TimelineRow({ item, ctx, rowRef, style }: { item: TimelineItem; ctx: RowContext; rowRef?: (el: HTMLElement | null) => () => void; style?: CSSProperties }) {
  const kind = rowKindOf(item);
  return (
    <div ref={rowRef} className="timeline-row" data-live={ctx.live ? "" : undefined} data-prompt-id={kind.promptId?.(item)} data-row-key={item.key} style={style}>
      <PastWorkplace eventId={kind.firstEventId(item)}>{kind.render(item, ctx)}</PastWorkplace>
    </div>
  );
}
