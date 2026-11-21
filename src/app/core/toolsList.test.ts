// AI に見せるツールの記録: 実行に渡す MCP の口ごとの名前・使い方・聞かずに使わせる一覧と、ツールの名前・説明・入力の形・注釈。
// ツールを機能へ移したあとも 1 字も変えない（変わってよいのは語彙の置き換えだけ）
import { test } from "vitest";
import type { BrowserControl } from "@shared/browser/control";
import type { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import type { DatabaseService } from "@/features/database/core/service";
import type { ProviderTurnParams } from "@/features/ai/core/providers/types";
import { browserToolGroup } from "@/features/browser/core/browserTools";
import { dbToolGroup } from "@/features/database/core/dbTools";
import { notifyToolGroup } from "@/features/notifications/core/tools";
import { usageToolGroup } from "@/features/ai/core/tools";
import { createChatToolGroup } from "@/features/childChats/core/tools";
import { worktreeToolGroup } from "@/features/worktrees/core/tools";
import { workplaceToolGroup } from "@/features/workplaceMove/core/tools";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import type { TerminalControl } from "@/features/terminal/core/control";
import { UserViewRegistry } from "@/features/userView/core/registry";
import type { WorktreeFinisher } from "@/features/worktrees/core/finish";
import { ScriptedProvider } from "@/features/ai/core/testing/fakeProvider";
import { connectToolHost } from "@/foundation/core/testing/mcpClient";
import { maskVolatile, matchRecord } from "@/foundation/core/testing/record";
import { setupCore, until } from "@/app/core/testing/testCore";
import { McpToolHost } from "@/foundation/core/aiTools/host";

/** 1 つの MCP の口で AI に見せるもの */
interface ListedServer {
  server: string;
  autoAllow: string[];
  instructions: string | null;
  tools: unknown[];
}

type Core = ReturnType<typeof setupCore<ScriptedProvider>>;
type RunnerOptions = Parameters<typeof setupCore>[1];

/** 一覧を取るだけで中身は呼ばない口（呼ばれたら落とす） */
function unused<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get: (_target, key) => () => {
      throw new Error(`${name}.${String(key)} は呼ばない`);
    },
  });
}

/** 内蔵ターミナル（タブなし） */
const terminals: TerminalControl = { list: () => [], tail: async () => null };

/** 実行に渡された口ごとにつなぎ、AI に見せるものを読む */
async function describeTools(host: McpToolHost, endpoints: NonNullable<ProviderTurnParams["tools"]>): Promise<ListedServer[]> {
  const servers: ListedServer[] = [];
  for (const endpoint of endpoints) {
    const client = await connectToolHost(host, endpoint);
    try {
      const { tools } = await client.listTools();
      servers.push({
        server: endpoint.name,
        autoAllow: endpoint.autoAllow,
        instructions: client.getInstructions() ?? null,
        tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
      });
    } finally {
      await client.close();
    }
  }
  return servers;
}

/**
 * 本物の起動（startCore）と同じく、どのチャットにも出すツールの中身（ターミナル・利用者が見ているもの・砂場の診断・ワークツリーの後始末・
 * チャットの削除・使用枠・チャットを作る・作業場所を移す・通知の組）を渡して組み立て、send で送った実行で AI に見せたものを返す（ブラウザ・DB は場合ごとに options と groups で足す）
 */
async function toolsSeenBy(send: (core: Core) => Promise<number>, options: RunnerOptions = {}, groups: (core: Core) => AiToolGroup[] = () => []): Promise<ListedServer[]> {
  const host = new McpToolHost(() => "http://127.0.0.1:1");
  const seen: ListedServer[][] = [];
  const provider = new ScriptedProvider(async (params) => {
    seen.push(await describeTools(host, params.tools ?? []));
    return { status: "completed", sessionId: "s", turns: 1 };
  });
  const core = setupCore(provider, {
    toolHost: host,
    terminals,
    userViews: new UserViewRegistry(),
    sandboxDiagnostics: { processes: async () => [], denials: async () => [] },
    ...options,
  });
  const finisher = unused<WorktreeFinisher>("worktreeFinisher");
  const { store, runner } = core;
  core.runner.attach({
    worktreeFinisher: finisher,
    aiTools: [
      usageToolGroup(core.usage),
      createChatToolGroup({ store, startChat: unused("startChat"), worktreeEnvs: () => undefined }),
      worktreeToolGroup(finisher),
      workplaceToolGroup({ store, reservations: runner.workplaceMoves, isBusy: (id) => runner.isBusy(id), worktreeFinisher: () => finisher, terminals: () => terminals }),
      notifyToolGroup({ store: () => core.store, publish: (e) => core.bus.publish(e) }),
      ...groups(core),
    ],
  });
  core.runner.useChatRemover(unused<ChatRemover>("chatRemover"));
  const chatId = await send(core);
  await until(() => seen.length === 1 && core.store.chats.get(chatId)?.status === "completed");
  return seen[0];
}

/** ふつうのチャットを始める */
const startPlain = async ({ runner, project }: Core) => (await runner.start({ projectId: project.id, prompt: "x" })).id;

/** 終わったチャットを店に作る（aiGeneration は AI が作った世代） */
function storedChat({ store, project }: Core, input: { title: string; parent?: number; aiGeneration?: number; notePath?: string }) {
  return store.chats.create({
    project_id: project.id,
    provider: "claude",
    title: input.title,
    status: "completed",
    parent_chat_id: input.parent ?? null,
    ai_generation: input.aiGeneration,
    note_path: input.notePath ?? null,
  }).id;
}

/** 店に作ったチャットに続きを送る */
async function sendTo(core: Core, input: Parameters<typeof storedChat>[1]) {
  const id = storedChat(core, input);
  await core.runner.send(id, "x");
  return id;
}

/** 記録の場合と、その実行の作り方 */
const CASES: Record<string, () => Promise<ListedServer[]>> = {
  plain: () => toolsSeenBy(startPlain),
  // AI が作った子（1 世代目。まだチャットを作れる）
  child: () => toolsSeenBy((core) => sendTo(core, { title: "子", parent: storedChat(core, { title: "親" }), aiGeneration: 1 })),
  // AI が作った孫（世代の上限。チャットを作るツールがなくなる）
  grandchild: () =>
    toolsSeenBy((core) => {
      const child = storedChat(core, { title: "子", parent: storedChat(core, { title: "親" }), aiGeneration: 1 });
      return sendTo(core, { title: "孫", parent: child, aiGeneration: 2 });
    }),
  note: () => toolsSeenBy((core) => sendTo(core, { title: "ノート", notePath: "a.md" })),
  createOff: () =>
    toolsSeenBy(async (core) => {
      core.store.settings.update({ ai_create_chat: "off" });
      return startPlain(core);
    }),
  browser: () => {
    const browser = unused<BrowserControl>("browser");
    return toolsSeenBy(startPlain, { browser }, () => [browserToolGroup(browser)]);
  },
  // AI に見せる SQLite の接続が 1 つあるプロジェクト
  database: () =>
    toolsSeenBy(
      async (core) => {
        core.store.dbConnections.create(core.project.id, {
          name: "ローカルの DB",
          engine: "sqlite",
          environment: "local",
          host: null,
          port: null,
          database: null,
          username: null,
          file_path: "app.db",
          ssl: null,
          read_only: false,
          ai_access: "allow",
        });
        return startPlain(core);
      },
      {},
      // DB のツールを出すかは database の店の接続で決める（ツールの中身は呼ばない）
      (core) => {
        const databases = { stores: core.store } as unknown as DatabaseService;
        core.runner.attach({ databases });
        return [dbToolGroup(databases, core.store)];
      },
    ),
};

for (const [name, seen] of Object.entries(CASES)) {
  test(`AI に見せるツールの記録: ${name}`, async () => {
    await matchRecord(`core/mcp-tools.${name}.json`, maskVolatile(await seen()));
  });
}
