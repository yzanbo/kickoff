import { ChevronRight, NotebookPen, Sparkles, StickyNote } from "lucide-react";
import { useMemo } from "react";
import { useMemoList } from "@/stores/memos";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem } from "@/ui/PopupMenu";
import { addToMemo } from "./addToMemo";
import { memoTitle, parentOf, recentMemos } from "./memoPaths";

/** 「既存のメモに追記」・入力欄の上のメモの一覧に並べる数（最近変えた順） */
export const RECENT_MEMOS = 12;

/**
 * 発言の右クリックのメニューの「メモに追加」の項目（新しいメモ・AI で要約して新しいメモ・既存のメモに追記 ▸）。
 * text は選んでいる文（なければ発言の全体）。追記の一覧は、最近変えたメモから
 */
export function MemoMenuItems({ projectId, chatId, text }: { projectId: number; chatId: number; text: string }) {
  const append = useSubmenu();
  // 一覧は追記の子のメニューを開いたときだけ読む
  const list = useMemoList(projectId, append.anchor !== null);
  const recent = useMemo(() => recentMemos(list.data?.entries ?? [], RECENT_MEMOS), [list.data]);
  const add = (summarize: boolean, appendTo: string | null = null) => void addToMemo({ projectId, chatId, text, summarize, appendTo });
  return (
    <>
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={() => add(false)}>
        <StickyNote size={14} /> メモに追加
      </MenuItem>
      <MenuItem onSelect={() => add(true)}>
        <Sparkles size={14} /> AI で要約してメモに追加
      </MenuItem>
      <button {...append.trigger}>
        <NotebookPen size={14} /> 既存のメモに追記
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {append.anchor && (
        <MenuFlyout anchor={append.anchor} label="追記するメモ" onBack={append.back}>
          {!list.data ? (
            <p className="muted small memo-menu-note">{list.error ?? "読み込み中…"}</p>
          ) : recent.length === 0 ? (
            <p className="muted small memo-menu-note">まだメモはありません</p>
          ) : (
            recent.map((e) => (
              <MenuItem key={e.path} title={e.path} onSelect={() => add(false, e.path)}>
                <span className="memo-menu-title">{memoTitle(e.path)}</span>
                {parentOf(e.path) && <span className="memo-menu-folder">{parentOf(e.path)}</span>}
              </MenuItem>
            ))
          )}
        </MenuFlyout>
      )}
    </>
  );
}
