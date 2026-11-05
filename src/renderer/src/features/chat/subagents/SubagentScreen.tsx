import { Bot, GitBranch, MessagesSquare } from "lucide-react";
import { Fragment } from "react";
import type { Attachment } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { relayMessage } from "@shared/chat/prompts";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import { useFollowScroll } from "@/hooks/useFollowScroll";
import { useTicker } from "@/hooks/useTicker";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { EmptyState } from "@/ui/EmptyState";
import { Composer } from "@/features/chat/composer/Composer";
import { useOptionalChatPane, type ChatPaneActions } from "@/features/chat/pane/chatPaneContext";
import { TimelineItems } from "@/features/chat/timeline/Timeline";
import { SubagentActions } from "./SubagentActions";
import { agentHueStyle } from "./agentHues";
import { showsSubagentStatus, subagentStatusClass, subagentStatusLabel, subagentStatusTitle } from "./subagentList";
import { NowLine, SubagentPrompt, SubagentReport, SubagentSteps, SubagentTime, Summary, useSubagentItems, type RenderItems } from "./subagentParts";
import { useSubagentsView, type SubagentsView } from "./subagentsContext";
import { childrenOf, pathOf } from "./subagentTree";

/**
 * 右の欄（サブエージェントの欄）のタブの中身: 1 つのサブエージェントを、メインの会話と同じような画面で見る。
 * 上から、階層（メイン › 調査 › 洗い出し。押すとその階層へ）・見出し（状態・時刻・いまの動き・操作）→ 親からの依頼 → 手順（メインと同じ部品で、
 * 発言・時刻付きのツール・入れ子のカード）→ 親への報告 → そのサブエージェントに伝える入力欄。
 * 手順は画面いっぱいにスクロールし、実行中は最新に付いていく（中で上へ戻したら止まる。useFollowScroll）。
 * 入力欄から送ると、Kickoff から直接は送れないので、メインのエージェントに SendMessage でそのまま渡してもらう（カードの「伝える」と同じ）
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
  return (
    // chat-panel: 発言・入力欄の見た目を、パネルの中のチャットと同じにする（side-panel.css・messages.css の .chat-panel の規則）
    <div
      className={cx("subagent-screen chat-panel", running && "running")}
      style={agentHueStyle(view.hues.get(entry.key))}
      data-agent-screen={`${view.chatId}:${entry.key}`}
    >
      <ScreenHead entry={entry} view={view} pane={pane} />
      <div ref={scrollRef} className="subagent-screen-scroll" onScroll={onScroll} tabIndex={-1}>
        <div ref={contentRef} className="subagent-screen-content">
          {entry.prompt && <SubagentPrompt text={entry.prompt} />}
          <SubagentSteps entry={entry} view={view} items={items} renderItems={renderItems} />
          <SubagentReport entry={entry} view={view} />
        </div>
      </div>
      <RelayComposer entry={entry} view={view} />
    </div>
  );
}

/** 見出し: 階層・名前と状態と時刻・いまの動き（終わったものはまとめ）と操作 */
function ScreenHead({ entry, view, pane }: { entry: SubagentEntry; view: SubagentsView; pane: ChatPaneActions }) {
  const running = entry.status === "running";
  const path = pathOf(view.tree, entry.key);
  return (
    <header className="subagent-screen-head">
      <nav className="subagent-screen-path" aria-label="サブエージェントの階層">
        <button
          type="button"
          className="link-button"
          title="メインの会話の、このサブエージェントを起動したカードへ移ります"
          onClick={() => pane.revealSubagent(path[0]?.key ?? entry.key)}
        >
          メイン
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
      <div className="subagent-screen-title">
        <span className={cx("subagent-icon", running && "spinning")}>
          <ClaudeMark size={15} />
        </span>
        <span className="subagent-screen-kind">サブエージェント</span>
        <span className="subagent-screen-name">{entry.description}</span>
        <span className="subagent-card-type">{entry.subagentType ?? "general-purpose"}</span>
        {showsSubagentStatus(entry) && (
          <span className={cx("subagent-status", subagentStatusClass(entry))} title={subagentStatusTitle(entry)}>
            {subagentStatusLabel(entry)}
          </span>
        )}
        <SubagentTime entry={entry} />
      </div>
      <div className="subagent-screen-now">
        {running ? <NowLine entry={entry} view={view} rel={view.rel} /> : <Summary entry={entry} childCount={childrenOf(view.tree, entry.key).length} />}
        <span className="subagent-card-actions">
          <SubagentActions chatId={view.chatId} entry={entry} busy={view.busy} onOpen={(k) => pane.openSubagentSide(k)} />
          <button
            type="button"
            className="link-button subagent-tell"
            title="メインの会話の流れの中の、このサブエージェントのカードへ移って開きます"
            onClick={() => pane.revealSubagent(entry.key)}
          >
            <MessagesSquare size={12} aria-hidden />
            流れで見る
          </button>
          <button
            type="button"
            className="link-button subagent-tell"
            title="このサブエージェントと、その中で起動したものの動きを、時刻の順に見る（メインの見出しの「動き」をこのサブエージェントに絞って開きます）"
            onClick={() => pane.show("activity", { kind: "agent", key: entry.key })}
          >
            <GitBranch size={12} aria-hidden />
            動きで見る
          </button>
        </span>
      </div>
    </header>
  );
}

/**
 * そのサブエージェントに伝える入力欄（メインのエージェントが SendMessage でそのまま渡す。メインが作業中なら止めずに伝え、
 * 作業中でなければすぐ送る。どちらも tell の API が決める）。送った文は、このサブエージェントの流れに自分の発言として出る。
 * Claude Code がサブエージェントの ID を知らせていなければ送れないので、その旨を出す
 */
function RelayComposer({ entry, view }: { entry: SubagentEntry; view: SubagentsView }) {
  const { agentId, description } = entry;
  if (!agentId) {
    return (
      <div className="chat-composer subagent-screen-composer">
        <p className="muted small">このサブエージェントには追加の指示を送れません（Claude Code がサブエージェントの ID を知らせていないため）。</p>
      </div>
    );
  }
  const relay = async (text: string, attachments: Attachment[]) => {
    await api.tellChat(view.chatId, relayMessage(agentId, description, text), {}, attachments);
  };
  return (
    <div className="chat-composer subagent-screen-composer">
      <Composer
        busy={view.busy}
        placeholder={`サブエージェント「${description}」への追加の指示（メインのエージェントが SendMessage で渡します。Enter で送信）`}
        sendLabel="伝える"
        onSend={relay}
        onQueue={(text, attachments) => relay(text, attachments)}
        suggestTarget={{ projectId: view.projectId, worktree: view.worktree ?? undefined }}
      />
    </div>
  );
}
