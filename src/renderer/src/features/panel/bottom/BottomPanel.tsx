import { Maximize2, Minimize2, PanelBottomClose } from "lucide-react";
import { cx } from "@/lib/cx";
import { Panel } from "@/features/panel/Panel";
import type { BottomPanelController } from "./useBottomPanel";
import { IconButton } from "@/ui/IconButton";

/**
 * フッター（画面の下のパネル。VS Code の「パネル」と同じ）。中身は右のパネル・右端のチャット欄と同じタブ（Panel）で、
 * 初めはターミナルとブラウザを出す（タブの列の「表示するタブ」でチャットも出せる）。上の端のつまみで高さを変える。
 * 閉じても要素は残し（高さ 0）、もう一度開いたら同じ画面に戻る
 */
export function BottomPanel({ bottom }: { bottom: BottomPanelController }) {
  const { open, maximized, panel, targets } = bottom;
  if (!bottom.available) return null;
  // 新しいチャットは、プロジェクトの画面ならそのプロジェクト、全プロジェクトの画面なら選べるプロジェクトの先頭（サイドバーの先頭）で始める
  // （新しいチャットの中で選び直せる。タグの絞り込みで 1 つも選べなければ、ターミナルを開ける先頭のプロジェクト）
  const newChatProject = targets.length === 1 ? targets[0].projectId : (panel.projects?.[0]?.id ?? targets[0]?.projectId);

  return (
    <section
      {...bottom.panelProps}
      className={cx("bottom-panel", open && "open", maximized && "maximized", bottom.resizing && "resizing")}
      inert={!open}
      aria-hidden={!open}
      aria-label="フッター"
    >
      <div className="bottom-panel-inner">
        <div className="bottom-panel-resizer" aria-label="パネルの高さを変える" {...bottom.resizeHandle} />
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
                <IconButton
                  type="button"
                  icon={maximized ? Minimize2 : Maximize2}
                  className="panel-control"
                  label={maximized ? "元の高さに戻す" : "フッターを最大化"}
                  aria-pressed={maximized}
                  onClick={bottom.toggleMaximized}
                />
                <IconButton type="button" icon={PanelBottomClose} size={15} className="panel-control" label="フッターを閉じる" keys="⌃` / ⌘J" onClick={bottom.close} />
              </>
            ),
          }}
        />
      </div>
    </section>
  );
}
