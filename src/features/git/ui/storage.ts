// git の画面の保存（キーは kickoff:git:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { defineSettings, family, flag, number, record } from "@/foundation/ui/storage";

export const storage = defineSettings("git", {
  /** 変更の一覧を木で出すか */
  changesTree: flag(true),
  /** コミットの詳細の変わったファイルを一覧で出すか（初めは木） */
  commitFilesTree: flag(),
  commitFilesWidth: number(260),
  /** 履歴の上のコミットの表の高さ（割合 %） */
  historySplit: number(43),
  /** 履歴タブの左の一覧（ブランチ・リモート・タグ・退避）を閉じているか（上の帯のいちばん左のボタンで開閉） */
  historyListHidden: flag(),
  /** チャットの画面の右の欄の「変更」で確認済みにしたファイル（キーは「プロジェクト:ワークツリーのフォルダ（本体は空）」。値はパス → 確認したときの差分の指紋） */
  sideViewed: family(record((v): v is string => typeof v === "string"), { ids: true }),
});
