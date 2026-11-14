// AI に内蔵ターミナルの出力を読ませる口（中身はコアの TerminalSessions = sessions.ts）。読むだけで、コマンドの起動・停止・キーの入力は口に入れない
import type { TerminalTab } from "@shared/types";

/** AI から見えるターミナルのタブ（key はタブのキー = 裏のシェルのキー。API の形と同じ） */
export type TerminalTabInfo = TerminalTab;

/** ターミナルの最後の行（折り返しをつないだ 1 行ずつ。色などの印は入らない） */
export interface TerminalTail {
  lines: string[];
  /** 裏の端末に残っている行の数（読んだ分より前もあるか） */
  total: number;
}

/** 内蔵ターミナルの読み取り */
export interface TerminalControl {
  /** いま動いているシェルのタブ */
  list(): TerminalTabInfo[];
  /** そのタブの最後の lines 行（タブがなければ null） */
  tail(key: string, lines: number): Promise<TerminalTail | null>;
}
