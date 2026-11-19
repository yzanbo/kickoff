// 台本どおりに振る舞う偽の Copilot SDK のクライアント（本物のランタイム・アカウントは使わない）
import type { CopilotClientFactory, CopilotClientLike, CopilotQuotaSnapshot, CopilotSessionLike, ModelInfo, ResumeSessionConfig, SessionConfig, SessionEvent } from "@/features/ai/core/providers/copilot/sdk";

/** 偽のセッション（届けたイベントは記録に残し、getEvents で返す） */
export interface FakeCopilotSession extends CopilotSessionLike {
  config: SessionConfig | ResumeSessionConfig;
  resumed: boolean;
  sent: { prompt: string; mode?: string }[];
  aborted: boolean;
  disconnected: boolean;
  /** イベントを届ける（ID は自動で振る。ephemeral なら記録に残さない） */
  emit(type: string, data: Record<string, unknown>, opts?: { ephemeral?: boolean }): string;
  /** 手を空ける（session.idle） */
  idle(aborted?: boolean): void;
}

export interface FakeCopilot {
  factory: CopilotClientFactory;
  clients: { env: Record<string, string | undefined>; cwd: string; started: boolean; stopped: boolean }[];
  sessions: FakeCopilotSession[];
  /** 送られたときの台本（省けば返答 1 つで手を空ける） */
  onSend: (session: FakeCopilotSession, prompt: string, mode: string | undefined) => void | Promise<void>;
  /** 止めたときの台本（省けば止めた印の手の空き） */
  onAbort: (session: FakeCopilotSession) => void;
  /** 圧縮の答え */
  compactResult: { success: boolean; tokensRemoved: number };
  models: ModelInfo[];
  auth: { isAuthenticated: boolean; login?: string };
  quota: Record<string, CopilotQuotaSnapshot | undefined>;
  forks: { sessionId: string; toEventId: string | undefined }[];
  /** 前の会話の記録（resume したセッションの getEvents が最初に返すもの） */
  history: Map<string, { id: string; type: string }[]>;
}

export function fakeCopilotClient(): FakeCopilot {
  let seq = 0;
  const fake: FakeCopilot = {
    clients: [],
    sessions: [],
    onSend: (s) => {
      s.emit("user.message", { content: "x" });
      s.emit("assistant.message", { content: "できました", messageId: "m" });
      s.idle();
    },
    onAbort: (s) => s.idle(true),
    compactResult: { success: true, tokensRemoved: 100 },
    models: [],
    auth: { isAuthenticated: true, login: "octo" },
    quota: {},
    forks: [],
    history: new Map(),
    factory: ({ env, cwd }) => {
      const record = { env, cwd, started: false, stopped: false };
      fake.clients.push(record);
      const open = (sessionId: string, config: SessionConfig | ResumeSessionConfig, resumed: boolean): FakeCopilotSession => {
        const handlers = new Set<(e: SessionEvent) => void>();
        const events: { id: string; type: string }[] = [...(fake.history.get(sessionId) ?? [])];
        const session: FakeCopilotSession = {
          sessionId,
          config,
          resumed,
          sent: [],
          aborted: false,
          disconnected: false,
          on(handler) {
            handlers.add(handler);
            return () => handlers.delete(handler);
          },
          emit(type, data, opts) {
            const id = `e-${++seq}`;
            if (!opts?.ephemeral) events.push({ id, type });
            const event = { id, type, data, timestamp: new Date().toISOString(), parentId: null, ...(opts?.ephemeral ? { ephemeral: true } : {}) } as unknown as SessionEvent;
            for (const h of handlers) h(event);
            return id;
          },
          idle(aborted) {
            session.emit("session.idle", aborted ? { aborted: true } : {}, { ephemeral: true });
          },
          async send(options) {
            session.sent.push(options);
            queueMicrotask(() => void fake.onSend(session, options.prompt, options.mode));
            return `msg-${session.sent.length}`;
          },
          async abort() {
            session.aborted = true;
            queueMicrotask(() => fake.onAbort(session));
          },
          async disconnect() {
            session.disconnected = true;
          },
          async getEvents() {
            return [...events];
          },
          async compact() {
            return fake.compactResult;
          },
        };
        fake.sessions.push(session);
        return session;
      };
      const client: CopilotClientLike = {
        start: async () => {
          record.started = true;
        },
        stop: async () => {
          record.stopped = true;
          return [];
        },
        createSession: async (config) => open(config.sessionId ?? `s-${++seq}`, config, false),
        resumeSession: async (id, config) => open(id, config, true),
        getAuthStatus: async () => fake.auth,
        listModels: async () => fake.models,
        getQuota: async () => fake.quota,
        forkSession: async (sessionId, toEventId) => {
          fake.forks.push({ sessionId, toEventId });
          return `fork-of-${sessionId}`;
        },
      };
      return client;
    },
  };
  return fake;
}
