// 守りの決まりの形: 判定（どの守りも、どの AI への当て方も、この 1 つを返す）・守りが見る呼び出し・決まりの並び

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

/** 当てる順は全体で 1 つ。断る守りを先に全部、聞く守り（docker・writeScope）はそのあと（judge.ts の judgeCall） */
export const GUARD_ORDER = ["self", "reference", "untracked", "hiddenDb", "delete", "gitHook", "compileCache", "docker", "writeScope"] as const;
export type GuardName = (typeof GUARD_ORDER)[number];

/** 守りの決まり 1 つ（実行ごとに材料から作る） */
export interface GuardRule {
  name: GuardName;
  /** 断るだけ（deny / pass）か、聞くことがある（ask もある）か。聞く守りは、断る守りがどれも言わなかったときだけ見る */
  kind: "deny" | "ask";
  /** 見る呼び出し（Bash だけ・ファイルのツールだけ など） */
  sees(call: GuardCall): boolean;
  check(call: GuardCall): GuardVerdict | Promise<GuardVerdict>;
}
