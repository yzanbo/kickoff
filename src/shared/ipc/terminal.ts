// 内蔵ターミナル（パネルのタブ）。シェルはメインプロセスで動き、画面とは IPC だけでつなぐ

/** シェルにつないだ結果 */
export interface TerminalOpenResult {
  /**
   * いまの画面の内容（つなぎ直したとき・新しく始めたときの注意）。画面は返事が届くまでの出力を捨てる
   * （それまでの出力はここに入り、返事のあとの出力は知らせで届く）
   */
  snapshot: string;
  /** 新しく始めたか */
  created: boolean;
}

/**
 * 決まったコマンドで開くタブ（Docker のシェルなど）。command はログインシェルの -l -c で流し、終わってもシェルは開き直さない。
 * env はシェルに足す環境変数。つなぎ直し（すでにあるシェル）のときは使わない（流し直さない）
 */
export interface TerminalStart {
  command?: string;
  env?: Record<string, string>;
}

/** タブの持ち主と名前（AI がこのプロジェクトのターミナルの出力を読むときに、タブを見分けて名前で示すため。つなぐたびに知らせる） */
export interface TerminalTabMeta {
  projectId: number | null;
  title: string;
}
