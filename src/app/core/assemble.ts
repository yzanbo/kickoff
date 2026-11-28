// 機能の組み立て: 機能を下の層から作って並べる（本物の起動 startCore.ts とテストの createTestCore が同じものを通る）。並べた順に作って始め、先に止める機能（stopPhase）のあとは逆の順に止める。
// テストは機能を名前で絞れる（その機能と、作るのに要る下の機能だけを作る）
import type { AssembledCore, CoreFeature, FeatureName } from "@/foundation/core/feature";
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
import { createProviderHandoffs, createProviderSwitch } from "@/features/providerSwitch/core/index";
import { createSubagents } from "@/features/subagents/core/index";
import { createChildChats } from "@/features/childChats/core/index";
import { createWorkplaceMove } from "@/features/workplaceMove/core/index";
import { createQueue } from "@/features/queue/core/index";
import { createFiles } from "@/features/files/core/index";
import { createGit } from "@/features/git/core/index";
import { createDocker, type DockerApi, type DockerParts } from "@/features/docker/core/index";
import { createWorktrees, type WorktreesApi } from "@/features/worktrees/core/index";
import { createGitHub, type GitHubApi } from "@/features/github/core/index";
import { createTerminal, type TerminalApi } from "@/features/terminal/core/index";
import { createPorts } from "@/features/ports/core/index";
import { createVisuals } from "@/features/visuals/core/index";
import { createRemoteImages } from "@/features/remoteImages/core/index";
import { createNotes, projectNoteFolder, type NotesApi } from "@/features/notes/core/index";
import { createDatabase } from "@/features/database/core/index";
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
    docker: DockerApi & { parts: DockerParts };
    worktrees: WorktreesApi;
    github: GitHubApi;
    notes: NotesApi;
  };
  runningChats(): { id: number; title: string }[];
  awakeNeeds(): { running: number; mobileEnabled: boolean };
  terminals: TerminalApi;
}

/** 端末の SSE に届ける知らせの種類（機能の表の access） */
const deviceTypes = deviceEventTypes(ALL_EVENT_TABLES);

/** 機能を作る口（初めて呼んだときに作る。作ったかは built） */
interface Slot<T> {
  (): T;
  readonly label: string;
  readonly built: boolean;
}

function slot<T>(label: string, make: () => T): Slot<T> {
  let value: T | undefined;
  let built = false;
  const get = () => {
    if (!built) {
      value = make();
      built = true;
    }
    return value as T;
  };
  return Object.defineProperties(get, { label: { value: label }, built: { get: () => built } }) as Slot<T>;
}

/** 作ってある機能（下の機能が、あとで作る上の機能を呼ばれたときに引く所。絞って組み立てたテストで作っていなければ落とす） */
function existing<T>(s: Slot<T>): T {
  if (!s.built) throw new Error(`機能 ${s.label} を組み立てていません（テストなら createTestCore の features に足す）`);
  return s();
}

/**
 * 機能を作って並べる（待つものは prepareCore で先に済ませる。テストの偽物は何も待たない）。
 * only を渡すと、その機能と作るのに要る機能だけを作る（テストだけ。省けば全部を本物と同じ順に作る）
 */
export function assembleCore(k: Kernel, env: CoreEnv, prepared: CorePrepared = { relay: null }, only?: readonly FeatureName[]): AppAssembly {
  const settings = slot("settings", () => createSettings(k, { schemas: SETTING_SCHEMAS }));
  // 下の機能があとで作る上の機能の店を読む所は、呼ばれたときに引く関数を渡す（仮の口。作る順は止める順も決めるので変えない）
  const trash: Slot<ReturnType<typeof createTrash>> = slot("trash", () => createTrash(k, { projects: () => existing(projects).api.store }, env.trash));
  const projects: Slot<ReturnType<typeof createProjects>> = slot("projects", () => createProjects(k, { trash: trash().api, noteFolderName: projectNoteFolder }));
  const groups = slot("groups", () => createGroups(k, { projects: projects().api }));
  const ai = slot("ai", () => createAi(k, { projects: projects().api }, { ...env.ai, secretCipher: env.secretCipher }));
  const attachments: Slot<ReturnType<typeof createAttachments>> = slot("attachments", () => createAttachments(k, { trash: trash().api, chatStore: () => existing(chat).api.store }, env.attachments));
  const snippets: Slot<ReturnType<typeof createSnippets>> = slot("snippets", () => createSnippets(k, { projects: projects().api, chatOf: (chatId) => existing(chat).api.store.chats.get(chatId) }));
  const notifications: Slot<ReturnType<typeof createNotifications>> = slot("notifications", () => createNotifications(k, { chatStore: () => existing(chat).api.store, projects: projects().api.store }, env.notifications));
  const voice = slot("voice", () => createVoice(k, { speech: env.platformParts.speech, ...env.voice }));
  const devices = slot("devices", () => createDevices(k, { notifications: notifications().api }, { tailscaleCli: env.platformParts.tailscaleCli, ...env.devices }));
  const { trashCommandFile } = prepared;
  // AI を替えたあとの引き継ぎ（providerSwitch の表。起動したときの確かめが chat を作る中で読むので、chat の前に作って両方に渡す）
  const providerHandoffs = slot("providerSwitch", () => createProviderHandoffs(k.db));
  const chat: Slot<ReturnType<typeof createChat>> = slot("chat", () =>
    createChat(k, { trash: trash().api, projects: projects().api, groups: groups().api, snippets: snippets().api.store, ai: ai().api, attachments: attachments().api.forChat, providerHandoff: providerHandoffs().port, aiTools: () => features.flatMap((f) => f.aiTools ?? []) }, { ...env.chat, recoveredReason: env.recoveredReason, trashCommandFile, mcpBaseUrl: env.mcpBaseUrl }),
  );
  // 利用者が見ているもの（並びは通知の前のまま。送ったときの様子をチャットの送る口から受けるので、チャットのあとに作る）
  const userView = slot("userView", () => createUserView({ chat: chat().api }));
  // ここからはチャットの上の機能
  const guard = slot("guard", () => createGuard({ trash: trash().api, ai: ai().api, chat: chat().api }, { sandbox: env.guard.sandbox, rules: env.platformParts.agentSandbox, diagnostics: env.platformParts.sandboxDiagnostics, relay: prepared.relay, trashCommandFile, self: env.guard.self }));
  const compact = slot("compact", () => createCompact({ chat: chat().api }));
  const subagents = slot("subagents", () => createSubagents({ chat: chat().api }));
  const childChats = slot("childChats", () => createChildChats({ chat: chat().api, ai: ai().api, uploads: attachments().api.uploads, workplace: k.workplace }));
  const visuals = slot("visuals", () => createVisuals({ chat: chat().api }));
  const remoteImages = slot("remoteImages", () => createRemoteImages(k, { chat: chat().api, childChats: childChats().api, projects: projects().api }, env.remoteImages));
  const providerSwitch = slot("providerSwitch", () => createProviderSwitch(k, { chat: chat().api, uploads: attachments().api.uploads, providerHandoffs: providerHandoffs() }));
  const workplaceMove = slot("workplaceMove", () => createWorkplaceMove(k, { chat: chat().api, ai: ai().api, projects: projects().api }));
  const queue = slot("queue", () => createQueue({ chat: chat().api }));
  const files = slot("files", () => createFiles(k, { trash: trash().api, projects: projects().api, chat: chat().api }));
  const git = slot("git", () => createGit(k, { projects: projects().api, chat: chat().api }));
  const docker = slot("docker", () => createDocker(k, { projects: projects().api, guard: guard().api }, { engine: env.platformParts.dockerEngine, ...env.docker }));
  const worktrees = slot("worktrees", () => createWorktrees(k, { trash: trash().api, projects: projects().api, ai: ai().api, docker: docker().api, chat: chat().api, workplaceMove: workplaceMove().api }));
  const github = slot("github", () => createGitHub(k, { git: git().api, worktrees: worktrees().api, projects: projects().api, chat: chat().api }, env.github));
  const notes = slot("notes", () => createNotes(k, { settings: settings().api, trash: trash().api, projects: projects().api, ai: ai().api, chat: chat().api, attachments: attachments().api, workplaceMove: workplaceMove().api, remoteImages: remoteImages().api }, env.notes));
  const database = slot("database", () => createDatabase(k, { projects: projects().api, ai: ai().api, chat: chat().api, notes: notes().api, docker: docker().api, worktrees: worktrees().api, guard: guard().api }, { ...env.database, secretCipher: env.secretCipher }));
  const terminal = slot("terminal", () => createTerminal(k, { worktrees: worktrees().api, projects: projects().api, chat: chat().api, devices: devices().api.store, workplaceMove: workplaceMove().api }, { shell: env.platformParts.terminalShell(), ...env.terminal }));
  const browser = slot("browser", () => createBrowser(k, { chat: chat().api }, { control: env.browser }));
  // チャットの 1 回の実行が終わったら、通知の判断へ（通知は chat より下の機能なので、組み立てがつなぐ）
  const turnEndNotices = slot("notifications", () => chat().api.runner.onTurnEnded((chatId, outcome) => notifications().api.turnEnded(chatId, outcome.status)));
  const ports = slot("ports", () => createPorts(k, { worktrees: worktrees().api, projects: projects().api, chat: chat().api }, { selfPid: env.hostPid, ...env.ports }));
  /** 並べる順（始める順・止める順の元） */
  const listed: Slot<CoreFeature>[] = [settings, trash, projects, groups, ai, attachments, snippets, userView, notifications, voice, devices, chat, guard, compact, subagents, childChats, visuals, remoteImages, providerSwitch, workplaceMove, queue, files, git, docker, worktrees, github, notes, database, terminal, browser, ports];
  if (only) {
    for (const name of only) {
      const found = listed.find((s) => s.label === name);
      if (!found) throw new Error(`機能 ${name} は組み立てにありません`);
      found();
    }
    if (chat.built && notifications.built) turnEndNotices();
  } else {
    // 作る順（並べる順と違う所がある: 通知・端末はチャットより先に作り、利用者が見ているものはチャットのあと）
    for (const make of [settings, trash, projects, groups, ai, attachments, snippets, notifications, voice, devices, providerHandoffs, chat, userView, guard, compact, subagents, childChats, visuals, remoteImages, providerSwitch, workplaceMove, queue, files, git, docker, worktrees, github, notes, database, terminal, browser, turnEndNotices, ports]) make();
  }
  const features = listed.filter((s) => s.built).map((s) => s());
  return {
    features,
    hooks: {
      ...(devices.built ? { deviceAuth: devices().api.auth } : {}),
      deviceMaySee: (event) => deviceTypes.has(event.type),
      status: () => ({ mobile_enabled: devices.built && devices().api.mobileEnabled(), agents: chat.built ? chat().api.runner.stats() : { running: 0 } }),
      ...(chat.built ? { mcp: chat().api.mcpTools } : {}),
    },
    apis: {
      get trash() {
        return existing(trash).api;
      },
      get ai() {
        return existing(ai).api;
      },
      get uploads() {
        return existing(attachments).api.uploads;
      },
      get userViews() {
        return existing(userView).api;
      },
      get devices() {
        return existing(devices).api;
      },
      get notifications() {
        return existing(notifications).api;
      },
      get chat() {
        return existing(chat).api;
      },
      get docker() {
        return existing(docker).api;
      },
      get worktrees() {
        return existing(worktrees).api;
      },
      get github() {
        return existing(github).api;
      },
      get notes() {
        return existing(notes).api;
      },
    },
    runningChats: () => (chat.built ? chat().api.runner.busyChats() : []),
    awakeNeeds: () => ({ running: chat.built ? chat().api.runner.stats().running : 0, mobileEnabled: devices.built && devices().api.mobileEnabled() }),
    get terminals() {
      return existing(terminal).api;
    },
  };
}
