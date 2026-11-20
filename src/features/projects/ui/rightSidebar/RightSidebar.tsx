import { useMemo, type CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { Panel } from "@/features/panel/ui/Panel";
import { usePanel, type TerminalTarget } from "@/features/panel/ui/usePanel";
import type { PanelFrame } from "@/features/panel/ui/PanelTools";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/projects/ui/storage";
import type { ProjectChatController } from "./useRightSidebar";
import { SideViewBody } from "./SideViewBody";

/** 右サイドバーはブラウザだけなので、ターミナルを開く場所はない */
const NO_TERMINALS: TerminalTarget[] = [];

/**
 * プロジェクトのチャット欄（画面の右端。下のパネルより下まで。画面の文言では「右サイドバー」）。ブラウザのタブはボードの右のパネルと同じタブ（Panel）で、
 * ＋からブラウザを開ける。左端のつまみで幅を変える。閉じても要素は残し（幅 0）、開いていたページ・書きかけをなくさない
 */
export function ProjectChat({ chat }: { chat: ProjectChatController }) {
  const { width: { paneRef: widthPaneRef, ...width }, projectId, maximized, setMaximized } = chat;
  // タブの列の左端の「横幅いっぱいに広げる ⇔ 元の幅に戻す」
  const frame = useMemo<PanelFrame>(() => ({ maximize: { on: maximized, toggle: () => setMaximized(!maximized) } }), [maximized, setMaximized]);
  if (projectId === undefined) return null;
  return (
    <aside
      ref={widthPaneRef}
      className={cx("project-chat", chat.open && "open", maximized && "maximized", width.resizing && "resizing")}
      // 開閉は幅の動きで見せる（中身は開いたときの幅のまま。動いている間に中身の並びが崩れないように）
      style={{ "--chat-w": `${width.size}px` } as CSSProperties}
      inert={!chat.open}
      aria-hidden={!chat.open}
      aria-label="右サイドバー"
    >
      <div className="pane-resizer project-chat-resizer" aria-label="右サイドバーの幅を変える" {...width.handle} />
      <div className="project-chat-inner">
        {/* 上の行は信号機ボタン・右上のレイアウトの開閉と同じ行のウィンドウのドラッグ領域。タブの列はその下の行 */}
        <div className="panel-window-titlebar" aria-hidden />
        <SideBody projectId={projectId} frame={frame} />
      </div>
    </aside>
  );
}

/**
 * 右サイドバーの中身: 右端のアイコンの列で選んだもの。
 * ブラウザはほかの中身を見ている間も隠して置く（ページ・ログインの状態・書きかけを保つ）。ほかの中身は見ているものだけ描く（SideViewBody）。
 * メインのウィンドウの右サイドバーと、右サイドバーの別ウィンドウ（PopoutSideChat）で同じものを描く
 */
export function SideBody({ projectId, frame }: { projectId: number; frame?: PanelFrame }) {
  const [view] = useSetting(storage.settings.sideView(projectId));
  return (
    <>
      <div className="side-browser" hidden={view !== "browser"}>
        <ProjectChatPanel projectId={projectId} frame={frame} />
      </div>
      {view !== "browser" && <SideViewBody key={projectId} projectId={projectId} view={view} frame={frame} />}
    </>
  );
}

/**
 * チャット欄の中身（プロジェクトのタブ。開いているかは欄の殻 useProjectChat と同じ店から読む）。チャット欄の別ウィンドウ（PopoutSideChat）も同じものを描く。
 * 欄ごと別ウィンドウへ移すボタンは置かない（タブは右クリック・ウィンドウの外へのドラッグで 1 つずつ別ウィンドウで開ける）。
 * frame: 横幅いっぱいの切り替え（メインのウィンドウだけ。別ウィンドウはウィンドウの大きさで決まるので渡さない）
 */
function ProjectChatPanel({ projectId, frame }: { projectId: number; frame?: PanelFrame }) {
  // ブラウザだけの欄なので、新しいチャット・ターミナルの開く場所は渡さない
  const panel = usePanel({ surface: "side", scope: projectId, newChat: undefined, terminals: NO_TERMINALS });
  return <Panel panel={panel} frame={frame} />;
}
