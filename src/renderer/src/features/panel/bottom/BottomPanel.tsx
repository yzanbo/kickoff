import { Maximize2, Minimize2, PanelBottomClose } from "lucide-react";
import { cx } from "@/lib/cx";
import { sidebarOrder } from "@/features/project/projectOrder";
import { useProjects } from "@/stores/projects";
import { Panel } from "@/features/panel/Panel";
import type { BottomPanelController } from "./useBottomPanel";

/**
 * フッター（画面の下のパネル。VS Code の「パネル」と同じ）。中身は右のパネル・右端のチャット欄と同じタブ（Panel）で、
 * 初めはターミナルとブラウザを出す（タブの列の「表示するタブ」でチャットも出せる）。上の端のつまみで高さを変える。
 * 閉じても要素は残し（高さ 0）、もう一度開いたら同じ画面に戻る
 */
export function BottomPanel({ bottom }: { bottom: BottomPanelController }) {
  const { open, maximized, panel, targets } = bottom;
  const { projects } = useProjects();
  if (!bottom.available) return null;
  // 新しいチャットは、プロジェクトの画面ならそのプロジェクト、全プロジェクトの画面ならサイドバーの先頭のプロジェクトで始める（新しいチャットの中で選び直せる）
  const newChatProject = targets.length === 1 ? targets[0].projectId : sidebarOrder(projects)[0]?.id;

  return (
    <section
      {...bottom.panelProps}
      className={cx("bottom-panel", open && "open", maximized && "maximized", bottom.resizing && "resizing")}
      inert={!open}
      aria-hidden={!open}
      aria-label="フッター"
    >
      <div className="bottom-panel-inner">
        <div
          className="bottom-panel-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="パネルの高さを変える"
          title="ドラッグで高さを変える（ダブルクリックで元の高さ）"
          onPointerDown={bottom.startResize}
          onDoubleClick={bottom.resetHeight}
        />
        <Panel
          panel={panel}
          onNewChat={() => newChatProject !== undefined && panel.openNew({ projectId: newChatProject })}
          terminals={targets}
          sidebar={{
            open,
            onClose: bottom.close,
            className: "in-footer",
            controls: (
              <>
                <button
                  type="button"
                  className="panel-control"
                  title={maximized ? "元の高さに戻す" : "フッターを最大化"}
                  aria-label={maximized ? "元の高さに戻す" : "フッターを最大化"}
                  aria-pressed={maximized}
                  onClick={bottom.toggleMaximized}
                >
                  {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button type="button" className="panel-control" title="フッターを閉じる（⌃` / ⌘J）" aria-label="フッターを閉じる" onClick={bottom.close}>
                  <PanelBottomClose size={15} />
                </button>
              </>
            ),
          }}
        />
      </div>
    </section>
  );
}
