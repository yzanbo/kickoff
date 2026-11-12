// 埋め込みブラウザのタブの「AI に渡す」で、メインプロセスが取って画面に返すもの（見えている範囲の画面と、コンソールのエラー・警告）

/** コンソールの出力 1 つ（エラー・警告だけ。どのページで出たかも） */
export interface BrowserConsoleEntry {
  level: "error" | "warning";
  message: string;
  /** 出したスクリプトの場所（なければ null） */
  source: string | null;
  line: number;
  /** 出たときのページの URL */
  url: string;
  /** 出た時刻（ISO） */
  at: string;
}

/** 「AI に渡す」で取ったもの */
export interface BrowserHandOffCapture {
  /** 見えている範囲の画面（JPEG の base64 と大きさ。撮れなければ null と理由） */
  screen: { data: string; width: number; height: number } | null;
  screenError: string | null;
  /** 覚えているコンソールの出力のうちエラー・警告（古い順） */
  console: BrowserConsoleEntry[];
}
