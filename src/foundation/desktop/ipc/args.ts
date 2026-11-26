import path from "node:path";
import { z } from "zod";
import type { Same } from "@shared/foundation/contract";
import { HOME_FOLDER } from "@shared/foundation/path";
import { webLinkOf } from "@shared/foundation/linkTarget";
import { EXTERNAL_BROWSERS, EXTERNAL_TERMINALS, FOUNDATION_IPC } from "@shared/foundation/ipc";
import { THEME_CHOICES } from "@shared/foundation/theme/backgrounds";
import type { ArgSchemasFor, ArgsOfTable, ZodArgsOf } from "./register";

// 画面から届く IPC の引数の形（zod）のうち、土台のまとまりの分（機能の分は機能の desktop/ipcArgs.ts）。取り決め（FOUNDATION_IPC）の引数と同じ形にし、違えば typecheck で分かる。
// 形だけを確かめる（ファイルがあるか・範囲に丸めるなどは、それぞれの処理で行う）。Electron に依らないので、テストできる

/** 引数なし（機能の ipcArgs.ts も使う） */
export const none = z.tuple([]);
/** 絶対パス */
export const absolutePath = z.string().refine((p) => path.isAbsolute(p), { message: "絶対パスではありません" });
/** 絶対パスか、ホームフォルダの印（HOME_FOLDER。共通のターミナルの開く場所。受けた側が展開する） */
const absoluteOrHome = z.string().refine((p) => p === HOME_FOLDER || path.isAbsolute(p), { message: "絶対パスではありません" });
export const positiveInt = z.number().int().positive();
const terminalId = z.enum(EXTERNAL_TERMINALS.map((t) => t.id));
const browserId = z.enum(EXTERNAL_BROWSERS.map((b) => b.id));
const badgeCount = z.number().int().nonnegative();
const badgeColor = z.string().nullable();
/** 外で開く URL の長さの上限（ブラウザが扱える長さより十分大きく、桁違いに長いものだけを断る） */
const MAX_URL_LENGTH = 32_000;

export const foundationArgs = {
  dialog: {
    pickFolder: z.tuple([
      z.string().max(200).optional(),
      z.object({ message: z.string().max(1000).optional(), buttonLabel: z.string().max(60).optional(), defaultPath: z.string().max(4000).optional() }).optional(),
    ]),
    pickReferences: none,
  },
  windows: {
    openPopout: z.tuple([z.string().startsWith("/popout/").max(4000), z.string().max(300), z.object({ x: z.number().finite(), y: z.number().finite() }).nullable()]),
    captureRegion: z.tuple([
      z.object({ x: z.number().finite().min(0), y: z.number().finite().min(0), width: z.number().finite().positive().max(20_000), height: z.number().finite().positive().max(20_000) }),
    ]),
    focusMain: none,
    closeSelf: none,
  },
  externalApps: {
    openPath: z.tuple([absolutePath]),
    revealPath: z.tuple([absolutePath]),
    openInVSCode: z.tuple([absolutePath, z.number().optional()]),
    terminals: none,
    openTerminal: z.tuple([absoluteOrHome, terminalId.optional()]),
    browsers: none,
    openBrowser: z.tuple([z.string().optional(), browserId.optional()]),
    openWebUrl: z.tuple([z.string().max(MAX_URL_LENGTH).refine((url) => webLinkOf(url) !== null, { message: "http(s) の URL ではありません" })]),
  },
  terminal: {
    owner: none,
  },
  notifications: {
    notify: z.tuple([
      z.object({
        title: z.string().trim().min(1, { message: "通知のタイトルがありません" }),
        body: z.string(),
        chat: z.object({ projectId: positiveInt, chatId: positiveInt }).optional(),
        ci: z.object({ projectId: positiveInt, runId: positiveInt }).optional(),
      }),
    ]),
    openSettings: none,
    dockIconBase: none,
    // 512px のアイコンの PNG は 100KB ほど（base64 で 4/3 倍）。上限は桁違いに大きいものを断るため
    setDockIcon: z.tuple([z.string().startsWith("data:image/png;base64,").max(4_000_000).nullable()]),
    setStateBadges: z.tuple([
      z.object({
        counts: z.object({ running: badgeCount, needsInput: badgeCount, unread: badgeCount }),
        colors: z.object({ running: badgeColor, needsInput: badgeColor, unread: badgeColor }),
      }),
    ]),
  },
  loginItem: {
    get: none,
    set: z.tuple([z.boolean()]),
  },
  appearance: {
    setTheme: z.tuple([z.enum(THEME_CHOICES)]),
  },
  core: {
    state: none,
    restart: none,
    wait: none,
  },
} satisfies ArgSchemasFor<typeof FOUNDATION_IPC>;
true satisfies Same<ArgsOfTable<typeof FOUNDATION_IPC>, ZodArgsOf<typeof foundationArgs>>;
