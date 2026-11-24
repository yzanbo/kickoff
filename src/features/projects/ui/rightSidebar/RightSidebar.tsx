import "./RightSidebar.css";
import { useMemo, type CSSProperties } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import type { PanelFrame } from "@/features/panel/ui";
import { availableProjectViews } from "@/features/projects/ui/projectViews";
import { useProjects } from "@/features/projects/ui/stores/projects";
import type { ProjectChatController } from "./useRightSidebar";
import { SideViewBody, SideViewContent } from "./SideViewBody";
import { useSideView } from "./sideView";
import { writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/projects/ui/storage";
import { projectViewSurface, useLeaveGuard } from "@/features/projects/ui/viewLeave";

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
      className={cx("project-chat slide-pane", chat.open && "open", maximized && "maximized", width.resizing && "resizing")}
      data-axis="x"
      // 開閉は幅の動きで見せる（中身は開いたときの幅のまま。動いている間に中身の並びが崩れないように）
      style={{ "--chat-w": `${width.size}px` } as CSSProperties}
      inert={!chat.open}
      aria-hidden={!chat.open}
      aria-label="右サイドバー"
    >
      <div className="pane-resizer project-chat-resizer" aria-label="右サイドバーの幅を変える" {...width.handle} />
      <div className="project-chat-inner slide-pane-inner">
        {/* 上の行は信号機ボタン・右上のレイアウトの開閉と同じ行のウィンドウのドラッグ領域。タブの列はその下の行 */}
        <div className="panel-window-titlebar" aria-hidden />
        <SideBody projectId={projectId} frame={frame} />
      </div>
    </aside>
  );
}

/**
 * 右サイドバーの中身: 右端のアイコンの列で選んだもの（画面の表 projectViews のうち右サイドバーに置けるもの）。
 * keepAlive の画面（ブラウザ）はほかの中身を見ている間も隠して置く（ページ・ログインの状態・書きかけを保つ）。ほかの中身は見ているものだけ描く（SideViewBody）。
 * メインのウィンドウの右サイドバーと、右サイドバーの別ウィンドウ（PopoutSideChat）で同じものを描く
 */
export function SideBody({ projectId, frame }: { projectId: number; frame?: PanelFrame }) {
  // ほかの中身へ移る前に、いまの中身の書きかけ（DB の表の変更など）を聞く（やめたら覚えた中身を元に戻す）
  const view = useLeaveGuard(
    useSideView(projectId),
    (v) => projectViewSurface({ place: "rightSidebar", projectId, view: v }),
    (v) => writeSetting(storage.settings.sideView(projectId), v),
    "右サイドバーの中身を切り替えます。",
  );
  const project = useProjects().projectsById.get(projectId);
  if (!project) return null;
  const views = availableProjectViews("rightSidebar");
  const shown = views.find((v) => v.id === view);
  return (
    <>
      {views
        .filter((v) => v.keepAlive)
        .map((v) => (
          <div key={v.id} className="side-browser" hidden={view !== v.id}>
            <SideViewContent project={project} def={v} frame={frame} />
          </div>
        ))}
      {shown && !shown.keepAlive && <SideViewBody key={projectId} project={project} def={shown} frame={frame} />}
    </>
  );
}
