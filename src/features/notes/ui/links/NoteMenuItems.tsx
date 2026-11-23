import { ChevronRight, FilePlus, NotebookPen, Sparkles, WandSparkles, type LucideIcon } from "lucide-react";
import { baseName } from "@shared/foundation/path";
import { useMemo } from "react";
import type { NoteKind } from "@shared/notes/kinds";
import { useNoteList } from "@/features/notes/ui/store";
import { MenuFlyout, useSubmenu } from "@/foundation/ui/kit/MenuFlyout";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { addToNote, NOTE_ADD_MODE_LABELS, type NoteAddMode } from "./addToNote";
import { parentOf, recentNotes } from "@/features/notes/ui/notePaths";

/** 「既存のノートに追記 ▸」「既存のノートに AI で組み込んで書き直す ▸」・入力欄の上のノートの一覧に並べる数（最近変えた順） */
const RECENT_NOTES = 12;

/** 入れ方ごとのアイコン */
const NOTE_ADD_MODE_ICONS: Record<NoteAddMode, LucideIcon> = { new: FilePlus, summarize: Sparkles, append: NotebookPen, merge: WandSparkles };

/** 入れ方ごとの説明（項目に乗せたとき） */
const MODE_TITLES: Record<NoteAddMode, string> = {
  new: "この文をそのまま、新しいノート「<チャット名> チャットノート<番号>」にします",
  summarize: "AI で要約した文で、新しいノートを作ります",
  append: "選んだノートの最後に、区切り線を挟んでこの文を足します",
  merge: "選んだノートにこの文を AI が組み込み、重なりを整理しながらノート全体を書き直します（すぐ書き換えます）",
};

/** 既存のノートを選ぶ一覧の見出し */
const PICK_NOTE_LABELS: Record<"append" | "merge", string> = { append: "追記するノート", merge: "組み込むノート" };

/**
 * 発言の右クリックのメニューのノートの項目（区切り線のあとに NoteModeItems）。
 * text は選んでいる部分（なければ発言の全体）
 */
export function NoteMenuItems({ projectId, chatId, text }: { projectId: number; chatId: number; text: string }) {
  return (
    <>
      <div className="menu-separator" role="separator" />
      <NoteModeItems projectId={projectId} onAdd={(mode, target) => void addToNote({ projectId, chatId, text, mode, target })} />
    </>
  );
}

/**
 * ノートへの入れ方の 4 項目。新しく作るのか・既存のノートに足すのかを見出しで分ける:
 * 「新しいノート」= そのままノートにする・AI で要約してノートにする / 「既存のノート」= 追記する ▸・AI で組み込んで書き直す ▸（AI がこの文をノートに組み込み、ノート全体を書き直す）。
 * ▸ は最近変えた Markdown のノートの一覧（RecentNoteItems）。選んだら onAdd（新しく作るときの target は null）。
 * 発言の右クリック（NoteMenuItems）と、文を選んだときの「ノート ▾」（SelectionNoteButton）で共通
 */
export function NoteModeItems({ projectId, onAdd }: { projectId: number; onAdd: (mode: NoteAddMode, target: string | null) => void }) {
  const append = useSubmenu();
  const merge = useSubmenu();
  const newItem = (mode: "new" | "summarize") => {
    const Icon = NOTE_ADD_MODE_ICONS[mode];
    return (
      <MenuItem title={MODE_TITLES[mode]} onSelect={() => onAdd(mode, null)}>
        <Icon size={14} /> {NOTE_ADD_MODE_LABELS[mode]}
      </MenuItem>
    );
  };
  const pickItem = (submenu: ReturnType<typeof useSubmenu>, mode: "append" | "merge") => {
    const Icon = NOTE_ADD_MODE_ICONS[mode];
    return (
      <>
        <button {...submenu.trigger} title={MODE_TITLES[mode]}>
          <Icon size={14} /> {NOTE_ADD_MODE_LABELS[mode]}
          <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
        </button>
        {submenu.anchor && (
          <MenuFlyout anchor={submenu.anchor} label={PICK_NOTE_LABELS[mode]} onBack={submenu.back}>
            <RecentNoteItems projectId={projectId} kind="markdown" onPick={(path) => onAdd(mode, path)} />
          </MenuFlyout>
        )}
      </>
    );
  };
  return (
    <>
      <div className="menu-label">新しいノート</div>
      {newItem("new")}
      {newItem("summarize")}
      <div className="menu-label">既存のノート</div>
      {pickItem(append, "append")}
      {pickItem(merge, "merge")}
    </>
  );
}

/**
 * 最近変えたノートの一覧の項目（出したときに一覧を読む）。kind を渡せばその種類だけ
 * （足す・組み込む先は Markdown だけ。右の欄の「開く ▾」の「ノート ▸」はどちらも）
 */
export function RecentNoteItems({ projectId, kind, onPick }: { projectId: number; kind?: NoteKind; onPick: (path: string) => void }) {
  const list = useNoteList(projectId, true);
  const recent = useMemo(() => recentNotes(list.data?.entries ?? [], RECENT_NOTES, kind), [list.data, kind]);
  if (!list.data) return <p className="muted small note-menu-note">{list.error ?? "読み込み中…"}</p>;
  if (recent.length === 0) return <p className="muted small note-menu-note">まだノートはありません</p>;
  return recent.map((e) => (
    <MenuItem key={e.path} title={e.path} onSelect={() => onPick(e.path)}>
      <span className="note-menu-title">{baseName(e.path)}</span>
      {parentOf(e.path) && <span className="note-menu-folder">{parentOf(e.path)}</span>}
    </MenuItem>
  ));
}
