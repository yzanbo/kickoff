import { useState } from "react";
import { isKey } from "@/lib/keys";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { FindBar } from "@/ui/FindBar";
import { lastPressedElement } from "@/features/chat/pane/chatHotkeys";
import { openEditorFind } from "@/features/editor/editorFind";

/**
 * チャットの画面の右の欄の ⌘F（タブの中の文字を探す）。ピントが右の欄の中にある（どこにもピントがなければ、最後に右の欄を押した）とき、
 * 表示しているタブで探す: メモ（CodeMirror）・ファイルの編集（Monaco）はエディタの検索の欄（見えていない行も探せる。editorFind.ts）、
 * 子チャットはその画面のチャットの検索に任せ、ほか（サブエージェント・変更・読むだけのファイル）は欄の右上に検索の欄（FindBar）を出して、画面の文字に印を付ける。
 * エディタの中にピントがあれば、そのエディタが自分で受け取る
 */
export function AgentPanelFind({ panelKey }: { panelKey: string }) {
  // 検索の欄を出している欄と、探しているタブの中身（閉じていれば null）・⌘F を押した回
  const [found, setFound] = useState<{ panel: HTMLElement; target: HTMLElement } | null>(null);
  const [signal, setSignal] = useState(0);

  useWindowEvent(
    "keydown",
    (e) => {
      if (!(isKey(e, "f", { meta: true }) || isKey(e, "f", { ctrl: true }))) return;
      const active = document.activeElement;
      const idle = !active || active === document.body;
      const panel = [...document.querySelectorAll<HTMLElement>(`[data-panel-key="${panelKey}"]`)].find(
        (p) => p.offsetParent && (p.contains(active) || (idle && p.contains(lastPressedElement()))),
      );
      if (!panel) return;
      const focusedHere = panel.contains(active);
      // エディタ（メモの CodeMirror・ファイルの Monaco）の中なら、その検索に任せる
      if (active?.closest(".cm-editor, .monaco-editor")) return;
      const from = (focusedHere ? active : lastPressedElement())?.closest<HTMLElement>(".panel-tab-page");
      const page = from && !from.hidden ? from : panel.querySelector<HTMLElement>(".panel-tab-page:not([hidden])");
      if (!page) return;
      // 子チャットは、その画面のチャットの検索に任せる
      if (page.querySelector(".chat-find")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // メモ・ファイルの編集は、エディタの検索の欄を開く
      if (openEditorFind(page)) {
        setFound(null);
        return;
      }
      setFound({ panel, target: page });
      setSignal((n) => n + 1);
    },
    true,
    true,
  );

  if (!found) return null;
  return <FindBar target={found.target} host={found.panel} focusSignal={signal} placeholder="このタブを検索" onClose={() => setFound(null)} />;
}
