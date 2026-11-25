// チャットの中のファイルを押したときに開く場所（右の欄・別ウィンドウ・ファイルタブ）を決める

/** 開く場所（side: チャットの画面の右の欄 / window: そのファイルだけの別ウィンドウ / tab: 真ん中のファイルのタブ） */
export type FileLinkPlace = "side" | "window" | "tab";

/**
 * 右の欄を置ければ右の欄。置けなければ、共通のチャットは別ウィンドウ（共通の画面にはファイルのタブがない）、
 * プロジェクトのチャットはファイルのタブ
 */
export function fileLinkPlaceOf({ side, common }: { side: boolean; common: boolean }): FileLinkPlace {
  if (side) return "side";
  return common ? "window" : "tab";
}
