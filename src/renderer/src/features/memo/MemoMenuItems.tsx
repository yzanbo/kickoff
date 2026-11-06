import { ChevronRight, FilePlus, NotebookPen, Sparkles, WandSparkles } from "lucide-react";
import { useMemo } from "react";
import { useMemoList } from "@/stores/memos";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem } from "@/ui/PopupMenu";
import { addToMemo, type MemoAddMode } from "./addToMemo";
import { baseName, parentOf, recentMemos } from "./memoPaths";

/** 「既存のメモに追記 ▸」「既存のメモと AI でまとめる ▸」・入力欄の上のメモの一覧に並べる数（最近変えた順） */
export const RECENT_MEMOS = 12;

/**
 * 発言の右クリックのメニューのメモの項目。新しく作るのか・既存のメモに足すのかを名前で分ける:
 * 新しいメモを作成・AI で要約して新しいメモを作成・既存のメモに追記 ▸・既存のメモと AI でまとめる ▸（AI がメモ全体を書き直す）。
 * text は選んでいる部分（なければ発言の全体）。既存のメモの一覧は、最近変えた Markdown のメモから
 */
export function MemoMenuItems({ projectId, chatId, text }: { projectId: number; chatId: number; text: string }) {
  const append = useSubmenu();
  const merge = useSubmenu();
  // 一覧は子のメニューを開いたときだけ読む（足せる・まとめられるのは Markdown のメモだけ）
  const list = useMemoList(projectId, append.anchor !== null || merge.anchor !== null);
  const recent = useMemo(() => recentMemos(list.data?.entries ?? [], RECENT_MEMOS, "markdown"), [list.data]);
  const add = (mode: MemoAddMode, target: string | null = null) => void addToMemo({ projectId, chatId, text, mode, target });
  const pickMemo = (submenu: ReturnType<typeof useSubmenu>, label: string, mode: MemoAddMode) =>
    submenu.anchor && (
      <MenuFlyout anchor={submenu.anchor} label={label} onBack={submenu.back}>
        {!list.data ? (
          <p className="muted small memo-menu-note">{list.error ?? "読み込み中…"}</p>
        ) : recent.length === 0 ? (
          <p className="muted small memo-menu-note">まだメモはありません</p>
        ) : (
          recent.map((e) => (
            <MenuItem key={e.path} title={e.path} onSelect={() => add(mode, e.path)}>
              <span className="memo-menu-title">{baseName(e.path)}</span>
              {parentOf(e.path) && <span className="memo-menu-folder">{parentOf(e.path)}</span>}
            </MenuItem>
          ))
        )}
      </MenuFlyout>
    );
  return (
    <>
      <div className="menu-separator" role="separator" />
      <MenuItem title="この文で、新しいメモ「<チャット名> チャットメモ<番号>」を作ります" onSelect={() => add("new")}>
        <FilePlus size={14} /> 新しいメモを作成
      </MenuItem>
      <MenuItem title="AI で要約した文で、新しいメモを作ります" onSelect={() => add("summarize")}>
        <Sparkles size={14} /> AI で要約して新しいメモを作成
      </MenuItem>
      <button {...append.trigger} title="選んだメモの最後に、区切り線を挟んでこの文を足します">
        <NotebookPen size={14} /> 既存のメモに追記
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {pickMemo(append, "追記するメモ", "append")}
      <button {...merge.trigger} title="選んだメモの中身とこの文を、AI が 1 つのメモにまとめ直して書き換えます">
        <WandSparkles size={14} /> 既存のメモと AI でまとめる
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {pickMemo(merge, "まとめるメモ", "merge")}
    </>
  );
}
