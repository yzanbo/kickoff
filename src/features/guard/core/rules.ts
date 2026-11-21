// 守りの判定の形（どの守りも、どの AI への当て方も、この 1 つを返す）

/**
 * deny = 断る（理由を AI に伝える）/ ask = 承認カードで聞く（断られたら deniedReason を AI に伝える）/ pass = 守りは何も言わない（権限モードに任せる）。
 * rememberTarget: 「このチャットでは許可」で覚える書く先（書き込み先の守りのときだけ）
 */
export type GuardVerdict =
  | { kind: "pass" }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; title: string; description: string; deniedReason: string; rememberTarget?: string };

/** 守りが見る呼び出し（Claude Code のツールの名前と入力の形。cwd はチャットの作業フォルダ） */
export interface GuardCall {
  name: string;
  input: Record<string, unknown>;
  cwd: string;
}

/** 断るだけの守りの判定（聞くことはない） */
export type DenyVerdict = Exclude<GuardVerdict, { kind: "ask" }>;
