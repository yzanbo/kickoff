import "./SubagentScreen.css";
import "@/features/conversation/ui/screen/ChatColumn.css";
import "@/features/conversation/ui/timeline/Timeline.css";
import { Bot } from "lucide-react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { cx } from "@/foundation/ui/lib/cx";
import { useFollowScroll } from "@/features/chat/ui";
import { TICK_ACTIVITY, useTicker } from "@/foundation/ui/hooks/useTicker";
import { ClaudeMark } from "@/features/ai/ui";
import { EmptyState } from "@/foundation/ui/kit/EmptyState";
import { type ActivityNav, LineageTrail, type SubagentNav, TimelineBusyContext, useOptionalActivityNav, useOptionalSubagentNav } from "@/features/chat/ui";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { createActivityNav } from "@/features/conversation/ui/activity/createActivityNav";
import { createSubagentNav, openSubagentWindow } from "@/features/conversation/ui/screen/createSubagentNav";
import { renderScopeOf } from "@/features/conversation/ui/timeline/Timeline";
import { keepSelectionOnClick, QUOTABLE_ATTR } from "@/features/conversation/ui/messages/quotable";
import { useQuoteMenu } from "@/features/conversation/ui/messages/useMessageMenu";
import { SubagentActions, SubagentTellComposer, agentHueStyle, SubagentStatusText, NowLine, SubagentChildren, SubagentKind, SubagentLinkActions, SubagentTime, Summary, SubagentPrompt, SubagentReport, SubagentSteps, useSubagentScope, SubagentsContext, type SubagentsView, useChatSubagentsView, childrenOf, pathOf } from "@/features/subagents/ui";
import { chatVisuals, VisualsContext } from "@/features/visuals/ui";
import { backgroundCalls } from "@/features/conversation/ui/background/selectors";
import { BackgroundCallsContext } from "@/features/conversation/ui/background/backgroundCalls";
import { PopOutTabButton } from "@/features/panel/ui/tabs/PopOutTabButton";

/**
 * 別ウィンドウのサブエージェントの画面の口: メインの会話・右の欄が要る操作はこのウィンドウにないので、ほかのサブエージェントの画面は別ウィンドウで開き、
 * 会話のその場所へ移る・動きで強調するは、メインのウィンドウに知らせる（チャット欄に足すのは appendToDraft がメインに頼む）（カードの開閉・「伝える」の欄はこのウィンドウの中で）
 */
export function windowSubagentNav(chatId: number): { subagents: SubagentNav; activity: ActivityNav } {
  const reveal = (eventId: number | undefined, agent: string | null) => postToMainWindow("reveal", { chatId, eventId, agent });
  const open = (key: string) => openSubagentWindow(chatId, key);
  const subagents = createSubagentNav({ chatId, canOpenSide: false, release: () => {}, reveal: (key, inside) => reveal(inside, key) });
  const activity = createActivityNav({ beforeShow: () => {}, revealInConversation: reveal });
  return {
    subagents: { ...subagents, open, openSide: open, openWindow: open },
    activity: { ...activity, focus: (key) => postToMainWindow("showActivity", { chatId, agent: key }) },
  };
}

/**
 * 右の欄（サブエージェントの欄）のタブの中身: 1 つのサブエージェントを、チャットの画面と同じような画面で見る。
 * 上から、階層（メインエージェント › 調査 › 洗い出し。押すとその階層へ）・見出し（状態・時刻・いまの動き・操作）→ 起動したエージェントからの依頼 → 手順（チャットの流れと同じ部品で、
 * 発言・時刻付きのツール・入れ子のカード）→ 起動したエージェントへの報告 → そのサブエージェントに伝える入力欄。
 * 手順は画面いっぱいにスクロールし、実行中は最新に付いていく（中で上へ戻したら止まる。useFollowScroll）。
 * 入力欄から送ると、Kickoff から直接は送れないので、メインエージェントに SendMessage でそのまま渡してもらう（カードの「伝える」と同じ）
 */
export function SubagentScreen({ chatId, agentKey }: { chatId: number; agentKey: string }) {
  // 記録から作るもの（サブエージェント・図・裏で動かしている呼び出し）は、チャットの店の取り出し口を直接読む（会話の欄が隠れて止まっていても、
  // この画面は動く。会話の欄と同じ世代なら同じ値）。中の部品にはこの画面が配る
  const view = useChatSubagentsView(chatId);
  const visuals = chatVisuals.useFor(chatId);
  const background = backgroundCalls.useFor(chatId);
  const subagents = useOptionalSubagentNav();
  const activity = useOptionalActivityNav();
  const entry = view?.tree.byKey.get(agentKey);
  if (!view || !entry || !subagents || !activity) {
    return (
      <div className="subagent-screen missing">
        <EmptyState icon={Bot} title="このサブエージェントは見つかりません">
          会話を巻き戻した・書き直したなどで、記録からなくなりました。このタブは閉じてかまいません。
        </EmptyState>
      </div>
    );
  }
  return (
    <SubagentsContext.Provider value={view}>
      <VisualsContext.Provider value={visuals}>
        <BackgroundCallsContext.Provider value={background}>
          <ScreenView entry={entry} view={view} nav={{ subagents, activity }} />
        </BackgroundCallsContext.Provider>
      </VisualsContext.Provider>
    </SubagentsContext.Provider>
  );
}

/** 画面の見出しが使う口（右の欄はチャットの画面の口、別ウィンドウはメインのウィンドウに頼む口） */
interface ScreenNav {
  subagents: SubagentNav;
  activity: ActivityNav;
}

function ScreenView({ entry, view, nav }: { entry: SubagentEntry; view: SubagentsView; nav: ScreenNav }) {
  const running = entry.status === "running";
  // 実行中は「最後の動き」の表示を進める
  useTicker(running ? TICK_ACTIVITY : null);
  const steps = useSubagentScope(entry, view);
  const { scrollRef, contentRef, onScroll } = useFollowScroll(running);
  const renderScope = renderScopeOf(view.rel);
  // 手順・頼んだ内容・報告の文の右クリック（会話の流れと同じメニュー）
  const quoteMenu = useQuoteMenu();
  return (
    // chat-panel: 発言・入力欄の見た目を、パネルの中のチャットと同じにする（Panel.css・UserMessage.css の .chat-panel の規則）
    <div
      className="subagent-screen chat-panel"
      style={agentHueStyle(view.hues.get(entry.key))}
      data-agent-screen={`${view.chatId}:${entry.key}`}
    >
      <ScreenHead entry={entry} view={view} nav={nav} />
      <div ref={scrollRef} className="subagent-screen-scroll" onScroll={onScroll} tabIndex={-1} data-near-root="">
        <div ref={contentRef} className="subagent-screen-content" {...{ [QUOTABLE_ATTR]: "" }} onContextMenu={quoteMenu.openInRegion} onClickCapture={keepSelectionOnClick}>
          {entry.prompt && <SubagentPrompt text={entry.prompt} chatId={view.chatId} agentKey={entry.key} />}
          {/* 作業中か（作業の終わりの行の分岐などが読む。timelineBusy） */}
          <TimelineBusyContext.Provider value={view.busy}>
            <SubagentSteps entry={entry} view={view} steps={steps} renderScope={renderScope} />
          </TimelineBusyContext.Provider>
          <SubagentReport entry={entry} view={view} />
        </div>
      </div>
      <RelayComposer entry={entry} view={view} />
      {quoteMenu.element}
    </div>
  );
}

/** 見出し: 階層・名前と状態と時刻・いまの動き（終わったものはまとめ）と操作 */
function ScreenHead({ entry, view, nav }: { entry: SubagentEntry; view: SubagentsView; nav: ScreenNav }) {
  const running = entry.status === "running";
  const path = pathOf(view.tree, entry.key);
  return (
    <header className="subagent-screen-head">
      {/* 1 行目: 階層と、右の欄のタブのときだけ右端に「別ウィンドウで開く」 */}
      <div className="subagent-screen-top">
      <LineageTrail
        className="subagent-screen-path"
        label="サブエージェントの階層"
        items={[
          {
            key: "main",
            node: (
              <button
                type="button"
                className="link-button"
                title="チャットの流れの中の、このサブエージェントを起動したカードへ移ります"
                onClick={() => nav.subagents.reveal(path[0]?.key ?? entry.key)}
              >
                メインエージェント
              </button>
            ),
          },
          ...path.slice(0, -1).map((s) => ({
            key: s.key,
            node: (
              <button type="button" className="link-button" title={`「${s.description}」の画面を、この欄に開きます`} onClick={() => nav.subagents.openSide(s.key)}>
                {s.description}
              </button>
            ),
          })),
          { key: "current", node: <span className="subagent-screen-current">{entry.description}</span> },
        ]}
        sep={
          <span className="subagent-screen-sep" aria-hidden>
            ›
          </span>
        }
      />
        <PopOutTabButton />
      </div>
      <div className="subagent-screen-title">
        <span className={cx("agent-icon", running && "spinning")}>
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
            if (first !== undefined) nav.subagents.openSide(entry.key, first);
          }}
        />
        <SubagentStatusText entry={entry} />
        <SubagentTime entry={entry} />
      </div>
      <div className="subagent-screen-now">
        {running ? <NowLine entry={entry} view={view} rel={view.rel} /> : <Summary entry={entry} childCount={childrenOf(view.tree, entry.key).length} />}
        <span className="subagent-card-actions">
          <SubagentActions chatId={view.chatId} entry={entry} busy={view.busy} onOpen={(k) => nav.subagents.openSide(k)} />
          <SubagentLinkActions links={{ flow: () => nav.subagents.reveal(entry.key), activity: () => nav.activity.focus(entry.key) }} />
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
