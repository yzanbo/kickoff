import type { MutableRefObject, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useCoverableWidth } from "@/hooks/useCoverableWidth";
import { SUBAGENT_PANEL_MAXIMIZED, SUBAGENT_PANEL_WIDTH } from "@/lib/storageKeys";
import type { SidePanelHandle } from "@/features/chat/pane/useChatView";
import { usePanelHost } from "@/features/panel/panelHost";
import { usePanel, type TerminalTarget } from "@/features/panel/usePanel";
import { SideSelectionAttach } from "@/features/chat/messages/SelectionAttach";
import { MainChatContext } from "@/features/chat/pane/mainChatContext";
import { panelKey, type DraftScope } from "@/features/panel/surfaces";
import { DraftSideContext } from "./draftSide";
import { AgentPanelFind } from "./AgentPanelFind";

/** 右の欄のいちばん狭い幅 */
const MIN_AGENT_PANEL_WIDTH = 300;
/** 右の欄の横に残すメインの会話がこれより狭くなるなら、右の欄でメインを覆う（読めない細い帯を残さない） */
const MIN_MAIN_WIDTH = 320;
const NO_TERMINALS: readonly TerminalTarget[] = [];

/**
 * チャットの画面を、左のメインの会話（children）と、右の欄（サブエージェントの欄。チャットごとのパネル）に横に並べる殻。
 * 右の欄は、ボードの右のパネルと同じタブの入れ物（Panel の agents。タブ・上下左右の分割・タブのドラッグ・境目は通常のパネルと同じ）を入れ子にしたもの。
 * 幅は左端のつまみのドラッグで変えて覚え（アプリ全体）、メインが狭すぎる幅まで広げる・メインの残りが狭いときは、右の欄でメインを覆う
 * （覆っている間、メインは隠すが描いたまま残す）。タブの列の左端に「横幅いっぱいに広げる ⇔ 元の幅に戻す」のボタン（利用者の依頼。ボードの右のパネルと同じ。
 * 横幅いっぱいにしているかはアプリ全体で覚える SUBAGENT_PANEL_MAXIMIZED）。
 * 一度サブエージェントを開いたら、閉じても右の欄の中身は残す（入力中の文・読んでいた位置を保つ。閉じ終えたら隠す）。
 * パネルの外（PanelHostContext がない）では右の欄を置かない。
 * 右の欄の中（どのタブでも）は、このチャットを「メインのチャット」とする（MainChatContext。右クリックの「メインのチャット」の組と、選んだときの「チャットに追加」）。
 * scope はチャットの ID か、送る前の新しいチャットの下書きの範囲（DraftScope。足す先のチャットはまだないので MainChatContext は null、
 * 左の中身には DraftSideContext で開く先を知らせる。送ったら moveDraftSidePanel でチャットの右の欄へ移す）
 */
export function AgentSplit({ scope, handleRef, children }: { scope: number | DraftScope; handleRef: MutableRefObject<SidePanelHandle | null>; children: ReactNode }) {
  const Host = usePanelHost();
  const chatId = typeof scope === "number" ? scope : null;
  const panel = usePanel({ surface: "agents", scope, newChat: undefined, terminals: NO_TERMINALS });
  const width = useCoverableWidth({
    width: SUBAGENT_PANEL_WIDTH,
    maximized: SUBAGENT_PANEL_MAXIMIZED,
    min: MIN_AGENT_PANEL_WIDTH,
    gap: 0,
    minRest: MIN_MAIN_WIDTH,
    widthVar: "--agents-w",
    shownVar: "--agents-shown",
  });
  const open = Host !== null && panel.panelOpen;
  // 右の欄でメインを覆っているか（横幅いっぱいにした・狭くてメインが読めない）
  const full = width.maximized || width.covering;
  const covering = open && full;
  // 流れの中のカードへ移るときは、メインを見せる（並べる形に戻す。狭くて戻せなければ、右の欄を閉じる）
  handleRef.current = {
    uncover: () => {
      if (!covering) return;
      if (width.canRestore) width.toggleMaximized();
      else panel.close();
    },
  };
  return (
    <div
      ref={width.bodyRef}
      className={cx("chat-split", open && "with-agents", covering && "agents-full", width.resizing && "resizing", width.stretching && "stretching")}
      style={width.style}
    >
      <div className="chat-split-main" inert={covering} aria-hidden={covering || undefined}>
        {chatId === null ? <DraftSideContext.Provider value={scope as DraftScope}>{children}</DraftSideContext.Provider> : children}
      </div>
      {Host && (panel.panelOpen || panel.tabs.length > 0) && (
        <MainChatContext.Provider value={chatId}>
          <Host
            panel={panel}
            frame={{
              paneRef: width.paneRef,
              resizeHandle: width.resizeHandle,
              // 覆っていて、メインを残すと右の欄の最小の幅に足りないほど狭いときは、元の幅に戻せない
              maximize: { on: full, disabled: full && !width.canRestore, toggle: width.toggleMaximized },
            }}
          />
          {chatId !== null && <SideSelectionAttach mainChatId={chatId} container={() => document.querySelector(`[data-panel-key="${panelKey("agents", chatId)}"]`)} />}
        </MainChatContext.Provider>
      )}
      {/* ⌘F でタブの中の文字を探す（右の欄の中にピントがあるとき） */}
      {Host && panel.tabs.length > 0 && <AgentPanelFind panelKey={panelKey("agents", scope)} />}
    </div>
  );
}
