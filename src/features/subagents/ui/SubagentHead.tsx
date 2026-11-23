import "./SubagentHead.css";
import { CornerDownRight, GitBranch, MessageSquare, PanelRight, Reply } from "lucide-react";
import { useMemo } from "react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { isSubagentTool } from "@shared/ai/claudeTools";
import { cx } from "@/foundation/ui/lib/cx";
import { formatTokens } from "@/foundation/ui/lib/format";
import { formatDuration, formatFullStamp, formatStampRange, formatStampRangeWithRunTime, formatStampRunTime } from "@/foundation/ui/lib/time";
import { ClaudeMark } from "@/features/ai/ui";
import { activityOf, activityText, toolText } from "@/features/chat/ui";
import { agentHueStyle } from "@/features/subagents/ui/model/agentHues";
import { showsSubagentStatus, subagentStatusLabel } from "@/features/subagents/ui/model/subagentList";
import type { SubagentsView } from "./subagentsContext";
import { childrenOf, latestActivity } from "@/features/subagents/ui/model/subagentTree";

/*
 * サブエージェントの見出しの部品（流れの中のカード SubagentCard と、右の欄のサブエージェントの画面 SubagentScreen で共通）:
 * 「サブエージェント」の札・中で起動したサブエージェントの札と行・開始〜終了の時刻・いまの動き・終わったもののまとめ・見出しの右の行き先のボタン
 */

/** 中で起動したサブエージェントの札に並べる点の数（多ければ「+n」） */
const MAX_CHILD_DOTS = 5;
/** 閉じたカードの下に並べる、中で起動したサブエージェントの行の数（多ければ「ほか n 件」） */
const MAX_CHILD_ROWS = 3;

/**
 * 名前の前の「サブエージェント」の札（そのサブエージェントの色）。サブエージェントの中で起動したもの（入れ子）は頭に「↳」を付け、
 * 乗せると、どのサブエージェントの中で起動したかを出す（何段目かの数ではなく、起動したサブエージェントの名前で。深さは右の欄の階層・乗せたときの道筋で見る）
 */
export function SubagentKind({ entry, view }: { entry: SubagentEntry; view: SubagentsView }) {
  const parent = entry.parentKey === undefined ? undefined : view.tree.byKey.get(entry.parentKey);
  return (
    <span className={cx("subagent-kind tag", parent && "nested")} title={parent ? `「${parent.description}」の中で起動したサブエージェント` : "メインエージェントが起動したサブエージェント"}>
      {parent && <CornerDownRight size={11} aria-hidden />}
      <span className="subagent-kind-text">サブエージェント</span>
    </span>
  );
}

/**
 * 中で起動したサブエージェントがあるときの札（閉じたカードでも、中に子がいると分かるように）: 子の色の点（実行中の子は明滅）と「中に n 件」。
 * 乗せると子の名前と状態の一覧。onOpen があれば押せる（カードを開く・右の欄の画面ではその子のカードへ移る）。子がなければ出さない
 */
export function SubagentChildren({ entry, view, onOpen }: { entry: SubagentEntry; view: SubagentsView; onOpen?: () => void }) {
  const children = childrenOf(view.tree, entry.key);
  if (children.length === 0) return null;
  const title = [`中で起動したサブエージェント ${children.length} 件`, ...children.map((c) => `・${c.description}（${subagentStatusLabel(c)}）`)].join("\n");
  const body = (
    <>
      <span className="subagent-children-dots" aria-hidden>
        {children.slice(0, MAX_CHILD_DOTS).map((c) => (
          <span key={c.key} className={cx("subagent-child-dot", c.status === "running" && "running")} style={agentHueStyle(view.hues.get(c.key))} />
        ))}
        {children.length > MAX_CHILD_DOTS && <span className="subagent-children-more">+{children.length - MAX_CHILD_DOTS}</span>}
      </span>
      <span className="subagent-children-text">中のサブエージェント {children.length} 件</span>
    </>
  );
  if (!onOpen) {
    return (
      <span className="subagent-children pill" title={title}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="subagent-children pill"
      title={title}
      // カードの見出し（押すと開く）の中にあるので、見出しの操作と重ねない
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {body}
    </button>
  );
}

/**
 * 閉じたカードの下に、中で起動したサブエージェントを木の枝の形で 1 行ずつ並べる（「└ ✳ 洗い出し 完了 · 50秒」。枝はその子の色）。
 * 閉じていても中にサブエージェントがいると分かるように（見出しの札だけでは分かりにくかった）。行を押すとその子を開き（onOpen。設定の開き方）、
 * 多ければ MAX_CHILD_ROWS 件まで出して「ほか n 件」（onMore。カードを開く）。子がなければ出さない
 */
export function SubagentChildRows({ entry, view, onOpen, onMore }: { entry: SubagentEntry; view: SubagentsView; onOpen: (key: string) => void; onMore: () => void }) {
  const children = childrenOf(view.tree, entry.key);
  if (children.length === 0) return null;
  const shown = children.slice(0, MAX_CHILD_ROWS);
  return (
    <ul className="subagent-child-rows" aria-label="中で起動したサブエージェント">
      {shown.map((child) => (
        <li key={child.key} style={agentHueStyle(view.hues.get(child.key))}>
          <button type="button" className="subagent-child-row" title={`中で起動したサブエージェント「${child.description}」を開く`} onClick={() => onOpen(child.key)}>
            <span className={cx("agent-icon", child.status === "running" && "spinning")}>
              <ClaudeMark size={12} />
            </span>
            <span className="subagent-child-name">{child.description}</span>
            <span className="subagent-child-state">{childStateText(child, childrenOf(view.tree, child.key).length, view.waiting.has(child.key))}</span>
          </button>
        </li>
      ))}
      {children.length > shown.length && (
        <li>
          <button type="button" className="link-button subagent-child-more" onClick={onMore}>
            ほか {children.length - shown.length} 件
          </button>
        </li>
      )}
    </ul>
  );
}

/** 中の子の行の状態の文（実行中は最後のツール、終わったものは状態とかかった時間。孫がいれば「中に n 件」） */
function childStateText(child: SubagentEntry, grandchildren: number, waiting: boolean): string {
  const end = child.endedAt ?? child.lastActivityAt;
  const duration = child.durationMs ?? (child.startedAt && end ? Date.parse(end) - Date.parse(child.startedAt) : undefined);
  const parts =
    child.status === "running"
      ? [subagentStatusLabel(child, waiting), child.lastTool ? `いま: ${child.lastTool}` : null]
      : [subagentStatusLabel(child, waiting), duration !== undefined ? formatDuration(duration) : null];
  return [...parts, grandchildren > 0 ? `中に ${grandchildren} 件` : null].filter(Boolean).join(" · ");
}

/** 開始〜終了の時刻と実行時間（実行中は開始〜最後の動き）。今日なら時刻だけ、別の日なら日付も。乗せると年月日とかかった時間 */
export function SubagentTime({ entry }: { entry: SubagentEntry }) {
  const start = entry.startedAt;
  if (!start) return null;
  const running = entry.status === "running";
  const end = running ? (entry.lastActivityAt ?? start) : (entry.endedAt ?? entry.lastActivityAt ?? start);
  const title = running
    ? `開始 ${formatFullStamp(start)}\n最後の動き ${formatFullStamp(end)}（作業中）`
    : `開始 ${formatFullStamp(start)}\n終了 ${formatFullStamp(end)}（実行時間 ${formatStampRunTime(start, end)}）`;
  return (
    <span className={cx("tool-time", running && "running")} title={title}>
      {running ? formatStampRange(start, end) : formatStampRangeWithRunTime(start, end)}
    </span>
  );
}

/** 実行中のいまの動き（いちばん新しいツールの呼び出し。子孫のものは「洗い出し › 検索: …」）と、最後の動きからの時間・トークン数 */
export function NowLine({ entry, view, rel }: { entry: SubagentEntry; view: SubagentsView; rel: (s: string) => string }) {
  const latest = useMemo(() => latestActivity(view.tree, entry.key, view.events), [view.tree, entry.key, view.events]);
  // いちばん新しいのが入れ子のサブエージェントの起動で、その子の中の記録が届かないとき（孫の中の手順は Claude Code が送らない）は、
  // 子の途中経過（最後のツール）を出す
  const child = latest && isSubagentTool(latest.use.data.name) ? view.tree.byKey.get(latest.use.data.id) : undefined;
  const what =
    child?.status === "running" && child.lastTool
      ? `${latest?.by ? `${latest.by.description} › ` : ""}${child.description} › ${child.lastTool}`
      : latest
        ? `${latest.by ? `${latest.by.description} › ` : ""}${toolText().describeTool(latest.use.data.name, (latest.use.data.input ?? {}) as Record<string, unknown>)}`
        : (entry.lastTool ?? "準備しています");
  const activity = activityOf(entry.lastActivityAt);
  const note = activityText(activity, entry.pendingTool);
  return (
    <span className="subagent-card-what">
      <span className="subagent-card-label tag">いま</span>
      <span className="subagent-card-activity" title={rel(what)}>
        {rel(what)}
      </span>
      {note && <span className={activity.level === "stalled" ? "activity-stalled" : undefined}>{note}</span>}
      {entry.tokens !== undefined && <span className="subagent-card-count">{formatTokens(entry.tokens)} tokens</span>}
    </span>
  );
}

/** 終わったサブエージェントのまとめ（完了・ツールの回数・トークン数・かかった時間・中で起動したサブエージェントの数） */
export function Summary({ entry, childCount }: { entry: SubagentEntry; childCount: number }) {
  const end = entry.endedAt ?? entry.lastActivityAt;
  const duration = entry.durationMs ?? (entry.startedAt && end ? Date.parse(end) - Date.parse(entry.startedAt) : undefined);
  const parts = [
    // 状態の文が見出しにあるもの（失敗・中断・受け取り待ちなど）は重ねない
    showsSubagentStatus(entry) ? null : "完了",
    entry.toolUses !== undefined ? `ツール ${entry.toolUses} 回` : null,
    entry.tokens !== undefined ? `${formatTokens(entry.tokens)} tokens` : null,
    duration !== undefined ? formatDuration(duration) : null,
    childCount > 0 ? `サブエージェント ${childCount} 件` : null,
  ].filter(Boolean);
  return <span className="subagent-card-what muted">{parts.join(" · ")}</span>;
}

/** 見出しの右の行き先のボタン（渡したものだけを、右の欄 → 流れ → 動き → 伝えるの順に出す） */
export interface SubagentLinks {
  /** チャットの画面の右の欄に開く */
  side?: () => void;
  /** チャットの流れの中のカードへ移って開く */
  flow?: () => void;
  /** 見出しの「動き」で、このサブエージェントと中で起動したものを強調する */
  activity?: () => void;
  /** カードの下に「伝える」の入力欄を開く・閉じる */
  tell?: { open: boolean; toggle: () => void };
}

/** 見出しの右の行き先のボタン（流れの中のカードと右の欄の画面で同じ文。操作のボタン SubagentActions の右に並べる） */
export function SubagentLinkActions({ links }: { links: SubagentLinks }) {
  return (
    <>
      {links.side && (
        <button
          type="button"
          className="link-button subagent-tell"
          title="このサブエージェントを、チャットの画面の右の欄に、チャットと同じような画面で開く（右の欄の中で上下・左右に分けて並べられます）"
          onClick={links.side}
        >
          <PanelRight size={12} aria-hidden />
          右の欄で開く
        </button>
      )}
      {links.flow && (
        <button type="button" className="link-button subagent-tell" title="チャットの流れの中の、このサブエージェントのカードへ移って開きます" onClick={links.flow}>
          <MessageSquare size={12} aria-hidden />
          流れで見る
        </button>
      )}
      {links.activity && (
        <button
          type="button"
          className="link-button subagent-tell"
          title="見出しの「動き」を開き、このサブエージェントと、その中で起動したものの行をすべて強調して、初めの行へ移ります（上 / 下のボタンで順に移る）"
          onClick={links.activity}
        >
          <GitBranch size={12} aria-hidden />
          動きで見る
        </button>
      )}
      {links.tell && (
        <button
          type="button"
          className="link-button subagent-tell"
          title="メインエージェント経由で、このサブエージェントに追加の指示を伝える（直接は送れないので、メインエージェントが SendMessage で渡します。カードの下に入力欄を開きます）"
          aria-expanded={links.tell.open}
          onClick={links.tell.toggle}
        >
          <Reply size={12} aria-hidden />
          伝える
        </button>
      )}
    </>
  );
}
