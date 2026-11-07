import { Bot, GitBranch, MessageSquare } from "lucide-react";
import { Fragment } from "react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { cx } from "@/lib/cx";
import { useFollowScroll } from "@/hooks/useFollowScroll";
import { useTicker } from "@/hooks/useTicker";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { EmptyState } from "@/ui/EmptyState";
import { useOptionalChatPane, type ChatPaneActions } from "@/features/chat/pane/chatPaneContext";
import { TimelineItems } from "@/features/chat/timeline/Timeline";
import { keepSelectionOnClick, QUOTABLE_ATTR } from "@/features/chat/messages/quotable";
import { useQuoteMenu } from "@/features/chat/messages/useMessageMenu";
import { SubagentActions } from "./SubagentActions";
import { SubagentTellComposer } from "./SubagentTell";
import { agentHueStyle } from "./agentHues";
import { SubagentStatusText } from "./SubagentStatusText";
import {
  NowLine,
  SubagentChildren,
  SubagentKind,
  SubagentPrompt,
  SubagentReport,
  SubagentSteps,
  SubagentTime,
  Summary,
  useSubagentItems,
  type RenderItems,
} from "./subagentParts";
import { useSubagentsView, type SubagentsView } from "./subagentsContext";
import { childrenOf, pathOf } from "./subagentTree";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";

/**
 * 右の欄（サブエージェントの欄）のタブの中身: 1 つのサブエージェントを、チャットの画面と同じような画面で見る。
 * 上から、階層（メインエージェント › 調査 › 洗い出し。押すとその階層へ）・見出し（状態・時刻・いまの動き・操作）→ 起動したエージェントからの依頼 → 手順（チャットの流れと同じ部品で、
 * 発言・時刻付きのツール・入れ子のカード）→ 起動したエージェントへの報告 → そのサブエージェントに伝える入力欄。
 * 手順は画面いっぱいにスクロールし、実行中は最新に付いていく（中で上へ戻したら止まる。useFollowScroll）。
 * 入力欄から送ると、Kickoff から直接は送れないので、メインエージェントに SendMessage でそのまま渡してもらう（カードの「伝える」と同じ）
 */
export function SubagentScreen({ agentKey }: { agentKey: string }) {
  const view = useSubagentsView();
  const pane = useOptionalChatPane();
  const entry = view?.tree.byKey.get(agentKey);
  if (!view || !entry || !pane) {
    return (
      <div className="subagent-screen missing">
        <EmptyState icon={Bot} title="このサブエージェントは見つかりません">
          会話を巻き戻した・書き直したなどで、記録からなくなりました。このタブは閉じてかまいません。
        </EmptyState>
      </div>
    );
  }
  return <ScreenView entry={entry} view={view} pane={pane} />;
}

function ScreenView({ entry, view, pane }: { entry: SubagentEntry; view: SubagentsView; pane: ChatPaneActions }) {
  const running = entry.status === "running";
  // 実行中は「最後の動き」の表示を進める
  useTicker(running ? 15_000 : 3_600_000);
  const items = useSubagentItems(entry, view);
  const { scrollRef, contentRef, onScroll } = useFollowScroll(running);
  const renderItems: RenderItems = (inner, active) => <TimelineItems items={inner} rel={view.rel} active={active} />;
  // 手順・頼んだ内容・報告の文の右クリック（会話の流れと同じメニュー）
  const quoteMenu = useQuoteMenu();
  return (
    // chat-panel: 発言・入力欄の見た目を、パネルの中のチャットと同じにする（side-panel.css・messages.css の .chat-panel の規則）
    <div
      className="subagent-screen chat-panel"
      style={agentHueStyle(view.hues.get(entry.key))}
      data-agent-screen={`${view.chatId}:${entry.key}`}
    >
      <ScreenHead entry={entry} view={view} pane={pane} />
      <div ref={scrollRef} className="subagent-screen-scroll" onScroll={onScroll} tabIndex={-1}>
        <div ref={contentRef} className="subagent-screen-content" {...{ [QUOTABLE_ATTR]: "" }} onContextMenu={quoteMenu.openInRegion} onClickCapture={keepSelectionOnClick}>
          {entry.prompt && <SubagentPrompt text={entry.prompt} />}
          <SubagentSteps entry={entry} view={view} items={items} renderItems={renderItems} />
          <SubagentReport entry={entry} view={view} />
        </div>
      </div>
      <RelayComposer entry={entry} view={view} />
      {quoteMenu.element}
    </div>
  );
}

/** 見出し: 階層・名前と状態と時刻・いまの動き（終わったものはまとめ）と操作 */
function ScreenHead({ entry, view, pane }: { entry: SubagentEntry; view: SubagentsView; pane: ChatPaneActions }) {
  const running = entry.status === "running";
  const path = pathOf(view.tree, entry.key);
  return (
    <header className="subagent-screen-head">
      {/* 1 行目: 階層と、右の欄のタブのときだけ右端に「別ウィンドウで開く」 */}
      <div className="subagent-screen-top">
      <nav className="subagent-screen-path" aria-label="サブエージェントの階層">
        <button
          type="button"
          className="link-button"
          title="チャットの流れの中の、このサブエージェントを起動したカードへ移ります"
          onClick={() => pane.revealSubagent(path[0]?.key ?? entry.key)}
        >
          メインエージェント
        </button>
        {path.slice(0, -1).map((s) => (
          <Fragment key={s.key}>
            <span className="subagent-screen-sep" aria-hidden>
              ›
            </span>
            <button type="button" className="link-button" title={`「${s.description}」の画面を、この欄に開きます`} onClick={() => pane.openSubagentSide(s.key)}>
              {s.description}
            </button>
          </Fragment>
        ))}
        <span className="subagent-screen-sep" aria-hidden>
          ›
        </span>
        <span className="subagent-screen-current">{entry.description}</span>
      </nav>
        <PopOutTabButton />
      </div>
      <div className="subagent-screen-title">
        <span className={cx("subagent-icon", running && "spinning")}>
          <ClaudeMark size={15} />
        </span>
        <SubagentKind entry={entry} view={view} />
        <span className="subagent-screen-name">{entry.description}</span>
        <span className="subagent-card-type">{entry.subagentType ?? "general-purpose"}</span>
        {/* 中に子がいれば。押すと、この画面の中の最初の子のカードへ移る */}
        <SubagentChildren
          entry={entry}
          view={view}
          onOpen={() => {
            const first = childrenOf(view.tree, entry.key)[0]?.toolUseEventId;
            if (first !== undefined) pane.openSubagentSide(entry.key, first);
          }}
        />
        <SubagentStatusText entry={entry} />
        <SubagentTime entry={entry} />
      </div>
      <div className="subagent-screen-now">
        {running ? <NowLine entry={entry} view={view} rel={view.rel} /> : <Summary entry={entry} childCount={childrenOf(view.tree, entry.key).length} />}
        <span className="subagent-card-actions">
          <SubagentActions chatId={view.chatId} entry={entry} busy={view.busy} onOpen={(k) => pane.openSubagentSide(k)} />
          <button
            type="button"
            className="link-button subagent-tell"
            title="チャットの流れの中の、このサブエージェントのカードへ移って開きます"
            onClick={() => pane.revealSubagent(entry.key)}
          >
            <MessageSquare size={12} aria-hidden />
            流れで見る
          </button>
          <button
            type="button"
            className="link-button subagent-tell"
            title="見出しの「動き」を開き、このサブエージェントと、その中で起動したものの行をすべて強調して、初めの行へ移ります（↑↓ で順に移る）"
            onClick={() => pane.focusActivity(entry.key)}
          >
            <GitBranch size={12} aria-hidden />
            動きで見る
          </button>
        </span>
      </div>
    </header>
  );
}

/** そのサブエージェントに伝える入力欄（カードの「伝える」と同じもの。SubagentTell） */
function RelayComposer({ entry, view }: { entry: SubagentEntry; view: SubagentsView }) {
  return (
    <div className="chat-composer subagent-screen-composer">
      <SubagentTellComposer entry={entry} view={view} />
    </div>
  );
}
