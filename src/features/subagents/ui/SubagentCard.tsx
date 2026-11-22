import { ChevronRight, GitBranch, PanelRight, Reply } from "lucide-react";
import { memo, type KeyboardEvent, type MouseEvent } from "react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { cx } from "@/foundation/ui/lib/cx";
import { useTicker } from "@/foundation/ui/hooks/useTicker";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { canPopout } from "@/foundation/ui/navigation/popout";
import { SUBAGENT_OPEN_IN } from "@/foundation/ui/storage/storageKeys";
import { useShownInAgentPanel } from "@/features/chatPanel/ui/agents/agentTabs";
import { ClaudeMark } from "@/features/ai/ui/ClaudeMark";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { useOptionalActivityNav, useOptionalChatScreen, useOptionalSubagentNav, usePortValue } from "@/features/chat/ui";
import { useTimelineOpen } from "@/features/chat/ui/timeline/timelineView";
import type { ToolCall } from "@/features/conversation/ui/timeline/timelineItems";
import { SubagentActions } from "./SubagentActions";
import { SubagentTellBox } from "./SubagentTell";
import { ChildChatMarks } from "@/features/childChats/ui/ChildChatChips";
import { SubagentWindow } from "./SubagentWindow";
import { agentHueStyle } from "@/features/subagents/ui/model/agentHues";
import { SubagentStatusText } from "./SubagentStatusText";
import { useSubagentsView, type SubagentsView } from "./subagentsContext";
import { childrenOf, pathOf } from "@/features/subagents/ui/model/subagentTree";
import {
  NowLine,
  SubagentChildRows,
  SubagentKind,
  SubagentPrompt,
  SubagentReport,
  SubagentSteps,
  SubagentTime,
  Summary,
  useSubagentItems,
  type RenderItems,
} from "./subagentParts";

/** 字下げをやめる深さ（これより深い入れ子は字下げせず、見出しに外側からの道筋を添える） */
const FLAT_DEPTH = 3;

interface CardProps {
  call: ToolCall;
  rel: (s: string) => string;
  renderItems: RenderItems;
}

/**
 * 流れの中のサブエージェントのカード（Agent / Task の呼び出し 1 つ）。閉じた状態でも、状態・名前・開始〜終了（実行中は開始〜最後の動き）・
 * いまの動き（中で起動したサブエージェントのものも）・操作を出す。開くと、そのサブエージェントの流れ（依頼 → 発言・ツール（時刻付き）→ 報告）を
 * 字下げして出し、中で起動したサブエージェントも同じカードとして入れ子で出す。開閉はチャットの画面の状態（ピルから移ったときも開く）。
 * カードの上の 2 行（見出しといまの動き / まとめ）のどこを押しても、設定（SUBAGENT_OPEN_IN）の開き方で開く: 流れの中で開く・チャットの画面の右の欄に開く・別ウィンドウで開く
 * （中のボタンを押したとき・文を選んだときは除く）。左の ＞ はいつも流れの中での開閉（設定が右の欄でも、流れの中で中身を見られる）。
 * 設定が右の欄でないときは、操作の「右の欄で開く」で右の欄にも開ける。
 * 右の欄で表示しているカードには「右の欄で表示中」と添える
 */
function SubagentCardView({ call, rel, renderItems }: CardProps) {
  const view = useSubagentsView();
  const nav = useOptionalSubagentNav();
  const activity = useOptionalActivityNav();
  const screen = useOptionalChatScreen();
  const key = call.use.data.id;
  // 開閉は流れの見え方の店（行が窓から外れて戻っても・画面を作り直しても開いたまま）
  const [open] = useTimelineOpen(call.use.chat_id, `sa:${key}`);
  // 「伝える」の入力欄を開いているか（カードのいちばん下に開く）
  const telling = usePortValue(nav?.tellOpen, (s) => s.has(key), false);
  const entry = view?.tree.byKey.get(key);
  const running = entry?.status === "running";
  // 実行中は「最後の動き」の表示を進める
  useTicker(running ? 15_000 : 3_600_000);
  // 見出しを押したときに右の欄で開くか（設定。右の欄を置けない画面では、いつも流れの中）
  const [openIn] = useSetting(SUBAGENT_OPEN_IN);
  const sideFirst = openIn === "side" && Boolean(nav?.canOpenSide);
  const windowFirst = openIn === "window" && canPopout();
  const inSide = useShownInAgentPanel(view?.chatId ?? 0, key);
  if (!view || !entry) return <PlainCard call={call} />;

  const path = pathOf(view.tree, key);
  const depth = path.length - 1;
  const toggle = () => (windowFirst ? nav?.openWindow(key) : sideFirst ? nav?.openSide(key) : nav?.toggle(key));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    toggle();
  };
  // 上の 2 行のどこを押しても開く（中のボタン・リンク・入力欄を押したとき、文を選び終えたときは、それぞれに任せる）
  const onTopClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button, a, input, textarea, select, label")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.anchorNode && e.currentTarget.contains(selection.anchorNode)) return;
    toggle();
  };
  return (
    <div
      id={`ev-${call.use.id}`}
      className={cx("subagent-card card", running && "running", open && "open", depth >= FLAT_DEPTH && "flat")}
      data-depth={depth}
      style={agentHueStyle(view.hues.get(key))}
    >
      {/* 上の 2 行（見出し・いまの動き / まとめ）。どこを押しても設定の開き方で開く（onTopClick） */}
      <div className="subagent-card-top" onClick={onTopClick}>
        <div className="subagent-card-head" role="button" tabIndex={0} aria-expanded={open} onKeyDown={onKeyDown}>
          {nav ? (
            <IconButton
              size="xs"
              icon={ChevronRight}
              label={open ? "流れの中で閉じる" : "流れの中で開く"}
              className="subagent-card-chevron"
              iconClassName="tool-chevron"
              aria-expanded={open}
              onClick={() => nav.toggle(key)}
            />
          ) : (
            <ChevronRight size={14} className="tool-chevron" />
          )}
          <span className={cx("subagent-icon", running && "spinning")}>
            <ClaudeMark size={14} />
          </span>
          <span className="subagent-card-title">
            {depth >= FLAT_DEPTH && (
              <span className="subagent-card-path">
                {path
                  .slice(0, -1)
                  .map((s) => s.description)
                  .join(" › ")}{" "}
                ›{" "}
              </span>
            )}
            <SubagentKind entry={entry} view={view} />
            <span className="subagent-card-name">{entry.description}</span>
            <span className="subagent-card-type">{entry.subagentType ?? "general-purpose"}</span>
            <SubagentStatusText entry={entry} />
            {inSide && <span className="subagent-card-side tag">右の欄で表示中</span>}
          </span>
          <SubagentTime entry={entry} />
        </div>
        <div className="subagent-card-now">
          {running ? <NowLine entry={entry} view={view} rel={rel} /> : <Summary entry={entry} childCount={childrenOf(view.tree, key).length} />}
          <span className="subagent-card-actions">
            <SubagentActions chatId={view.chatId} entry={entry} busy={view.busy} onOpen={(k) => nav?.open(k)} />
            {/* 流れの中での開閉は左の ＞。設定が右の欄のときは、上の 2 行を押せば右の欄に開くので出さない */}
            {nav?.canOpenSide && !sideFirst && (
              <button
                type="button"
                className="link-button subagent-tell"
                title="このサブエージェントを、チャットの画面の右の欄に、チャットと同じような画面で開く（右の欄の中で上下・左右に分けて並べられます）"
                onClick={() => nav.openSide(key)}
              >
                <PanelRight size={12} aria-hidden />
                右の欄で開く
              </button>
            )}
            {activity && (
              <button
                type="button"
                className="link-button subagent-tell"
                title="見出しの「動き」を開き、このサブエージェントと、その中で起動したものの行をすべて強調して、初めの行へ移ります（↑↓ で順に移る）"
                onClick={() => activity.focus(key)}
              >
                <GitBranch size={12} aria-hidden />
                動きで見る
              </button>
            )}
            {nav && entry.agentId && (
              <button
                type="button"
                className="link-button subagent-tell"
                title="メインエージェント経由で、このサブエージェントに追加の指示を伝える（直接は送れないので、メインエージェントが SendMessage で渡します。カードの下に入力欄を開きます）"
                aria-expanded={telling}
                onClick={() => (telling ? nav.closeTell(key) : nav.tell(key))}
              >
                <Reply size={12} aria-hidden />
                伝える
              </button>
            )}
          </span>
        </div>
      </div>
      {/* 閉じているときは、中で起動したサブエージェントを木の枝の形で並べる（開くと中にカードが並ぶので出さない） */}
      {!open && nav && (
        <SubagentChildRows entry={entry} view={view} onOpen={(k) => nav.open(k)} onMore={() => nav.toggle(key, true)} />
      )}
      {open && <SubagentCardBody entry={entry} view={view} renderItems={renderItems} windowed={depth === 0} />}
      {nav && telling && <SubagentTellBox entry={entry} view={view} onClose={() => nav.closeTell(key)} />}
      {/* このサブエージェントに子チャットで聞いたら、その子チャットの札（発言の下と同じ。始めた位置は起動の呼び出し） */}
      {screen && entry.toolUseEventId !== undefined && <ChildChatMarks chatId={screen.chatId} eventId={entry.toolUseEventId} />}
    </div>
  );
}

/** 呼び出しと結果が同じなら描き直さない（一覧・記録が変わったときは、読んでいる context で描き直る） */
export const SubagentCard = memo(SubagentCardView, (a, b) => a.call.use === b.call.use && a.call.result === b.call.result && a.rel === b.rel);

/** 一覧にないサブエージェント（チャットの画面の外など）: 名前だけ */
function PlainCard({ call }: { call: ToolCall }) {
  const input = call.use.data.input as { description?: string } | undefined;
  return (
    <div id={`ev-${call.use.id}`} className="subagent-card card">
      <div className="subagent-card-head static">
        <span className="subagent-icon">
          <ClaudeMark size={14} />
        </span>
        <span className="subagent-card-title">
          <span className="subagent-card-name">{input?.description ?? "サブエージェント"}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * 開いたカードの中身: 親からの依頼（初めはたたむ）→ 手順（発言・ツール・入れ子のカード・実行中の印）→ 親への報告。
 * いちばん外側のカード（windowed）の手順は、高さを決めた窓の中に入れる（依頼と報告は窓の外で、いつも見える。入れ子のカードは窓の中でふつうに開く）
 */
function SubagentCardBody({ entry, view, renderItems, windowed }: { entry: SubagentEntry; view: SubagentsView; renderItems: RenderItems; windowed: boolean }) {
  const items = useSubagentItems(entry, view);
  const steps = <SubagentSteps entry={entry} view={view} items={items} renderItems={renderItems} />;
  return (
    <div className="subagent-card-body">
      {entry.prompt && <SubagentPrompt text={entry.prompt} chatId={view.chatId} agentKey={entry.key} />}
      {windowed ? (
        <SubagentWindow chatId={view.chatId} cardKey={entry.key} running={entry.status === "running"}>
          {steps}
        </SubagentWindow>
      ) : (
        steps
      )}
      <SubagentReport entry={entry} view={view} limited />
    </div>
  );
}
