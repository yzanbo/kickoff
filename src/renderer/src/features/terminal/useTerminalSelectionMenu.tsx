import type { Terminal } from "@xterm/xterm";
import { ChevronDown, Copy } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import { api } from "@/api";
import { AddToChat } from "@/ui/icons";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { HandOffItem } from "@/features/chat/handoff/handOff";
import { HandOffItems } from "@/features/chat/handoff/HandOffMenu";
import { cleanSelection, isLongSelection, lineCount, selectionButtonPoint, terminalCaptureLabel, terminalQuote } from "./terminalSelection";

/** 小さなボタンの幅の目安（画面の右端からはみ出さないように寄せる） */
const BUTTON_WIDTH = 150;

/** 選んだ文を渡すもの（短ければ入力欄の文、長ければ押した時点の中身の札。新しいチャットは本体で始める） */
function selectionItem(projectId: number, cwd: string, text: string): HandOffItem {
  const lines = lineCount(text);
  if (!isLongSelection(text)) return { projectId, what: `ターミナルで選んだ文（${lines} 行）`, text: terminalQuote(text) };
  return {
    projectId,
    what: `ターミナルで選んだ文（${lines} 行。長いので札にします）`,
    text: "",
    capture: () => api.capture({ name: "terminal.txt", mime: "text/plain", text, source: { type: "terminal", label: terminalCaptureLabel(cwd, text), url: null }, tail_share: 0.8 }),
  };
}

/** 選んだ範囲の終わりの下の位置（選んでいない・終わりが見えていなければ null） */
function anchorOf(term: Terminal | undefined, screen: HTMLElement | null): { x: number; y: number } | null {
  const range = term?.hasSelection() ? term.getSelectionPosition() : undefined;
  const face = screen?.querySelector<HTMLElement>(".xterm-screen");
  if (!term || !range || !face || !cleanSelection(term.getSelection())) return null;
  const point = selectionButtonPoint(range.end, { viewportY: term.buffer.active.viewportY, rows: term.rows, cols: term.cols }, face.getBoundingClientRect());
  return point && { x: Math.max(4, Math.min(point.x, window.innerWidth - BUTTON_WIDTH)), y: point.y };
}

/**
 * ターミナルで選んだ文の操作: 選び終えたら範囲の終わりの下に小さな「チャットに追加 ▾」（プロジェクトの欄のターミナルだけ。ほかの選んだ文の
 * 「チャットに追加」と同じ見た目）、右クリックで「コピー」と「選んだ文をチャットに追加」の共通の渡し先。キーを押す・スクロールで小さなボタンは消す
 */
export function useTerminalSelectionMenu({ projectId, cwd, term, screen }: { projectId: number | null; cwd: string; term: () => Terminal | undefined; screen: () => HTMLElement | null }): {
  handlers: { onContextMenu: (e: MouseEvent<HTMLElement>) => void; onMouseUp: () => void; onKeyDown: () => void; onWheel: () => void };
  element: ReactNode;
} {
  const menu = useContextMenu<{ raw: string; text: string; fromButton: boolean }>();
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const shown = menu.menu;
  const selected = () => {
    const raw = term()?.getSelection() ?? "";
    return { raw, text: cleanSelection(raw) };
  };
  const hide = () => setAnchor(null);
  return {
    handlers: {
      onContextMenu: (e) => {
        const value = selected();
        if (!value.text) return;
        hide();
        menu.open(e, { ...value, fromButton: false });
      },
      // xterm が選択を決め終えてから測る
      onMouseUp: () => setTimeout(() => setAnchor(projectId === null ? null : anchorOf(term(), screen())), 0),
      onKeyDown: hide,
      onWheel: hide,
    },
    element: (
      <>
        {anchor && !shown && (
          <div className="selection-attach terminal-selection-attach" style={{ left: anchor.x, top: anchor.y }}>
            <button
              type="button"
              className="btn selection-attach-button"
              title="選んだ文を、チャットの入力欄に足す（長い選択は札にします。送るのは自分で）"
              // 押しても選択を外さない
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                const value = selected();
                if (value.text) menu.openBelow(e, { ...value, fromButton: true });
                hide();
              }}
            >
              <AddToChat size={13} /> チャットに追加 <ChevronDown size={12} aria-hidden />
            </button>
          </div>
        )}
        {shown && (
          <PopupMenu at={shown.at} label="ターミナルの操作" onClose={menu.close}>
            {!shown.value.fromButton && (
              <MenuItem onSelect={() => void navigator.clipboard.writeText(shown.value.raw)}>
                <Copy size={14} /> コピー
              </MenuItem>
            )}
            {projectId !== null && (
              <>
                {!shown.value.fromButton && <div className="menu-separator" role="separator" />}
                <div className="menu-label">選んだ文をチャットに追加{isLongSelection(shown.value.text) ? "（長いので札にします）" : ""}</div>
                <HandOffItems item={selectionItem(projectId, cwd, shown.value.text)} />
              </>
            )}
          </PopupMenu>
        )}
      </>
    ),
  };
}
