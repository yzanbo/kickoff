import os from "node:os";
import type { ProviderCliStatus } from "@shared/ai/types";
import type { ProviderId } from "@shared/settings/types";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";
import { findExecutable } from "@/foundation/core/system/exec";
import { spawnStdio, type StdioSpawn } from "@/features/ai/core/providers/stdioRpc";
import type { ProviderAuth } from "@/features/ai/core/providers/keys";
import type { AgentProvider, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
import { acpEnv } from "./config";
import type { ContentBlock, RequestPermissionRequest, SessionNotification, SessionResponse } from "./protocol";
import { openAgent, runAcpTurn, type AcpAgentSpec } from "./turn";
import { cliVersion } from "@/features/ai/core/providers/shared/process";
import { ASK_TIMEOUT_MS, withTimeout } from "@/features/ai/core/providers/shared/turnLifecycle";


export interface AcpProviderOpts {
  self?: SelfInfo;
  /** エージェントの起動（テストは偽物。省けば PATH の CLI） */
  spawn?: StdioSpawn;
  /** エージェントに渡す環境変数の元（省けば process.env） */
  env?: Record<string, string | undefined>;
  /** 1 回だけ聞くとき（名前・要約など。実行の外）のログインの仕方（設定の API キー。省けばサブスク） */
  authFor?: () => Promise<ProviderAuth>;
}

/** CLI ごとに決めるもの（ACP の決まりのほか） */
export interface AcpProviderSpec extends AcpAgentSpec {
  /** CLI のコマンド名 */
  command: string;
  /** 入っていないときの案内 */
  installHint: string;
  /** 状態の説明（入っているとき） */
  statusDetail: string;
}

/**
 * ACP（Agent Client Protocol）のエージェントを動かす共通のプロバイダー。
 * Cursor（`agent acp`）と Gemini（Antigravity CLI の `agy acp`）が、CLI ごとの違い（AcpProviderSpec）だけを決めて使う。
 * 会話 = ACP のセッション（Kickoff のセッション ID = ACP の sessionId）。分岐・モデルの一覧・使用枠は ACP に口がないので持たない。
 * 本物のアカウントで確かめるまで、画面では「対応予定」のまま（createProviders が開発用の環境変数のときだけこれを使う）
 */
export class AcpProvider implements AgentProvider {
  readonly implemented = true;
  readonly id: ProviderId;
  readonly label: string;
  private readonly executable: string | null;
  private readonly spawn: StdioSpawn | null;
  private readonly baseEnv: Record<string, string | undefined>;

  constructor(
    private readonly spec: AcpProviderSpec,
    private readonly opts: AcpProviderOpts = {},
  ) {
    this.id = spec.id;
    this.label = spec.label;
    this.executable = opts.spawn ? spec.command : findExecutable([spec.command]);
    this.spawn = opts.spawn ?? (this.executable ? spawnStdio(this.executable) : null);
    this.baseEnv = opts.env ?? process.env;
  }

  async status(): Promise<ProviderCliStatus> {
    const base = { id: this.id, label: this.label, implemented: true };
    if (!this.executable) return { ...base, installed: false, logged_in: false, detail: this.spec.installHint };
    const version = this.opts.spawn ? null : await cliVersion(this.executable);
    return { ...base, installed: true, logged_in: true, detail: `${this.spec.statusDetail}${version ? ` · ${version}` : ""}` };
  }

  run(params: ProviderTurnParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
    if (!this.spawn) return Promise.resolve({ status: "failed", sessionId: params.resumeSessionId, error: this.spec.installHint });
    return runAcpTurn({ spawn: this.spawn, spec: this.spec, baseEnv: this.baseEnv, self: this.opts.self }, params, callbacks, signal);
  }

  /**
   * ツールを使わずに 1 回だけ聞く: 一時フォルダで（作業場所の決まりのファイルを読ませない）新しいセッションを作り、権限の頼みはすべて断って、返答の文を返す。
   * ACP にはモデルの段（light / standard）を選ぶ口がないので、エージェントの既定のモデルで聞く。終わったらセッションを消す（消す口がなければ閉じる。CLI の履歴に残りうる）
   */
  async ask(prompt: string): Promise<string> {
    if (!this.spawn) throw new Error(this.spec.installHint);
    const auth: Pick<ProviderTurnParams, "auth"> = this.opts.authFor ? { auth: await this.opts.authFor() } : {};
    const problem = this.spec.authProblem?.(auth);
    if (problem) throw new Error(problem);
    const cwd = os.tmpdir();
    let text = "";
    let sessionId: string | null = null;
    const { rpc, init } = await openAgent(
      { spawn: this.spawn, spec: this.spec },
      {
        env: acpEnv(this.baseEnv, auth, this.spec.keys),
        cwd,
        params: auth,
        onNotification: (method, raw) => {
          const p = raw as SessionNotification;
          if (method === "session/update" && p.sessionId === sessionId && p.update.sessionUpdate === "agent_message_chunk") {
            const c = (p.update as { content: ContentBlock }).content;
            if (c.type === "text" && typeof c.text === "string") text += c.text;
          }
        },
        onServerRequest: async (method, raw) => {
          if (method !== "session/request_permission") throw new Error(`Kickoff は ${method} に答えません`);
          const reject = (raw as RequestPermissionRequest).options.find((o) => o.kind.startsWith("reject"));
          return reject ? { outcome: { outcome: "selected", optionId: reject.optionId } } : { outcome: { outcome: "cancelled" } };
        },
      },
    );
    try {
      const session = await rpc.request<SessionResponse>("session/new", { cwd, mcpServers: [] });
      sessionId = session.sessionId ?? null;
      if (!sessionId) throw new Error(`${this.label} がセッションの ID を返しませんでした`);
      await withTimeout(rpc.request("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] }), ASK_TIMEOUT_MS, `${this.label} が時間内に答えませんでした`);
      const caps = init.agentCapabilities?.sessionCapabilities;
      if (caps?.delete) await rpc.request("session/delete", { sessionId }).catch(() => {});
      else if (caps?.close) await rpc.request("session/close", { sessionId }).catch(() => {});
      return text.trim();
    } finally {
      rpc.close();
    }
  }
}
