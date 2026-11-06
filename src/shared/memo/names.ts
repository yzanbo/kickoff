// メモの名前の決まり（ファイル名に使えない文字の置き換え・重ならない名前・チャットから作るメモの自動の名前・既定の親フォルダの名前）。
// コアと画面で同じ結果にする。名前の空白はそのまま使う（既定の親フォルダの名前だけは空白を入れない）

/** ファイル名の長さの上限（文字。拡張子を除く） */
const MAX_NAME_CHARS = 80;

/** 名前がないときの名前 */
const UNTITLED = "無題のメモ";

/**
 * ファイル名・フォルダ名に使える形にする（/・:・\・制御文字は「-」に、改行・タブなど続く空白は 1 つの空白に、前後の空白と
 * 先頭の「.」（隠しファイルになる）は除く。長すぎれば切る。空になれば「無題のメモ」）
 */
export function safeMemoName(name: string): string {
  const cleaned = name
    // 改行・タブなどの空白は 1 つの空白に（制御文字として「-」にしない）
    .replace(/\s+/g, " ")
    .replace(/[/\\:\u0000-\u001f\u007f]/g, "-")
    .trim()
    .replace(/^\.+/, "")
    .trim();
  return [...cleaned].slice(0, MAX_NAME_CHARS).join("").trim() || UNTITLED;
}

/**
 * メモの親フォルダの既定の名前（アプリ名を小文字にし、空白は「-」に。Kickoff → kickoff、Kickoff Dev → kickoff-dev）。
 * すべてのメモのパスに入るので、ここだけは空白を入れない（コマンドで扱いやすく）
 */
export function defaultMemosFolderName(appName: string): string {
  return appName.trim().toLowerCase().replace(/\s+/g, "-");
}

/** taken と重ならない名前（base・base-2・base-3 …。大文字・小文字の違いは同じ名前とみなす（macOS のファイル名）） */
export function uniqueMemoName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const name = `${base}-${n}`;
    if (!used.has(name.toLowerCase())) return name;
  }
}

/**
 * チャットから作るメモの名前（「<チャット名> チャットメモ<n>」。n は同じフォルダにある同じチャット名のメモの番号の、いちばん大きいものの次。
 * 1 から）。names は同じフォルダのファイル名（拡張子なし）
 */
export function chatMemoName(chatTitle: string, names: Iterable<string>): string {
  const prefix = `${safeMemoName(chatTitle)} チャットメモ`;
  let max = 0;
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    const n = Number(name.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}
