// 編集の部品（CodeEditor）が作る Monaco のモデルの住所
let editors = 0;

/** Monaco の住所の形（monaco.Uri.from に渡す） */
interface ModelUri {
  scheme: string;
  authority: string;
  path: string;
}

/**
 * 編集の部品 1 つが作るモデルの住所（書く中身と、差分の元の中身）。Monaco は同じ住所のモデルを 2 つ作れない
 * （作ると投げて画面ごと落ちる）ので、同じファイルを 2 か所（ファイルのタブとチャットの右の欄など）で開いても重ならないよう、部品ごとの番号を入れる。
 * 色付けの言語はパスの拡張子から決まるので、パスはそのまま残す
 */
export function editorModelUris(path: string): { modified: ModelUri; original: ModelUri } {
  const authority = String(++editors);
  return { modified: { scheme: "kickoff-file", authority, path: `/${path}` }, original: { scheme: "kickoff-original", authority, path: `/${path}` } };
}
