import path from "node:path";
import { z } from "zod";
import { EXTERNAL_BROWSERS, EXTERNAL_TERMINALS, KNOWN_EXTENSIONS, type KnownExtensionKey } from "@shared/ipc";
import { defineArgSchemas } from "./register.js";

// 画面から届く IPC の引数の形（zod）。取り決め（shared/ipc/contract.ts）の引数と同じ形にし、違えば typecheck で分かる。
// 形だけを確かめる（ファイルがあるか・範囲に丸めるなどは、それぞれの処理で行う）。Electron に依らないので、テストできる

const none = z.tuple([]);
/** 絶対パス */
const absolutePath = z.string().refine((p) => path.isAbsolute(p), { message: "絶対パスではありません" });
/** 埋め込みブラウザ（WebContents）の ID */
const webContentsId = z.number().int().nonnegative();
/** ターミナルのタブのキー */
const terminalKey = z.string().min(1);
/** ターミナルの桁数・行数（範囲には受け取ってから丸める） */
const terminalSize = z.number();
const positiveInt = z.number().int().positive();
const terminalId = z.enum(EXTERNAL_TERMINALS.map((t) => t.id));
const browserId = z.enum(EXTERNAL_BROWSERS.map((b) => b.id));
const extensionKey = z.enum(Object.keys(KNOWN_EXTENSIONS) as KnownExtensionKey[]);

export const IPC_ARGS = defineArgSchemas({
  dialog: {
    pickFolder: z.tuple([
      z.string().max(200).optional(),
      z.object({ message: z.string().max(1000).optional(), buttonLabel: z.string().max(60).optional(), defaultPath: z.string().max(4000).optional() }).optional(),
    ]),
    pickReferences: none,
  },
  windows: {
    openPopout: z.tuple([z.string().startsWith("/popout/").max(4000), z.string().max(300)]),
    focusMain: none,
    closeSelf: none,
  },
  externalApps: {
    openPath: z.tuple([absolutePath]),
    revealPath: z.tuple([absolutePath]),
    openInVSCode: z.tuple([absolutePath, z.number().optional()]),
    terminals: none,
    openTerminal: z.tuple([absolutePath, terminalId.optional()]),
    browsers: none,
    openBrowser: z.tuple([z.string().optional(), browserId.optional()]),
  },
  devtools: {
    openIn: z.tuple([webContentsId, webContentsId]),
    openWindow: z.tuple([webContentsId]),
    close: z.tuple([webContentsId]),
  },
  agentBrowser: {
    register: z.tuple([webContentsId, z.string().min(1).max(200), positiveInt.nullable()]),
    unregister: z.tuple([webContentsId]),
    opened: z.tuple([positiveInt, z.string().min(1).max(200).nullable(), z.boolean(), z.string().max(1000).nullable()]),
    revealed: z.tuple([positiveInt, z.boolean()]),
    handOffCapture: z.tuple([webContentsId]),
  },
  browserExtensions: {
    list: none,
    install: z.tuple([extensionKey]),
    importFromChrome: z.tuple([extensionKey]),
    addFolder: none,
    remove: z.tuple([absolutePath]),
  },
  terminal: {
    open: z.tuple([
      terminalKey,
      z.string(),
      terminalSize,
      terminalSize,
      z.object({ command: z.string().max(20_000).optional(), env: z.record(z.string(), z.string()).optional() }).optional(),
      z.object({ projectId: z.number().int().nullable(), title: z.string().max(500) }).optional(),
    ]),
    write: z.tuple([terminalKey, z.string()]),
    resize: z.tuple([terminalKey, terminalSize, terminalSize]),
    close: z.tuple([terminalKey]),
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
    setBadge: z.tuple([z.number().int().min(0).max(99999)]),
  },
  loginItem: {
    get: none,
    set: z.tuple([z.boolean()]),
  },
  diagnostics: {
    start: none,
    folders: none,
    openRoot: none,
  },
});
