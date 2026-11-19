// 仮の機能 legacy: まだ createX に分けていない機能を、いまの起動と同じ順に作る（作る・受け口・始める・止める）。機能を分けるたびにここから外す
import os from "node:os";
import path from "node:path";
import { chatDeltaStage } from "@/features/chat/core/deltaStage";
import { createProviders } from "@/features/ai/core/providers/index";
import { currentSelf } from "@/features/guard/core/guard/selfProtection";
import { PairingCenter } from "@/features/devices/core/pairing";
import { NotificationCenter } from "@/features/notifications/core/center";
import { expoPushSender } from "@/features/devices/core/push";
import { ViewingRegistry } from "@/features/notifications/core/viewing";
import { McpToolHost } from "@/foundation/core/aiTools/host";
import { ProviderKeyVault } from "@/features/ai/core/providers/keys";
import { CodexCreditsWatch } from "@/features/ai/core/usage/codexCredits";
import { ServiceUsageMonitor } from "@/features/ai/core/usage/services/index";
import { UsageMonitor } from "@/features/ai/core/usage/planUsage";
import { ApprovalCenter } from "@/features/chat/core/approvals";
import { Runner } from "@/features/chat/core/runner";
import { endInterruptedTurns } from "@/features/chat/core/interruptedTurnEnd";
import { UploadStore } from "@/features/attachments/core/uploads";
import { startAutoArchive } from "@/features/chat/core/autoArchive";
import { VoiceService } from "@/features/voice/core/service";
import { WorktreePrWatch } from "@/features/github/core/prWatch";
import { HeadWatch } from "@/features/worktrees/core/headWatch";
import { listPullRequests } from "@/features/github/core/github";
import { listWorktrees } from "@/foundation/core/workplace/worktrees";
import { NoteService } from "@/features/notes/core/notes";
import { errorMessage } from "@shared/foundation/errors";
import { TrashService } from "@/features/trash/core/service";
import { installTrashCommand } from "@/features/trash/core/command";
import { siblingSessionCheck } from "@/features/chat/core/sessions/siblingSessions";
import { sweepUnusedSessions } from "@/features/chat/core/sessions/sessionTrash";
import { sweepUnusedUploads } from "@/features/chat/core/attachmentsCleanup";
import type { SessionTrash } from "@/features/chat/core/sessionSwitch";
import { registerProjectTrash } from "@/features/projects/core/trash";
import { RemoteImageService } from "@/features/remoteImages/core/service";
import { WorktreeFinisher } from "@/features/worktrees/core/finish";
import { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import { UserViewRegistry } from "@/features/userView/core/registry";
import { registerChatTrash, trashNoteChats, trashNoteChatsOnImport } from "@/features/chat/core/sessions/chatTrash";
import { isInside, realPathLoose } from "@/foundation/core/system/paths";
import { defaultNotesDir } from "@/features/notes/core/defaultDir";
import { TerminalSessions } from "@/features/terminal/core/sessions";
import { DbWorkerClient, forkWorker } from "@/features/database/core/client";
import { DatabaseService } from "@/features/database/core/service";
import { GitHubService } from "@/features/github/core/service";
import { CiService } from "@/features/github/core/ci";
import { devWorkerEntry } from "@/features/database/core/entry";
import { DbSecretVault } from "@/features/database/core/secrets";
import { DockerService } from "@/features/docker/core/service";
import { WorktreeEnvService } from "@/features/worktrees/core/env/service";
import { PortProcessService } from "@/features/ports/core/service";
import { PortWatch } from "@/features/ports/core/watch";
import { startNetworkRelay } from "@/features/guard/core/sandbox/networkRelay";
import type { BashSandboxDeps } from "@/features/guard/core/sandbox/bashSandbox";
import type { RecoveredReason } from "@/foundation/core/host/protocol";
import type { CoreOptions } from "./types";
import type { KernelWithStore } from "@/foundation/core/kernel";
import type { CoreFeature, ServeHooks } from "@/foundation/core/feature";
import type { ServerDeps } from "@/foundation/core/http/server";
import { legacyHooks, legacyRoutes } from "./legacyRoutes";

/** 前のコアの終わり方ごとの、中断したチャットに残す文 */
const RECOVERED_MESSAGES: Record<RecoveredReason, string> = {
  quit: "アプリの終了により中断しました。メッセージを送ると続きから再開できます。",
  crash: "Kickoff のコアが止まったため中断しました。メッセージを送ると続きから再開できます。",
};

/** ほかの機能と組み立てに出す口（作業中のチャット・内蔵ターミナル・HTTP の土台への口） */
export interface LegacyApi {
  runner: Runner;
  terminals: TerminalSessions;
  hooks: ServeHooks;
}

/** いまの全部の機能を作る（待ち受けを始めたあとの見張りは start、止めるのは stop） */
export async function createLegacy(k: KernelWithStore, opts: CoreOptions): Promise<CoreFeature<LegacyApi>> {
  const { bus, store } = k;
  const deltas = chatDeltaStage(k.clock);
  bus.use(deltas);
  // 前回の終了で作業の途中で止まったチャット（落ちて作業中のまま残ったものを失敗にし、終えるときに印を付けたものと一緒に返す）は、起動したときの再開の確かめで聞く
  const recovered = store.chats.recoverInterrupted(RECOVERED_MESSAGES[opts.recoveredReason ?? "quit"]);
  if (recovered.length > 0) k.log.info(`前回の終了で作業の途中で止まったチャットが ${recovered.length} 件あります（起動したときの再開の確かめで聞きます）`);
  // そのうち最後の作業に終わりの記録がないもの（終える・落ちるときに書けなかった）に、終わりの記録と止まったサブエージェントのお知らせを足す
  endInterruptedTurns(store, recovered);

  // エージェントが自分（このプロセス・保存先・API）を壊さないよう、自分の情報を渡す
  // AI の API キー（DB のパスワードと同じくキーチェーンの鍵で暗号化して置く）
  const providerKeys = new ProviderKeyVault(store, opts.secretCipher ?? null);
  const providers = createProviders(currentSelf(opts.dataDir, opts.port, opts.platform, opts.platformParts.selfGuard, opts.hostPid), (id) => providerKeys.authFor(id));
  // 使用枠（下の帯・超過分の知らせ）は Claude のプランから取得する（ほかの AI は下の serviceUsage）
  const usage = new UsageMonitor(providers.claude, bus);
  // Codex のクレジットの見張り（使用状況の取得と、Codex の実行中の知らせの両方から残りを受ける）
  const codexCredits = new CodexCreditsWatch(bus);
  // 設定の「使用状況」に並べる、ほかのサービス（Codex・Copilot・Cursor・Gemini）の使用状況
  const serviceUsage = new ServiceUsageMonitor(usage, undefined, codexCredits);
  const approvals = new ApprovalCenter(bus);
  const uploads = new UploadStore(path.join(opts.dataDir, "uploads"));
  // ノートの親フォルダの既定は ~/Documents/kickoff（保存先のフォルダ名のアプリ名を空白のない小文字に。開発版は kickoff-dev で、製品版のノートに触らない）
  const notesDefaultDir = defaultNotesDir(opts.dataDir, path.join(os.homedir(), "Documents"));
  // Kickoff のゴミ箱（消したものを 3 日取っておく。起動したときと 1 時間ごとに、期限の来たものを本当に消す）。
  // AI の kickoff-trash で入れたものは、消したチャットのプロジェクト、なければ元の場所を含むプロジェクト（本体・ノートのフォルダ）のゴミ箱に出す
  const trashBin = new TrashService({
    store,
    dir: path.join(opts.dataDir, "trash"),
    projectOfPath: (origin) => {
      const owner = store.projects.list().find((p) => isInside(realPathLoose(p.repo_path), origin) || ((p.note_path || p.note_folder) && isInside(realPathLoose(notes.dirOf(p)), origin)));
      return owner?.id ?? null;
    },
    // AI がノートを kickoff-trash で消したら、ノートのチャットも同じ行に入れる（画面から消したときと同じ）
    onImported: (item) => trashNoteChatsOnImport({ store, runner, noteDirOf: (p) => notes.dirOf(p), publish: (e) => bus.publish(e) }, item),
  });
  const notes = new NoteService({
    store,
    defaultDir: notesDefaultDir,
    providers,
    publish: (e) => bus.publish(e),
    trashBin,
    trashNoteChats: (projectId, notePath, itemId) => trashNoteChats({ store, runner }, projectId, notePath, itemId),
  });
  // DB クライアント（DB の処理は別のプロセス。初めて使ったときに起動し、何もしない状態が 5 分続いたら止める。チャットの AI にも DB のツールで読ませる。パスワードはキーチェーンの鍵で暗号化）
  const vault = new DbSecretVault(store, opts.secretCipher ?? null);
  const databases = new DatabaseService({ store, client: new DbWorkerClient(opts.dbWorker ?? (() => forkWorker(devWorkerEntry()))), vault, dataDir: opts.dataDir, appDataRoot: opts.platform.appDataRoot, publish: (e) => bus.publish(e) });
  // AI の SQL の結果を書き出した CSV のうち、7 日を過ぎたもの・消したチャットのものを消す
  databases.cleanExports();
  // ノートのチャットの実行では、AI にノートのフォルダも読み書きさせる
  // Docker タブ（docker events は見ている画面があるときだけ動かす。チャットの AI の Docker の守りも、これで相手を引く）
  const docker = new DockerService(bus, { listeningSockets: opts.platform.listeningSockets, dockerEngine: opts.platformParts.dockerEngine });
  // ワークツリーの実行環境（ワークツリーを作ったときにポートの帯と組の名前を割り当てる。チャットの AI とターミナルには PORT を渡す）
  const worktreeEnvs = new WorktreeEnvService(store, docker);
  // ポートを使っているプロセス（AI が残した開発サーバーに気付いて止める。調べるのは窓を開いた・チャットの実行が終わったときだけ）
  const ports = new PortWatch(bus, new PortProcessService({ store, probe: opts.platform, selfPid: opts.hostPid, selfBundle: opts.platform.appBundleOf(process.execPath) }));
  // 内蔵ターミナルのシェル（この Mac の画面は IPC、スマホは WebSocket でつなぐ。ワークツリーのシェルには PORT を渡す。AI は出力を読むだけ）
  const terminals = new TerminalSessions({ shell: opts.platformParts.terminalShell(), env: opts.terminalEnv, envOf: (cwd) => worktreeEnvs.envFor(cwd) });
  // AI の rm の代わりの kickoff-trash を bin/ に置く（置けなければ守りも付けない。AI が消せなくなって止まらないように）
  const trashCommand = await installTrashCommand(path.join(opts.dataDir, "bin")).then(
    (file) => ({ path: file, dir: trashBin.dir }),
    (e: unknown) => (k.log.warn(`kickoff-trash を置けませんでした: ${errorMessage(e)}`), undefined),
  );
  // AI の Bash の砂場（書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにする）。通信はどこへでも通す中継を通す（ネットワークは絞らない。起こせなければプロバイダーの中継のまま）
  const relay = await startNetworkRelay().catch((e: unknown) => (k.log.warn(`Bash の通信の中継を起こせませんでした: ${errorMessage(e)}`), null));
  const bashSandbox: BashSandboxDeps = { rules: opts.platformParts.agentSandbox, proxyPort: relay?.port ?? null, trashDir: trashCommand ? trashCommand.dir : null };
  // 製品版と開発版は同じ ~/.claude/projects に会話記録を置く（開発版のデータは製品版から写す）ので、会話記録を片付ける前に、ほかの Kickoff が使っていないか確かめる
  const sessionsElsewhere = siblingSessionCheck(opts.dataDir, opts.platform.appDataRoot);
  // 長いチャットを直近の区切りだけの新しいセッションに乗り換えたら、古い会話記録を Kickoff のゴミ箱（3 日）へ
  const sessionTrash: SessionTrash = async (sessionId, file, { projectId, label }) => {
    if (sessionsElsewhere([sessionId]).size > 0) return;
    await trashBin.putPath(file, { projectId, label, kind: "session" });
  };
  // 利用者が見ているもの（この Mac の画面のウィンドウごとの知らせと、チャットごとの送ったときの様子。AI の get_user_view が読む。保存しない）
  const userViews = new UserViewRegistry();
  // AI の操作ツールを実行ごとの鍵で出すコアの MCP サーバー（どの CLI もこの Mac の中から HTTP でつなぐ）
  const mcpTools = new McpToolHost(() => `http://127.0.0.1:${opts.port}`);
  const runner = new Runner({ store, approvals, providers, usage, codexCredits, uploads, bus, noteDirOf: (project) => notes.dirOf(project), notes, browser: opts.browser, terminals, databases, docker, worktreeEnvs, trashCommand, sessionTrash, userViews, bashSandbox, sandboxDiagnostics: opts.platformParts.sandboxDiagnostics, toolHost: mcpTools, providerKeys, interrupted: recovered });
  // Kickoff が作ったセッションのうち、どのチャットからも使われなくなったものの会話記録を、ゴミ箱の片付けのたびにゴミ箱へ
  trashBin.addSweepStep(() => sweepUnusedSessions({ store, providers, trashBin, sessionsElsewhere }));
  // 入力欄に付けたまま送らなかった添付は、どこからも使われないまま 30 日たったら消す（ゴミ箱には入れない）
  trashBin.addSweepStep(() => sweepUnusedUploads({ store, uploads }));
  // ゴミ箱に入れたチャット（チャットの削除・ノートのチャット）を戻す・3 日たったら会話記録のファイル・添付・AI の SQL の CSV ごと本当に消す
  const remoteImages = new RemoteImageService({ store, dir: path.join(opts.dataDir, "image-cache"), publish: (e) => bus.publish(e) });
  const forgetChatImages = (ids: number[]) => remoteImages.forgetChats(ids);
  registerChatTrash(trashBin, { store, providers, uploads, forgetChatExports: (ids) => databases.forgetChatExports(ids), forgetChatImages, sessionsElsewhere });
  registerProjectTrash(trashBin, { store, providers, uploads, forgetChatExports: (ids) => databases.forgetChatExports(ids), forgetChatImages, sessionsElsewhere });
  // 音声入力の文字起こし（モデルは保存先の models/ に置く。開発版と製品版で別）
  const voice = new VoiceService({ store, modelsDir: path.join(opts.dataDir, "models"), speech: opts.platformParts.speech, publish: (e) => bus.publish(e) });
  // GitHub タブと CI の結果（GitHub Actions）
  const github = new GitHubService({ onWorktreeCreated: (project, worktree) => worktreeEnvs.prepare(project, worktree) });
  const ci = new CiService(github);
  // ワークツリーの PR の見張り（GitHub でマージされた・閉じられたことを、5 分ごとと窓に戻ったときに確かめる）。
  // CI の失敗の見張りも相乗りする（ワークツリーのないプロジェクトでも。落ちたら SSE の ci_failed）
  const prWatch = new WorktreePrWatch({
    store,
    publish: (e) => bus.publish(e),
    listWorktrees,
    listPullRequests,
    alsoCheck: async (project) => {
      for (const failure of await ci.watch(project, store)) bus.publish({ type: "ci_failed", failure });
    },
  });
  // ワークツリーの後始末（画面の「消す」と AI の finish_worktree。消す前の確かめ・控え（ゴミ箱に 3 日）・ワークツリー自身のチャットからの予約）
  const worktreeFinisher = new WorktreeFinisher({ store, bus, runner, worktreeEnvs, databases, prWatch, trashBin });
  runner.useWorktreeFinisher(worktreeFinisher);
  // チャットのアーカイブ・削除（AI の archive_chat・delete_chat。自分・自分の祖先を頼まれたら作業の終わりに行う予約）
  const chatRemover = new ChatRemover({ store, bus, runner, trashBin });
  runner.useChatRemover(chatRemover);
  // スマホ連携のペアリング（番号と頼みはメモリだけ）
  const pairing = new PairingCenter({ store, publish: (e) => bus.publish(e) });
  // 通知の判断（完了・失敗・回答待ち・CI の失敗を、だれも見ていなければ、この Mac の通知とつないだ端末のプッシュへ）
  const viewing = new ViewingRegistry();
  const notifications = new NotificationCenter({ bus, store, viewing, desktop: opts.notify, push: opts.push ?? expoPushSender() });
  const headWatch = new HeadWatch((project_id) => bus.publish({ type: "worktrees_changed", project_id }));
  const deps: ServerDeps = {
    headWatch,
    providerKeys,
    store,
    bus,
    streamingText: deltas.streamingText,
    providers,
    usage,
    serviceUsage,
    runner,
    approvals,
    uploads,
    voice,
    notes,
    prWatch,
    databases,
    github,
    ci,
    docker,
    worktreeEnvs,
    ports,
    pairing,
    viewing,
    trashBin,
    remoteImages,
    worktreeFinisher,
    userViews,
    sessionsElsewhere,
    tailscaleCli: opts.platformParts.tailscaleCli,
    terminals,
    listen: { host: k.paths.host, port: k.paths.port },
  };
  // 完了したチャットの自動のアーカイブ（設定でオンにしたときだけ。始めるのは待ち受けのあと）
  let stopAutoArchive: (() => void) | null = null;

  return {
    name: "legacy",
    api: { runner, terminals, hooks: legacyHooks(deps, mcpTools) },
    ...legacyRoutes(deps),
    start: () => {
      usage.start();
      prWatch.start();
      ports.start();
      trashBin.start();
      stopAutoArchive = startAutoArchive(store, bus);
    },
    stop: async () => {
      // 止める順を変えない（通知 → エージェント → 流れ続けている外部コマンド → 見張り・サービス → DB ワーカー → ターミナル・Bash の通信の中継）。止める途中の知らせで通知を出さない
      notifications.close();
      runner.shutdown();
      // 流れ続けている外部コマンド（docker events・起動の途中の up -d など）は聞かずに止める
      k.exec.stopAllStreams();
      docker.close();
      voice.downloads.stopAll();
      usage.stop();
      prWatch.stop();
      worktreeFinisher.close();
      chatRemover.close();
      ports.close();
      stopAutoArchive?.();
      trashBin.close();
      notes.close();
      headWatch.close();
      await databases.close();
      terminals.closeAll();
      await relay?.close();
    },
  };
}
