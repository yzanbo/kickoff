# ノートの画面（`features/notes/ui`）

ノートのタブ・右サイドバー・全ノートの画面・入力欄の上の「ノート」の決まり。機能全体は `../CLAUDE.md`。

## 地図

| ファイル | 中身 |
|---|---|
| `tree/NoteTab.tsx`・`useNoteTab.ts` | ノートのタブ（右サイドバーも）。右のタブの欄 `notes`・`?note=`・最後に表示したノート |
| `allNotes/` | 全ノートの画面（Route `allNotes`）。並び `allNotesModel.ts`・離れる前 `allNotesLeave.ts` |
| `tree/NoteSplit.tsx` | 一覧と開いたノートの枠（上の 2 つで共通） |
| `tree/NoteSection.tsx`・`useNoteSection.ts` | 欄 1 つ（1 プロジェクトの木・見出し `NoteSectionTools`・メニュー） |
| `tree/noteDrag.ts`・`noteMoveModel.ts`・`noteTransfer.ts` | ドラッグ・落とせる所・欄の間で動かす |
| `links/NoteChipSection.tsx` | 入力欄の上の「ノート」 |
| `commonNotes.ts` | 共通のノートの id・使えない理由・持ち主の名前・代わりのプロジェクト |
| `openNote.ts` | ノートを開く口（開く先 `noteShowPlace` もここ 1 つ） |
| `tree/NoteTrashDialog.tsx`・`settings/CommonNotesTrash.tsx` | 共通のノートのゴミ箱（中身は trash の部品） |

## 決まり

- 欄は `NoteSection` に欄のプロジェクトと開く関数・探す文・選んでいる欄・「〜へ移す」の行き先を渡すだけで描く（どの画面かを持たない）。ノートのタブは上に共通のノート、下にいまのプロジェクト。全ノートの画面は上に共通のノート、下に `useVisibleProjects().active` の並び。
- 全ノートの画面の開閉は place `"allNotes"`（プロジェクトの欄は初め閉じる）。閉じた欄は一覧を読まない（`useNoteList(id, fold.open)`）。右のタブの欄は `ALL_NOTES_PANEL_KEY` 1 つ。
- 共通のノートは見えないプロジェクトのノート。タブ・別ウィンドウ・書きかけはその id で動く。画面を移る所は `screenProjectFor`。
- チャットからでなく開く先は `noteShowPlace`: 全ノートの画面ならその中、共通のノートはプロジェクトを見ていればそのノートのタブ、見ていなければ全ノートの画面。⌘K もこの口。
- 共通のノートの id は `useCommonNotes`（`settings`・`project` の知らせで読み直す）。使えなければ理由の文だけ、分かるまでは欄を出さない。名前は `noteOwnerName`。
- 選んでいる行は欄ごと。押した欄が選んでいる欄になり、ほかの欄は外す。
- 欄の間はドラッグと「〜へ移す」で、1 つずつ `to_project_id` 付きで動かす。前に書きかけを聞き、断られたら止める。動かしたら `followMovedNote` が付け替える。行き先が 3 つ以上なら子のメニューにまとめる。

## 落とし穴

- 右のタブの欄の「入れ替える」確かめは、入れ替えられるタブのプロジェクトで聞く。
- 最後に表示したノート（`selected`）はそのプロジェクトのノートだけを覚える。
- 欄の「…」のゴミ箱は共通のノートだけ（`showTrash`）。
- テスト: `tree/noteMoveModel.test.ts`・`notePanel.test.ts`・`openNote.test.ts`・`allNotes/allNotesModel.test.ts`。
