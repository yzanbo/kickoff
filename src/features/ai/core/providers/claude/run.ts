// Claude の 1 回の実行（SDK の query を開き、メッセージを 1 件ずつ記録係 turnTracker と部品に配る）
import { MCP_SERVERS_DELIVERY } from "./wire";
import type { ClaudeProviderOptions, ClaudeSdk } from "./sdk";
import { createBackgroundTracker } from "./background";
import { createTurnOver } from "./turnOver";
import { createCommandOutputWatcher } from "./commandOutput";
import { createInputChannel } from "./input";
import { createPreCompactGate, preCompactHook } from "./preCompact";
import { createCanUseTool } from "./approvals";
import { mcpServersOf, toolAllowList } from "./mcpServers";
import { agentSpawnNotes } from "./spawnNotes";
import { agentEnv, claudeAuthEnv } from "./env";
import { autoCompactEnv } from "./internals";
import { createMessageState, emitSdkMessage } from "./messages";
import { KICKOFF_DISALLOWED_TOOLS, turnContextHook, turnHooks, toAllowedTools } from "./policy";
import { claudeSandboxOption } from "./sandbox";
import { createTurnTracker } from "./turnTracker";
import type { ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
import { noteSyncSince, syncStart } from "@/foundation/core/system/stallWatch";

/** 実行に要るもの（SDK の query の口・Claude Code の実行ファイル・自分を壊す呼び出しを断るための Kickoff 自身） */
export interface ClaudeRunDeps {
  query: ClaudeSdk["query"];
  executable: string | undefined;
  self: ClaudeProviderOptions["self"];
}

export async function runClaudeTurn(deps: ClaudeRunDeps, params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  // 渡されたときにもう止められていたら、知らせは来ないのでここで止める
  if (signal.aborted) onAbort();

  const canUseTool = createCanUseTool(cb);
  // AI の操作ツール（埋め込みブラウザ・DB・チャット）は、コアの MCP サーバーの口を HTTP でつなぐ（中身と承認はコアが持つ）
  const tools = params.tools ?? [];
  const mcpServers = mcpServersOf(tools);
  const tracker = createTurnTracker(params.resumeSessionId);

  // 入力はストリーミング（作業中に発言を足す・裏の作業を止めるため、返答が終わり裏の作業もなくなるまで開いておく）
  const input = createInputChannel(params.prompt, params.promptId);
  // 入力を閉じる時（Claude Code が本当に手が空いたとき）。足した発言で次の返答が始まりうるので、足したことも知らせる
  const turnOver = createTurnOver(() => input.close());
  const push = (text: string, uuid?: string) => {
    const ok = input.push(text, uuid);
    if (ok) turnOver.pushed();
    return ok;
  };
  // 実行中のコマンドの出力（Claude Code が書いているファイルを読み続け、終わる前から画面に届ける）
  const commandOutput = createCommandOutputWatcher((output) => cb.commandOutput?.(output));
  // 上限に近づいて自動で圧縮する前に、圧縮前指示を足して済ませてもらう（PreCompact フックで圧縮を止める）
  const preCompact = params.preCompact
    ? createPreCompactGate({ ...params.preCompact, push, onSent: (uuid) => cb.preCompactSent?.(uuid), onNudged: (uuid) => cb.preCompactNudged?.(uuid) })
    : null;
  // Claude Code のプロセスの pid を知らせる（コアのプロセスが落ちたときに、メインが作り直す前に止める）
  const spawnNotes = agentSpawnNotes(params.onAgentSpawned);
  const sandbox = claudeSandboxOption(params.bashSandbox, params.disableSandbox);
  try {
    const q = deps.query({
      prompt: input.messages,
      options: {
        ...spawnNotes.options,
        cwd: params.cwd,
        additionalDirectories: params.additionalDirectories,
        model: params.model || undefined,
        // 決めていなければ指定しない（SDK とモデルの既定に任せる）
        effort: params.effort ?? undefined,
        systemPrompt: { type: "preset", preset: "claude_code", append: params.systemPrompt },
        // ユーザーの ~/.claude（CLAUDE.md・スキル等）とリポジトリの設定を Claude Code と同様に読み込む
        settingSources: ["user", "project", "local"],
        permissionMode: params.permissionMode,
        // AI の操作ツールのうち、聞かずに使わせるもの（埋め込みブラウザの見るだけのもの・DB とチャットのツールのすべて = 承認と断りはツールの中で行う）。
        // 埋め込みブラウザの開く・押す・打つ・JS は権限モードと承認に従う
        allowedTools: [...toAllowedTools(params.policy), ...toolAllowList(tools)],
        // Kickoff のチャットでは使わせないツール（PushNotification・EnterWorktree / ExitWorktree。理由は KICKOFF_DISALLOWED_TOOLS）
        disallowedTools: KICKOFF_DISALLOWED_TOOLS,
        // AI の操作ツールの口は、鍵の見出しを Claude Code の起動の引数に載せないよう標準入力の initialize で渡す
        // （同梱の Claude Code は SDK と同じ版なので読める。決めずにおくと SDK が廃止予定の警告を出す）
        ...(Object.keys(mcpServers).length > 0 ? { mcpServers, ...MCP_SERVERS_DELIVERY } : {}),
        canUseTool,
        resume: params.resumeSessionId ?? undefined,
        abortController,
        // 自動圧縮を始める使用率を決めていれば渡す（決めていなければ Claude Code の既定）
        // API キーで動かす設定なら、キーを渡す（agentEnv はプランで動かすため鍵の環境変数を外すので、そのあとに重ねる）
        env: { ...agentEnv(), ...autoCompactEnv(params.autoCompactPct), ...params.env, ...claudeAuthEnv(params.auth) },
        pathToClaudeCodeExecutable: deps.executable,
        hooks: {
          ...turnHooks(params, deps.self, cb),
          ...(preCompact ? { PreCompact: [preCompactHook(preCompact)] } : {}),
          // このチャットの文脈（子チャットの親など）は、実行の初めの指示に添える
          ...(params.turnContext ? { UserPromptSubmit: [turnContextHook(params.turnContext)] } : {}),
        },
        includePartialMessages: true,
        // 編集の前のファイルを取っておく（巻き戻しで、自分の発言の時点のファイルに戻せるように）
        enableFileCheckpointing: true,
        ...(params.fastMode ? { settings: { fastMode: true } } : {}),
        // Bash を砂場に入れ、書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにする（止めるのは OS）
        ...(sandbox ? { sandbox } : {}),
      },
    });

    // 作業中の発言の足し方と、裏の作業の止め方を Runner に渡す
    cb.control?.({ tell: push, stopTask: (taskId) => q.stopTask(taskId) });
    // 思考の時間を測る（流れてくる途中経過で始まりと終わりを見る）
    const messageState = createMessageState();
    // 裏で動いている作業と、メインの返答が終わったか（変わったときだけ知らせる）
    const trackBackground = createBackgroundTracker();
    for await (const msg of q) {
      // 1 件の処理に名前を付けて詰まりの見張りに知らせる（system/stallWatch.ts）
      const handleStart = syncStart();
      const notes = tracker.note(msg);
      if (notes.retry !== undefined) cb.retry?.(notes.retry);
      if (notes.overage !== undefined) cb.spending?.({ in_use: notes.overage });
      commandOutput.handle(msg);
      emitSdkMessage(msg, cb, messageState);
      const background = trackBackground(msg);
      if (background) cb.background?.(background);
      // Claude Code の手が空き、裏の作業もなくなった: 入力を閉じて終わらせる（足した発言がまだ渡っていなければ閉じない。turnOver.ts）
      turnOver.note(msg, background);
      // 圧縮前指示の合図のあと、裏の作業の終わりだけを待って止まっていたら、背中を押して圧縮を走らせる（preCompact.ts）
      preCompact?.noteWaiting(turnOver.waitingOnBackground());
      if (notes.reply) preCompact?.noteReply(notes.reply.tokens, notes.reply.text);
      if (notes.compacted !== undefined) preCompact?.noteCompacted(notes.compacted);
      if (notes.context !== undefined) cb.context?.(notes.context);
      noteSyncSince(handleStart, () => `provider:claude:${msg.type}`);
    }
  } catch (e) {
    return tracker.result({ aborted: signal.aborted, thrown: e });
  } finally {
    signal.removeEventListener("abort", onAbort);
    turnOver.stop();
    preCompact?.stop();
    input.close(true);
    cb.control?.(null);
    commandOutput.stopAll();
    spawnNotes.release();
  }

  const aborted = signal.aborted;
  // ファストモードを指定したのに使われなかった場合は、理由をチャットに残す
  const notice = aborted ? null : tracker.fastModeNotice(params.fastMode);
  if (notice) cb.emit({ type: "notice", message: notice });
  return tracker.result({ aborted });
}
