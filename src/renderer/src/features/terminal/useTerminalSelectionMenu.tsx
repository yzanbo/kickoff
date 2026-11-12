import { Copy } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { api } from "@/api";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { HandOffItem } from "@/features/chat/handoff/handOff";
import { HandOffItems } from "@/features/chat/handoff/HandOffMenu";
import { cleanSelection, isLongSelection, lineCount, terminalCaptureLabel, terminalQuote } from "./terminalSelection";

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

/**
 * ターミナルの右クリックのメニュー（文を選んでいるときだけ）: 「コピー」と、「選んだ文をチャットに追加」の共通の渡し先
 * （プロジェクトの欄のターミナルだけ）。selection は開いたときの選んだ文を読む
 */
export function useTerminalSelectionMenu({ projectId, cwd, selection }: { projectId: number | null; cwd: string; selection: () => string }): {
  onContextMenu: (e: MouseEvent<HTMLElement>) => void;
  element: ReactNode;
} {
  const menu = useContextMenu<{ raw: string; text: string }>();
  const shown = menu.menu;
  return {
    onContextMenu: (e) => {
      const raw = selection();
      const text = cleanSelection(raw);
      if (!text) return;
      menu.open(e, { raw, text });
    },
    element: shown && (
      <PopupMenu at={shown.at} label="ターミナルの操作" onClose={menu.close}>
        <MenuItem onSelect={() => void navigator.clipboard.writeText(shown.value.raw)}>
          <Copy size={14} /> コピー
        </MenuItem>
        {projectId !== null && (
          <>
            <div className="menu-separator" role="separator" />
            <div className="menu-label">選んだ文をチャットに追加{isLongSelection(shown.value.text) ? "（長いので札にします）" : ""}</div>
            <HandOffItems item={selectionItem(projectId, cwd, shown.value.text)} />
          </>
        )}
      </PopupMenu>
    ),
  };
}
