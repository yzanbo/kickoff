import { ChevronDown, Copy } from "lucide-react";
import { useCallback, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { DockerCompose } from "@shared/types";
import { api } from "@/api";
import { reportFailure } from "@/ui/dialogs";
import { AddToChat } from "@/ui/icons";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import type { HandOffItem } from "@/features/chat/handoff/handOff";
import { HandOffItems } from "@/features/chat/handoff/HandOffMenu";
import { isLongSelection } from "@/features/terminal/terminalSelection";
import { aroundRow, logCaptureLabel, logQuote, rowText, type LogContainerInfo, type LogRow } from "./dockerLogView";

/** 小さなボタンの幅の目安（画面の右端からはみ出さないように寄せる） */
const BUTTON_WIDTH = 150;

/** メニューを開いた対象: 渡す行・その説明・コピーする文（なければ出さない） */
interface MenuValue {
  rows: LogRow[];
  what: string;
  label: string;
  copy: { label: string; text: string } | null;
}

/** 渡すもの（短ければ文脈の頭とコードのブロックを入力欄に、長ければ押した時点の中身の札。新しいチャットは本体で始める） */
function logHandOff(projectId: number, compose: DockerCompose, rows: LogRow[], infos: Map<string, LogContainerInfo>, what: string): HandOffItem {
  const text = logQuote(compose, rows, infos);
  if (!isLongSelection(text)) return { projectId, what, text };
  return {
    projectId,
    what: `${what}（長いので札にします）`,
    text: "",
    capture: () => api.capture({ name: "docker-logs.txt", mime: "text/plain", text, source: { type: "docker_logs", label: logCaptureLabel(rows, infos), url: null }, tail_share: 0.8 }),
  };
}

/** 文の位置（選んだ範囲の端）を含む行の番号（data-row） */
function rowIndexOf(node: Node | null): number | null {
  const el = node instanceof Element ? node : node?.parentElement;
  const row = el?.closest<HTMLElement>("[data-row]");
  return row ? Number(row.dataset.row) : null;
}

/**
 * ログの画面の選んだ範囲と右クリック: 選び終えたら範囲の終わりの下に小さな「チャットに追加 ▾」、右クリックに「コピー」と同じ渡し先。
 * 行の右クリック（選んでいないとき）は「この行をコピー」と、この行と前後 20 行の渡し先。エラーの行の「AI に聞く」も同じ渡し先（ask）
 */
export function useDockerLogMenu({
  projectId,
  compose,
  rows,
  infos,
  labelOf,
  body,
}: {
  projectId: number;
  compose: DockerCompose;
  /** 並べている行（data-row の番号の並び） */
  rows: LogRow[];
  infos: Map<string, LogContainerInfo>;
  labelOf: (row: LogRow) => string;
  body: RefObject<HTMLElement | null>;
}): { handlers: { onMouseUp: (e: MouseEvent) => void; onContextMenu: (e: MouseEvent) => void; onScroll: () => void; onKeyDown: () => void }; ask: (index: number, at: { x: number; y: number }) => void; element: ReactNode } {
  const menu = useContextMenu<MenuValue>();
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  /** 選んでいる範囲の行（ログの画面の中で選んでいなければ空） */
  const selected = (): { rows: LogRow[]; text: string } => {
    const sel = window.getSelection();
    const root = body.current;
    if (!sel || sel.isCollapsed || !root || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return { rows: [], text: "" };
    const ends = [rowIndexOf(sel.anchorNode), rowIndexOf(sel.focusNode)].filter((i): i is number => i !== null);
    if (ends.length === 0 || !sel.toString().trim()) return { rows: [], text: "" };
    return { rows: rows.slice(Math.min(...ends), Math.max(...ends) + 1), text: sel.toString() };
  };
  const selectionValue = (picked: { rows: LogRow[]; text: string }, withCopy: boolean): MenuValue => ({
    rows: picked.rows,
    what: `Docker のログで選んだ行（${picked.rows.length} 行）`,
    label: "選んだ行をチャットに追加",
    copy: withCopy ? { label: "コピー", text: picked.text } : null,
  });
  const aroundValue = (index: number, withCopy: boolean): MenuValue => {
    const row = rows[index];
    return {
      rows: aroundRow(rows, index),
      what: "Docker のログのこの行と前後 20 行",
      label: "この行と前後 20 行をチャットに追加",
      copy: withCopy && row ? { label: "この行をコピー", text: rowText(row, labelOf(row)) } : null,
    };
  };
  const hide = () => setAnchor(null);
  // 「AI に聞く」は行ごとに渡すので、いつも同じ関数にする（行の memo を崩さない）
  const latest = useRef(aroundValue);
  latest.current = aroundValue;
  const openAt = useRef(menu.openAt);
  openAt.current = menu.openAt;
  const ask = useCallback((index: number, at: { x: number; y: number }) => openAt.current(at, latest.current(index, false)), []);

  const shown = menu.menu;
  return {
    handlers: {
      // 選び終えてから測る
      onMouseUp: (e) => {
        const at = { x: Math.max(4, Math.min(e.clientX, window.innerWidth - BUTTON_WIDTH)), y: e.clientY + 14 };
        setTimeout(() => setAnchor(selected().rows.length > 0 ? at : null), 0);
      },
      onContextMenu: (e) => {
        hide();
        const picked = selected();
        if (picked.rows.length > 0) return menu.open(e, selectionValue(picked, true));
        const index = rowIndexOf(e.target as Node);
        if (index !== null && rows[index]) menu.open(e, aroundValue(index, true));
      },
      onScroll: hide,
      onKeyDown: hide,
    },
    ask,
    element: (
      <>
        {anchor && !shown && (
          <div className="selection-attach" style={{ left: anchor.x, top: anchor.y }}>
            <button
              type="button"
              className="btn selection-attach-button"
              title="選んだ行を、文脈（作業場所・compose・サービス・時刻）を付けてチャットの入力欄に足す（長いと札にします。送るのは自分で）"
              // 押しても選択を外さない
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                const picked = selected();
                if (picked.rows.length > 0) menu.openBelow(e, selectionValue(picked, false));
                hide();
              }}
            >
              <AddToChat size={13} /> チャットに追加 <ChevronDown size={12} aria-hidden />
            </button>
          </div>
        )}
        {shown && (
          <PopupMenu at={shown.at} label="ログの操作" onClose={menu.close}>
            {shown.value.copy && (
              <>
                <MenuItem onSelect={() => void navigator.clipboard.writeText(shown.value.copy?.text ?? "").catch(reportFailure("コピーできませんでした"))}>
                  <Copy size={14} /> {shown.value.copy.label}
                </MenuItem>
                <div className="menu-separator" role="separator" />
              </>
            )}
            <div className="menu-label">{shown.value.label}</div>
            <HandOffItems item={logHandOff(projectId, compose, shown.value.rows, infos, shown.value.what)} />
          </PopupMenu>
        )}
      </>
    ),
  };
}
