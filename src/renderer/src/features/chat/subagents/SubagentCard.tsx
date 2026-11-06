import { ChevronRight, ChevronsUpDown, GitBranch, PanelRight, Reply } from "lucide-react";
import { memo, type KeyboardEvent } from "react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { cx } from "@/lib/cx";
import { useTicker } from "@/hooks/useTicker";
import { useSetting } from "@/hooks/useSetting";
import { canPopout } from "@/app/popout";
import { SUBAGENT_OPEN_IN } from "@/lib/storageKeys";
import { useShownInAgentPanel } from "@/features/panel/agents/agentTabs";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { useChatPaneState, useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import type { ToolCall } from "@/features/chat/timeline/timelineItems";
import { SubagentActions } from "./SubagentActions";
import { SubagentTellBox } from "./SubagentTell";
import { SubagentWindow } from "./SubagentWindow";
import { agentHueStyle } from "./agentHues";
import { showsSubagentStatus, subagentStatusClass, subagentStatusLabel, subagentStatusTitle } from "./subagentList";
import { useSubagentsView, type SubagentsView } from "./subagentsContext";
import { childrenOf, pathOf } from "./subagentTree";
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
 * 見出しを押したときの開き方は設定（SUBAGENT_OPEN_IN）で、流れの中で開く・チャットの画面の右の欄に開く・別ウィンドウで開く。
 * もう一方は操作の「右の欄で開く」/「流れの中で開く」でいつでも選べる。右の欄で表示しているカードには「右の欄で表示中」と添える
 */
function SubagentCardView({ call, rel, renderItems }: CardProps) {
  const view = useSubagentsView();
  const pane = useOptionalChatPane();
  const key = call.use.data.id;
  const open = useChatPaneState((s) => s.openSubagents.has(key)) ?? false;
  // 「伝える」の入力欄を開いているか（カードのいちばん下に開く）
  const telling = useChatPaneState((s) => s.tellOpen.has(key)) ?? false;
  const entry = view?.tree.byKey.get(key);
  const running = entry?.status === "running";
  // 実行中は「最後の動き」の表示を進める
  useTicker(running ? 15_000 : 3_600_000);
  // 見出しを押したときに右の欄で開くか（設定。右の欄を置けない画面では、いつも流れの中）
  const [openIn] = useSetting(SUBAGENT_OPEN_IN);
  const sideFirst = openIn === "side" && Boolean(pane?.canOpenSide);
  const windowFirst = openIn === "window" && canPopout();
  const inSide = useShownInAgentPanel(view?.chatId ?? 0, key);
  if (!view || !entry) return <PlainCard call={call} />;

  const path = pathOf(view.tree, key);
  const depth = path.length - 1;
  const toggle = () => (windowFirst ? pane?.openSubagentWindow(key) : sideFirst ? pane?.openSubagentSide(key) : pane?.toggleSubagent(key));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggle();
  };
  return (
    <div
      id={`ev-${call.use.id}`}
      className={cx("subagent-card", running && "running", open && "open", depth >= FLAT_DEPTH && "flat")}
      data-depth={depth}
      style={agentHueStyle(view.hues.get(key))}
    >
      <div className="subagent-card-head" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={onKeyDown}>
        <ChevronRight size={14} className="tool-chevron" />
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
          {showsSubagentStatus(entry) && (
            <span className={cx("subagent-status", subagentStatusClass(entry))} title={subagentStatusTitle(entry)}>
              {subagentStatusLabel(entry)}
            </span>
          )}
          {inSide && <span className="subagent-card-side">右の欄で表示中</span>}
        </span>
        <SubagentTime entry={entry} />
      </div>
      <div className="subagent-card-now">
        {running ? <NowLine entry={entry} view={view} rel={rel} /> : <Summary entry={entry} childCount={childrenOf(view.tree, key).length} />}
        <span className="subagent-card-actions">
          <SubagentActions chatId={view.chatId} entry={entry} busy={view.busy} onOpen={(k) => pane?.openSubagent(k)} />
          {pane?.canOpenSide &&
            (sideFirst ? (
              <button
                type="button"
                className="link-button subagent-tell"
                title="右の欄ではなく、この流れの中でカードの中身を開く・閉じる"
                aria-expanded={open}
                onClick={() => pane.toggleSubagent(key)}
              >
                <ChevronsUpDown size={12} aria-hidden />
                {open ? "流れの中で閉じる" : "流れの中で開く"}
              </button>
            ) : (
              <button
                type="button"
                className="link-button subagent-tell"
                title="このサブエージェントを、チャットの画面の右の欄に、メインと同じような画面で開く（右の欄の中で上下・左右に分けて並べられます）"
                onClick={() => pane.openSubagentSide(key)}
              >
                <PanelRight size={12} aria-hidden />
                右の欄で開く
              </button>
            ))}
          {pane && (
            <button
              type="button"
              className="link-button subagent-tell"
              title="見出しの「動き」を開き、このサブエージェントと、その中で起動したものの行をすべて強調して、初めの行へ移ります（↑↓ で順に移る）"
              onClick={() => pane.focusActivity(key)}
            >
              <GitBranch size={12} aria-hidden />
              動きで見る
            </button>
          )}
          {pane && entry.agentId && (
            <button
              type="button"
              className="link-button subagent-tell"
              title="このサブエージェントに追加の指示を伝える（カードの下に入力欄を開きます。メインのエージェントから SendMessage で渡します）"
              aria-expanded={telling}
              onClick={() => (telling ? pane.closeTell(key) : pane.tellSubagent(key))}
            >
              <Reply size={12} aria-hidden />
              伝える
            </button>
          )}
        </span>
      </div>
      {/* 閉じているときは、中で起動したサブエージェントを木の枝の形で並べる（開くと中にカードが並ぶので出さない） */}
      {!open && pane && (
        <SubagentChildRows entry={entry} view={view} onOpen={(k) => pane.openSubagent(k)} onMore={() => pane.toggleSubagent(key, true)} />
      )}
      {open && <SubagentCardBody entry={entry} view={view} renderItems={renderItems} windowed={depth === 0} />}
      {pane && telling && <SubagentTellBox entry={entry} view={view} onClose={() => pane.closeTell(key)} />}
    </div>
  );
}

/** 呼び出しと結果が同じなら描き直さない（一覧・記録が変わったときは、読んでいる context で描き直る） */
export const SubagentCard = memo(SubagentCardView, (a, b) => a.call.use === b.call.use && a.call.result === b.call.result && a.rel === b.rel);

/** 一覧にないサブエージェント（チャットの画面の外など）: 名前だけ */
function PlainCard({ call }: { call: ToolCall }) {
  const input = call.use.data.input as { description?: string } | undefined;
  return (
    <div id={`ev-${call.use.id}`} className="subagent-card">
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
      {entry.prompt && <SubagentPrompt text={entry.prompt} />}
      {windowed ? (
        <SubagentWindow cardKey={entry.key} running={entry.status === "running"}>
          {steps}
        </SubagentWindow>
      ) : (
        steps
      )}
      <SubagentReport entry={entry} view={view} />
    </div>
  );
}
