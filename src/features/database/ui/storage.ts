// database の画面の保存（キーは kickoff:database:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, family, flag, list, number, text } from "@/foundation/ui/storage";

export const storage = defineSettings("database", {
  /** DB クライアントの左の木で開いている段（置き場所ごと。段のキーの列） */
  treeOpen: family(list(), { ids: true }),
  /** DB クライアントの左の木のピン留め（プロジェクトごと。どの置き場所でも同じ。dbPins.ts の pinId の列） */
  pins: family(list(), { ids: true }),
  /** SQL のタブの書きかけの SQL（キーは「置き場所:タブのキー」。タブを閉じたら消す。アプリを閉じても残す） */
  sqlDraft: family(text(), { ids: true }),
  /** DB クライアントの左の一覧の幅（どの置き場所でも同じ） */
  listWidth: number(260),
  /** SQL のタブの入力欄の高さ（タブの中の割合 %。どの SQL のタブでも同じ） */
  sqlEditorHeight: number(40),
  /** DB クライアントの左の一覧を隠しているか（どの置き場所でも同じ。狭い所ではいつも隠してパンくずにする） */
  listHidden: flag(false),
});
