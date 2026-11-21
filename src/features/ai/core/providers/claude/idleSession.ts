// メッセージを送らないセッション（制御の API だけを呼ぶ。モデルへのリクエストは発生しないので、使用枠を消費しない）
import type { Options, Query, SDKUserMessage } from "./wire";
import type { ClaudeSdk } from "./sdk";
import { agentEnv } from "./env";

/** セッションを開くのに要るもの（SDK の query の口と Claude Code の実行ファイル） */
export interface IdleSessionDeps {
  query: ClaudeSdk["query"];
  executable: string | undefined;
}

/** セッションを一瞬開いて fn を呼び、終わったら閉じる（使用枠・モデル・/ のコマンド・ファイルを戻す） */
export async function withIdleSession<T>(
  deps: IdleSessionDeps,
  fn: (q: Query) => Promise<T>,
  extra: Pick<Options, "cwd" | "settingSources" | "resume" | "enableFileCheckpointing"> = {},
): Promise<T> {
  let release!: () => void;
  const idle = new Promise<void>((resolve) => (release = resolve));
  async function* noMessages(): AsyncGenerator<SDKUserMessage> {
    await idle;
  }
  const q = deps.query({
    prompt: noMessages(),
    options: { env: agentEnv(), settingSources: [], pathToClaudeCodeExecutable: deps.executable, ...extra },
  });
  try {
    return await fn(q);
  } finally {
    release();
    q.close();
  }
}
