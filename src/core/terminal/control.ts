// AI に内蔵ターミナルの出力を読ませる口（シェルはアプリのメインプロセスが node-pty で動かしていて、コアは Electron に依存しないので、中身はメインプロセスが渡す。
// 単体のコア（npm run daemon）にはターミナルがないので、渡されなければ AI にターミナルのツールを出さない）。読むだけで、コマンドの起動・停止・キーの入力は口に入れない

/** AI から見えるターミナルのタブ（key はタブのキー = 裏のシェルのキー） */
export interface TerminalTabInfo {
  key: string;
  /** どのプロジェクトのターミナルか（画面がタブを開いたときに知らせる。知らせていなければ null） */
  project_id: number | null;
  /** タブの名前（「ターミナル · kickoff」・Docker のシェルなら決まった名前） */
  title: string;
  /** シェルを始めたフォルダ */
  cwd: string;
  /** 決まったコマンドのタブならそのコマンド（ふつうのシェルは null） */
  command: string | null;
}

/** ターミナルの最後の行（折り返しをつないだ 1 行ずつ。色などの印は入らない） */
export interface TerminalTail {
  lines: string[];
  /** 裏の端末に残っている行の数（読んだ分より前もあるか） */
  total: number;
}

/** メインプロセスが実装する、内蔵ターミナルの読み取り */
export interface TerminalControl {
  /** いま動いているシェルのタブ */
  list(): TerminalTabInfo[];
  /** そのタブの最後の lines 行（タブがなければ null） */
  tail(key: string, lines: number): Promise<TerminalTail | null>;
}
