// 機能の組み立て: 機能を下の層から作って並べる（本物の起動 startCore.ts とテストの createTestCore が同じものを通る）。並べた順に作って始め、先に止める機能（stopPhase）のあとは逆の順に止める
import type { AssembledCore } from "@/foundation/core/feature";
import type { KernelWithStore } from "@/foundation/core/kernel";
import { createSettings } from "@/features/settings/core/index";
import { createTrash, type TrashApi } from "@/features/trash/core/index";
import { createProjects } from "@/features/projects/core/index";
import { createGroups } from "@/features/groups/core/index";
import { createSnippets } from "@/features/snippets/core/index";
import { createAi, type AiApi } from "@/features/ai/core/index";
import { createAttachments, type UploadStore } from "@/features/attachments/core/index";
import { createUserView, type UserViewRegistry } from "@/features/userView/core/index";
import { createNotifications } from "@/features/notifications/core/index";
import { createVoice } from "@/features/voice/core/index";
import { createDevices, type DevicesApi } from "@/features/devices/core/index";
import { createChat, type ChatApi } from "@/features/chat/core/index";
import { createGuard } from "@/features/guard/core/index";
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
import type { CorePrepared } from "./prepare";
import type { CoreEnv } from "./types";

/** 並べた機能と、起動したコアの口（Core）・テストに出すもの */
export interface AppAssembly extends AssembledCore {
  /** 機能の口（テストが中のサービスを見る） */
  apis: {
    trash: TrashApi;
    ai: AiApi;
    uploads: UploadStore;
    userViews: UserViewRegistry;
    devices: DevicesApi;
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

/** 機能を作って並べる（待つものは prepareCore で先に済ませる。テストの偽物は何も待たない） */
export function assembleCore(k: KernelWithStore, env: CoreEnv, prepared: CorePrepared = { relay: null }): AppAssembly {
  const settings = createSettings(k);
  const trash = createTrash(k, env.trash);
  const projects = createProjects(k, { trash: trash.api });
  const groups = createGroups(k);
  const ai = createAi(k, { ...env.ai, secretCipher: env.secretCipher });
  const attachments = createAttachments(k, { trash: trash.api }, env.attachments);
  const snippets = createSnippets(k, { projects: projects.api });
  const userView = createUserView();
  const notifications = createNotifications(k, env.notifications);
  const voice = createVoice(k, { speech: env.platformParts.speech, ...env.voice });
  const devices = createDevices(k, { tailscaleCli: env.platformParts.tailscaleCli, ...env.devices });
  const { trashCommandFile } = prepared;
  const chat = createChat(k, { trash: trash.api, projects: projects.api, ai: ai.api, uploads: attachments.api.uploads, userViews: userView.api }, { ...env.chat, recoveredReason: env.recoveredReason, trashCommandFile, mcpBaseUrl: env.mcpBaseUrl, retryMs: env.retryMs });
  const { runner } = chat.api;
  // ここからはチャットの上の機能
  const guard = createGuard({ trash: trash.api }, { sandbox: env.guard.sandbox, rules: env.platformParts.agentSandbox, diagnostics: env.platformParts.sandboxDiagnostics, relay: prepared.relay, trashCommandFile });
  const visuals = createVisuals();
  const remoteImages = createRemoteImages(k, { chat: chat.api }, env.remoteImages);
  const files = createFiles(k, { trash: trash.api });
  const git = createGit(k);
  const docker = createDocker(k, { engine: env.platformParts.dockerEngine, ...env.docker });
  const worktrees = createWorktrees(k, { trash: trash.api, ai: ai.api, docker: docker.api, chat: chat.api }, { ...env.worktrees, retryMs: env.retryMs });
  const github = createGitHub(k, { worktrees: worktrees.api, projects: projects.api }, env.github);
  const notes = createNotes(k, { trash: trash.api, ai: ai.api, chat: chat.api, attachments: attachments.api }, env.notes);
  const database = createDatabase(k, { ai: ai.api, chat: chat.api, docker: docker.api, worktrees: worktrees.api }, { ...env.database, secretCipher: env.secretCipher });
  const terminal = createTerminal(k, { worktrees: worktrees.api }, { shell: env.platformParts.terminalShell(), ...env.terminal });
  const browser = createBrowser({ control: env.browser });
  const ports = createPorts(k, { selfPid: env.hostPid, ...env.ports });
  // 上の機能の口を、チャットの実行とルートに渡す（仮の口。上の機能が実行に足すものを登録する形に替えたら消す）
  const terminals = terminal.api;
  chat.api.attach({
    notes: notes.api,
    databases: database.api,
    docker: docker.api,
    worktreeEnvs: worktrees.api.envs,
    worktreeFinisher: worktrees.api.finisher,
    terminals,
    browser: browser.api,
    ...guard.api,
    remoteImages: remoteImages.api,
  });
  return {
    features: [settings, trash, projects, groups, ai, attachments, snippets, userView, notifications, voice, devices, chat, guard, visuals, remoteImages, files, git, docker, worktrees, github, notes, database, terminal, browser, ports],
    hooks: {
      deviceAuth: devices.api.auth,
      status: () => ({ remote_enabled: devices.api.mobileEnabled(), agents: runner.stats() }),
      mcp: chat.api.mcpTools,
    },
    apis: { trash: trash.api, ai: ai.api, uploads: attachments.api.uploads, userViews: userView.api, devices: devices.api, chat: chat.api, docker: docker.api, worktrees: worktrees.api, github: github.api, terminals, ports: ports.api, notes: notes.api, databases: database.api, remoteImages: remoteImages.api },
    runningChats: () => runner.busyChats(),
    awakeNeeds: () => ({ running: runner.stats().running, mobileEnabled: devices.api.mobileEnabled() }),
    terminals,
  };
}
