// 画面から届く埋め込みブラウザの IPC の引数の形（zod）。取り決め（@shared/browser/ipc の BROWSER_IPC）の引数と同じ形にし、違えば typecheck で分かる
import { z } from "zod";
import { BROWSER_IPC } from "@shared/browser/ipc";
import type { Same } from "@shared/foundation/contract";
import { KNOWN_EXTENSIONS, type KnownExtensionKey } from "@shared/foundation/ipc";
import { absolutePath, none, positiveInt } from "@/foundation/desktop/ipc/args";
import type { ArgSchemasFor, ArgsOfTable, ZodArgsOf } from "@/foundation/desktop/ipc/register";

/** 埋め込みブラウザ（WebContents）の ID */
const webContentsId = z.number().int().nonnegative();
const coordinate = z.int32();
const inspectPoint = z.object({ x: coordinate, y: coordinate }).optional();
/** 右・下に並べた開発者ツールの置き場所（画面の CSS の px） */
const devtoolsBounds = z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative() });
const extensionKey = z.enum(Object.keys(KNOWN_EXTENSIONS) as KnownExtensionKey[]);

export const browserArgs = {
  browser: {
    copyImageAt: z.tuple([webContentsId, coordinate, coordinate]),
  },
  devtools: {
    openIn: z.tuple([webContentsId, devtoolsBounds, inspectPoint]),
    place: z.tuple([webContentsId, devtoolsBounds.nullable()]),
    snapshot: z.tuple([webContentsId]),
    openWindow: z.tuple([webContentsId, inspectPoint]),
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
} satisfies ArgSchemasFor<typeof BROWSER_IPC>;
true satisfies Same<ArgsOfTable<typeof BROWSER_IPC>, ZodArgsOf<typeof browserArgs>>;
