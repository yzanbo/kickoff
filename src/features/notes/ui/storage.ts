// notes の画面の保存（キーは kickoff:notes:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, family, flag, json, list, number, text } from "@/foundation/ui/storage";
import { parseNoteDraft } from "./noteDraft";

export const storage = defineSettings("notes", {
  /** プロジェクトごとの、ノートのタブで開いているノート（ノートのフォルダからの相対パス。空なら選んでいない） */
  selected: family(text(), { ids: true }),
  /** プロジェクトごとの、ノートのタブの木で開いているフォルダ */
  openFolders: family(list(), { ids: true }),
  /** ノートの表示（preview = Markdown 表示（Obsidian のライブプレビューと同じ。カーソルの行だけ記号を見せる）/ edit = そのまま表示（記号もそのまま）。どちらも書ける） */
  view: choice(["edit", "preview"], "preview"),
  /** まだ保存していないノート（キーは「プロジェクト:ノートのパス」。値は書いたものと、書き始めたときのノートの指紋。保存する・捨てると消す。アプリを閉じても残す） */
  draft: family(json(parseNoteDraft, null, (v) => v === null), { ids: true }),
  /** ノートのタブの左の一覧（ノートのフォルダの木）を隠しているか（どのプロジェクトでも同じ） */
  listHidden: flag(false),
  /** ノートのチャットの欄（本文の右）を開いているか（どのノートでも同じ。チャットそのものは DB の chats.note_path） */
  chatOpen: flag(false),
  /** ノートのチャットの欄を閉じている間、ノートの下の入力欄（NoteQuickChat）も隠すか（どのノートでも同じ。見出しの吹き出しの ▾・入力欄の「隠す」で切り替える） */
  quickChatHidden: flag(false),
  /** ノートのチャットの欄の幅（本文の右に並べたとき。境目のつまみで変える） */
  chatWidth: number(380),
  /** ノートのチャットの欄の置き場所（right = 本文の右 / bottom = 本文の下。欄の見出しで切り替える。right でも狭ければ下に並べる） */
  chatPlace: choice(["right", "bottom"], "right"),
  /** ノートのチャットの欄の高さ（本文の下に置いたとき。本文と欄を合わせた高さに対する %。境目のつまみで変える） */
  chatHeight: number(45),
});
