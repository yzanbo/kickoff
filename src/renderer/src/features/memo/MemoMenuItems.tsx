import { ChevronRight, FilePlus, NotebookPen, Sparkles, WandSparkles, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import type { MemoKind } from "@shared/memo/kinds";
import { useMemoList } from "@/stores/memos";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem } from "@/ui/PopupMenu";
import { addToMemo, MEMO_ADD_MODE_LABELS, type MemoAddMode } from "./addToMemo";
import { baseName, parentOf, recentMemos } from "./memoPaths";

/** 「既存のメモに追記 ▸」「既存のメモに AI で組み込んで書き直す ▸」・入力欄の上のメモの一覧に並べる数（最近変えた順） */
export const RECENT_MEMOS = 12;

/** 入れ方ごとのアイコン */
const MEMO_ADD_MODE_ICONS: Record<MemoAddMode, LucideIcon> = { new: FilePlus, summarize: Sparkles, append: NotebookPen, merge: WandSparkles };

/** 入れ方ごとの説明（項目に乗せたとき） */
const MODE_TITLES: Record<MemoAddMode, string> = {
  new: "この文をそのまま、新しいメモ「<チャット名> チャットメモ<番号>」にします",
  summarize: "AI で要約した文で、新しいメモを作ります",
  append: "選んだメモの最後に、区切り線を挟んでこの文を足します",
  merge: "選んだメモにこの文を AI が組み込み、重なりを整理しながらメモ全体を書き直します（すぐ書き換えます）",
};

/** 既存のメモを選ぶ一覧の見出し */
const PICK_MEMO_LABELS: Record<"append" | "merge", string> = { append: "追記するメモ", merge: "組み込むメモ" };

/**
 * 発言の右クリックのメニューのメモの項目（区切り線のあとに MemoModeItems）。
 * text は選んでいる部分（なければ発言の全体）
 */
export function MemoMenuItems({ projectId, chatId, text }: { projectId: number; chatId: number; text: string }) {
  return (
    <>
      <div className="menu-separator" role="separator" />
      <MemoModeItems projectId={projectId} onAdd={(mode, target) => void addToMemo({ projectId, chatId, text, mode, target })} />
    </>
  );
}

/**
 * メモへの入れ方の 4 項目。新しく作るのか・既存のメモに足すのかを見出しで分ける:
 * 「新しいメモ」= そのままメモにする・AI で要約してメモにする / 「既存のメモ」= 追記する ▸・AI で組み込んで書き直す ▸（AI がこの文をメモに組み込み、メモ全体を書き直す）。
 * ▸ は最近変えた Markdown のメモの一覧（RecentMemoItems）。選んだら onAdd（新しく作るときの target は null）。
 * 発言の右クリック（MemoMenuItems）と、文を選んだときの「メモ ▾」（SelectionMemoButton）で共通
 */
export function MemoModeItems({ projectId, onAdd }: { projectId: number; onAdd: (mode: MemoAddMode, target: string | null) => void }) {
  const append = useSubmenu();
  const merge = useSubmenu();
  const newItem = (mode: "new" | "summarize") => {
    const Icon = MEMO_ADD_MODE_ICONS[mode];
    return (
      <MenuItem title={MODE_TITLES[mode]} onSelect={() => onAdd(mode, null)}>
        <Icon size={14} /> {MEMO_ADD_MODE_LABELS[mode]}
      </MenuItem>
    );
  };
  const pickItem = (submenu: ReturnType<typeof useSubmenu>, mode: "append" | "merge") => {
    const Icon = MEMO_ADD_MODE_ICONS[mode];
    return (
      <>
        <button {...submenu.trigger} title={MODE_TITLES[mode]}>
          <Icon size={14} /> {MEMO_ADD_MODE_LABELS[mode]}
          <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
        </button>
        {submenu.anchor && (
          <MenuFlyout anchor={submenu.anchor} label={PICK_MEMO_LABELS[mode]} onBack={submenu.back}>
            <RecentMemoItems projectId={projectId} kind="markdown" onPick={(path) => onAdd(mode, path)} />
          </MenuFlyout>
        )}
      </>
    );
  };
  return (
    <>
      <div className="menu-label">新しいメモ</div>
      {newItem("new")}
      {newItem("summarize")}
      <div className="menu-label">既存のメモ</div>
      {pickItem(append, "append")}
      {pickItem(merge, "merge")}
    </>
  );
}

/**
 * 最近変えたメモの一覧の項目（出したときに一覧を読む）。kind を渡せばその種類だけ
 * （足す・組み込む先は Markdown だけ。右の欄の「開く ▾」の「メモ ▸」はどちらも）
 */
export function RecentMemoItems({ projectId, kind, onPick }: { projectId: number; kind?: MemoKind; onPick: (path: string) => void }) {
  const list = useMemoList(projectId, true);
  const recent = useMemo(() => recentMemos(list.data?.entries ?? [], RECENT_MEMOS, kind), [list.data, kind]);
  if (!list.data) return <p className="muted small memo-menu-note">{list.error ?? "読み込み中…"}</p>;
  if (recent.length === 0) return <p className="muted small memo-menu-note">まだメモはありません</p>;
  return recent.map((e) => (
    <MenuItem key={e.path} title={e.path} onSelect={() => onPick(e.path)}>
      <span className="memo-menu-title">{baseName(e.path)}</span>
      {parentOf(e.path) && <span className="memo-menu-folder">{parentOf(e.path)}</span>}
    </MenuItem>
  ));
}
