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

/**
 * 右クリックのメニューに出す開き方の項目（並びのとおり）。押したときの開き方を出し、プロジェクトのチャットはファイルタブも足す
 * （共通のチャットはファイルタブがないので、右の欄を置けなければ「別ウィンドウで開く」だけ）
 */
export function fileMenuPlaces({ side, common }: { side: boolean; common: boolean }): FileLinkPlace[] {
  const click = fileLinkPlaceOf({ side, common });
  if (common) return [click];
  return click === "side" ? ["side", "tab"] : ["tab"];
}
