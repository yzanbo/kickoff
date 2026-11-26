// チャットの中のファイルを押したときに開く場所（右の欄・別ウィンドウ・ファイルタブ）を決める

/** 開く場所（side: チャットの画面の右の欄 / window: そのファイルだけの別ウィンドウ / tab: 真ん中のファイルのタブ） */
export type FileLinkPlace = "side" | "window" | "tab";

/** 開く場所を決める材料（side: 右の欄を置けるか / fileTab: そのプロジェクトにファイルのタブがあるか = リンクの openInEditor が null でない。共通にはない） */
interface FileLinkCan {
  side: boolean;
  fileTab: boolean;
}

/** 右の欄を置ければ右の欄。置けなければ、ファイルのタブがあればファイルのタブ、なければ（共通のチャット）別ウィンドウ */
export function fileLinkPlaceOf({ side, fileTab }: FileLinkCan): FileLinkPlace {
  if (side) return "side";
  return fileTab ? "tab" : "window";
}

/**
 * 右クリックのメニューに出す開き方の項目（並びのとおり）。押したときの開き方を出し、ファイルのタブがあればファイルタブも足す
 * （共通のチャットはファイルタブがないので、右の欄を置けなければ「別ウィンドウで開く」だけ）
 */
export function fileMenuPlaces({ side, fileTab }: FileLinkCan): FileLinkPlace[] {
  const click = fileLinkPlaceOf({ side, fileTab });
  if (!fileTab) return [click];
  return click === "side" ? ["side", "tab"] : ["tab"];
}
