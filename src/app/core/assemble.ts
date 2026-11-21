// 機能の組み立て: 機能を下の層から作って並べる（本物の起動 startCore.ts とテストの createTestCore が同じものを通る）。並べた順に作って始め、先に止める機能（stopPhase）のあとは逆の順に止める
import type { AssembledCore } from "@/foundation/core/feature";
import type { Kernel } from "@/foundation/core/kernel";
import { createSettings } from "@/features/settings/core/index";
import { createTrash, type TrashApi } from "@/features/trash/core/index";
import { createProjects } from "@/features/projects/core/index";
import { createGroups } from "@/features/groups/core/index";
import { createSnippets } from "@/features/snippets/core/index";
import { createAi, type AiApi } from "@/features/ai/core/index";
import { createAttachments, type UploadStore } from "@/features/attachments/core/index";
import { createUserView, type UserViewRegistry } from "@/features/userView/core/index";
import { createNotifications, type NotificationsApi } from "@/features/notifications/core/index";
import { createVoice } from "@/features/voice/core/index";
import { createDevices, type DevicesApi } from "@/features/devices/core/index";
import { createChat, type ChatApi } from "@/features/chat/core/index";
import { createGuard } from "@/features/guard/core/index";
import { createCompact } from "@/features/compact/core/index";
import { createProviderSwitch } from "@/features/providerSwitch/core/index";
import { createSubagents } from "@/features/subagents/core/index";
import { createChildChats } from "@/features/childChats/core/index";
import { createWorkplaceMove } from "@/features/workplaceMove/core/index";
import { createFiles } from "@/features/files/core/index";
import { createGit } from "@/features/git/core/index";
import { createDocker, type DockerService } from "@/features/docker/core/index";
import { createWorktrees, type WorktreesApi } from "@/features/worktrees/core/index";
import { createGitHub, type GitHubApi } from "@/features/github/core/index";
import { createTerminal, type TerminalSessions } from "@/features/terminal/core/index";
import { createPorts, type PortWatch } from "@/features/ports/core/index";
import { createVisuals } from "@/features/visuals/core/index";
import { createRemoteImages, type RemoteImageService } from "@/features/remoteImages/core/index";
import { createNotes, type NoteService } from "@/features/notes/core/index";
import { createDatabase, type DatabaseService } from "@/features/database/core/index";
import { createBrowser } from "@/features/browser/core/index";
import { deviceEventTypes } from "@shared/foundation/contract";
import { ALL_EVENT_TABLES } from "@/app/shared/contracts";
import type { CorePrepared } from "./prepare";
import type { CoreEnv } from "./types";
import { SETTING_SCHEMAS } from "./settings";

/** 並べた機能と、起動したコアの口（Core）・テストに出すもの */
export interface AppAssembly extends AssembledCore {
  /** 機能の口（テストが中のサービスを見る） */
  apis: {
    trash: TrashApi;
    ai: AiApi;
    uploads: UploadStore;
    userViews: UserViewRegistry;
    devices: DevicesApi;
    notifications: NotificationsApi;
    chat: ChatApi;
    docker: DockerService;
    worktrees: WorktreesApi;
    github: GitHubApi;
    terminals: TerminalSessions;
    ports: PortWatch;
    notes: NoteService;
    databases: DatabaseService;
    remoteImages: RemoteImageService;
  };
  runningChats(): { id: number; title: string | null }[];
  awakeNeeds(): { running: number; mobileEnabled: boolean };
  terminals: TerminalSessions;
}

/** 端末の SSE に届ける知らせの種類（機能の表の access） */
const deviceTypes = deviceEventTypes(ALL_EVENT_TABLES);

/** 機能を作って並べる（待つものは prepareCore で先に済ませる。テストの偽物は何も待たない） */
export function assembleCore(k: Kernel, env: CoreEnv, prepared: CorePrepared = { relay: null }): AppAssembly {
  const settings = createSettings(k, { schemas: SETTING_SCHEMAS });
  // 下の機能があとで作る上の機能の店を読む所は、呼ばれたときに引く関数を渡す（仮の口。作る順は止める順も決めるので変えない）
  const trash = createTrash(k, { projects: () => projects.api.store }, env.trash);
  const projects = createProjects(k, { trash: trash.api });
  const groups = createGroups(k, { projects: projects.api });
  const ai = createAi(k, { projects: projects.api }, { ...env.ai, secretCipher: env.secretCipher });
  const attachments = createAttachments(k, { trash: trash.api, chatStore: () => chat.api.store }, env.attachments);
  const snippets = createSnippets(k, { projects: projects.api, chatOf: (chatId) => chat.api.store.chats.get(chatId) });
  const notifications = createNotifications(k, { chatStore: () => chat.api.store, devices: () => devices.api.store, projects: projects.api.store }, env.notifications);
  const voice = createVoice(k, { speech: env.platformParts.speech, ...env.voice });
  const devices = createDevices(k, { tailscaleCli: env.platformParts.tailscaleCli, ...env.devices });
  const { trashCommandFile } = prepared;
  const chat = createChat(k, { trash: trash.api, projects: projects.api, groups: groups.api, snippets: snippets.api.store, ai: ai.api, attachments: attachments.api.forChat, aiTools: () => features.flatMap((f) => f.aiTools ?? []) }, { ...env.chat, recoveredReason: env.recoveredReason, trashCommandFile, mcpBaseUrl: env.mcpBaseUrl });
  const { runner } = chat.api;
  // 利用者が見ているもの（並びは通知の前のまま。送ったときの様子をチャットの送る口から受けるので、チャットのあとに作る）
  const userView = createUserView({ chat: chat.api });
  // ここからはチャットの上の機能
  const guard = createGuard({ trash: trash.api, ai: ai.api, chat: chat.api }, { sandbox: env.guard.sandbox, rules: env.platformParts.agentSandbox, diagnostics: env.platformParts.sandboxDiagnostics, relay: prepared.relay, trashCommandFile, self: env.guard.self });
  const compact = createCompact({ chat: chat.api });
  const subagents = createSubagents({ chat: chat.api });
  const childChats = createChildChats({ chat: chat.api, ai: ai.api, uploads: attachments.api.uploads, workplace: k.workplace });
  const visuals = createVisuals({ chat: chat.api });
  const remoteImages = createRemoteImages(k, { chat: chat.api, childChats: childChats.api }, env.remoteImages);
  const providerSwitch = createProviderSwitch({ chat: chat.api, uploads: attachments.api.uploads });
  const workplaceMove = createWorkplaceMove(k, { chat: chat.api, ai: ai.api, projects: projects.api });
  const files = createFiles(k, { trash: trash.api, chat: chat.api });
  const git = createGit(k, { chat: chat.api });
  // 「DB で開く」の接続は database の店（database はあとに作るので、呼ばれたときに引く）
  const docker = createDocker(k, { chat: chat.api, guard: guard.api, dbConnectionsOf: (projectId) => database.api.stores.dbConnections.list(projectId) }, { engine: env.platformParts.dockerEngine, ...env.docker });
  const worktrees = createWorktrees(k, { trash: trash.api, ai: ai.api, docker: docker.api, chat: chat.api, workplaceMove: workplaceMove.api }, env.worktrees);
  const github = createGitHub(k, { worktrees: worktrees.api, projects: projects.api, chat: chat.api, ai: ai.api }, env.github);
  const notes = createNotes(k, { trash: trash.api, ai: ai.api, chat: chat.api, attachments: attachments.api, remapDbNotes: (projectId, from, to) => database.api.stores.dbConnections.remapNotePath(projectId, from, to) }, env.notes);
  const database = createDatabase(k, { ai: ai.api, chat: chat.api, docker: docker.api, worktrees: worktrees.api, guard: guard.api }, { ...env.database, secretCipher: env.secretCipher });
  const terminal = createTerminal(k, { worktrees: worktrees.api, chat: chat.api, devices: devices.api.store, workplaceMove: workplaceMove.api }, { shell: env.platformParts.terminalShell(), ...env.terminal });
  const browser = createBrowser(k, { chat: chat.api }, { control: env.browser });
  // チャットの 1 回の実行が終わったら、通知の判断へ（通知は chat より下の機能なので、組み立てがつなぐ）
  chat.api.runner.onTurnEnded((chatId, outcome) => notifications.api.turnEnded(chatId, outcome.status));
  const ports = createPorts(k, { worktrees: worktrees.api, projects: projects.api, chat: chat.api }, { selfPid: env.hostPid, ...env.ports });
  const features = [settings, trash, projects, groups, ai, attachments, snippets, userView, notifications, voice, devices, chat, guard, compact, subagents, childChats, visuals, remoteImages, providerSwitch, workplaceMove, files, git, docker, worktrees, github, notes, database, terminal, browser, ports];
  const terminals = terminal.api;
  return {
    features,
    hooks: {
      deviceAuth: devices.api.auth,
      deviceMaySee: (event) => deviceTypes.has(event.type),
      status: () => ({ remote_enabled: devices.api.mobileEnabled(), agents: runner.stats() }),
      mcp: chat.api.mcpTools,
    },
    apis: { trash: trash.api, ai: ai.api, uploads: attachments.api.uploads, userViews: userView.api, devices: devices.api, notifications: notifications.api, chat: chat.api, docker: docker.api, worktrees: worktrees.api, github: github.api, terminals, ports: ports.api, notes: notes.api, databases: database.api, remoteImages: remoteImages.api },
    runningChats: () => runner.busyChats(),
    awakeNeeds: () => ({ running: runner.stats().running, mobileEnabled: devices.api.mobileEnabled() }),
    terminals,
  };
}
