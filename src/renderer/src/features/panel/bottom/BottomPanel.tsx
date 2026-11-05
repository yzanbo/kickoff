import { cx } from "@/lib/cx";
import { Panel } from "@/features/panel/Panel";
import { usePanel } from "@/features/panel/usePanel";
import type { BottomPanelController } from "./useBottomPanel";

/**
 * フッター（画面の下のパネル。VS Code の「パネル」と同じ）。中身は右のパネル・右端のチャット欄と同じタブ（Panel）で、
 * 初めはターミナルとブラウザを出す（プロジェクトの画面では、タブの列の「表示するタブ」でチャットも出せる。全プロジェクトの画面では出さない）。上の端のつまみで高さを変える。
 * 閉じても要素は残し（高さ 0）、もう一度開いたら同じ画面に戻る
 */
export function BottomPanel({ bottom }: { bottom: BottomPanelController }) {
  const { open, maximized } = bottom;
  if (!bottom.available) return null;
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
        <BottomTabs bottom={bottom} />
      </div>
    </section>
  );
}

/** フッターの中身（画面ごとのタブ。開いているかは殻 useBottomPanel と同じ店から読む） */
function BottomTabs({ bottom }: { bottom: BottomPanelController }) {
  const { targets, scope } = bottom;
  // 全プロジェクトの画面のフッターはチャットを出さない（ターミナルとブラウザだけ。ボードの右のパネルをなくしたのと同じく、チャットはそのプロジェクトへ移って開く）。
  // プロジェクトの画面では、新しいチャットはそのプロジェクトで始める
  const all = scope === "all";
  const panel = usePanel({ surface: "bottom", scope, noChat: all, newChat: all || targets.length !== 1 ? undefined : { projectId: targets[0].projectId }, terminals: targets });
  return <Panel panel={panel} frame={{ maximize: { on: bottom.maximized, toggle: bottom.toggleMaximized } }} />;
}
