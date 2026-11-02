import { X } from "lucide-react";
import { Fragment, lazy, Suspense, useRef } from "react";
import { cx } from "../../cx";
import { startHorizontalDrag } from "../../hooks/dragResize";
import type { TerminalGroup } from "./terminalGroups";

// xterm.js は、ターミナルを開いたときだけ読み込む
const TerminalPane = lazy(() => import("../terminal/TerminalPane"));

/** ペインの最小の幅（割合） */
const MIN_SIZE = 0.1;

/**
 * 下のパネルのタブ 1 つの中身。分割したペインを左右に並べ、境目のドラッグで幅を変える（VS Code と同じ）。
 * 分割しているときだけ、ペインの右上に閉じるボタンを出し、入力先のペインを枠で示す
 */
export function TerminalSplit({
  group,
  visible,
  onFocusPane,
  onClosePane,
  onResize,
}: {
  group: TerminalGroup;
  /** パネルで表示しているタブか */
  visible: boolean;
  onFocusPane: (paneKey: string) => void;
  onClosePane: (paneKey: string) => void;
  onResize: (sizes: number[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const split = group.panes.length > 1;

  /** i 番目と i+1 番目のペインの境目をドラッグする */
  const startResize = (e: React.PointerEvent<HTMLDivElement>, i: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sizes = [...group.sizes];
    // ドラッグしている 2 つのペインの左端と、2 つを合わせた幅（割合）
    const start = sizes.slice(0, i).reduce((a, b) => a + b, 0);
    const pair = sizes[i] + sizes[i + 1];
    startHorizontalDrag(e, {
      move: (clientX) => {
        const at = (clientX - rect.left) / rect.width - start;
        sizes[i] = Math.max(MIN_SIZE, Math.min(pair - MIN_SIZE, at));
        sizes[i + 1] = pair - sizes[i];
        onResize([...sizes]);
      },
      end: () => {},
    });
  };

  return (
    <div ref={ref} className={cx("terminal-split", split && "is-split")}>
      {group.panes.map((p, i) => (
        <Fragment key={p.key}>
          {i > 0 && (
            <div
              className="pane-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="ペインの幅を変える"
              title="ドラッグで幅を変える"
              onPointerDown={(e) => startResize(e, i - 1)}
            />
          )}
          <div className={cx("terminal-split-pane", split && p.key === group.activePane && "focused")} style={{ flex: `${group.sizes[i]} 1 0` }}>
            {split && (
              <button className="terminal-split-close" aria-label={`${p.label} のペインを閉じる`} title="このペインを閉じる" onClick={() => onClosePane(p.key)}>
                <X size={12} />
              </button>
            )}
            <Suspense fallback={<div className="page muted">読み込み中…</div>}>
              <TerminalPane
                termKey={p.key}
                cwd={p.cwd}
                visible={visible}
                focused={visible && p.key === group.activePane}
                onFocus={() => onFocusPane(p.key)}
                onOpenUrl={(url) => window.open(url, "_blank")}
              />
            </Suspense>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
