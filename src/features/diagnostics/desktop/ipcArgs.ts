// 画面から届く診断の IPC の引数の形（zod）。取り決め（@shared/diagnostics/ipc の DIAGNOSTICS_IPC）の引数と同じ形にし、違えば typecheck で分かる
import { z } from "zod";
import { DIAGNOSTICS_IPC } from "@shared/diagnostics/ipc";
import type { Same } from "@shared/foundation/contract";
import { BOOT_MARKS, BOOT_WINDOWS } from "@shared/foundation/ipc";
import { none } from "@/foundation/desktop/ipc/args";
import type { ArgSchemasFor, ArgsOfTable, ZodArgsOf } from "@/foundation/desktop/ipc/register";

export const diagnosticsArgs = {
  diagnostics: {
    start: none,
    folders: none,
    openRoot: none,
    overview: none,
    openLogs: none,
    reportBoot: z.tuple([
      z.object({
        window: z.enum(BOOT_WINDOWS),
        timeOrigin: z.number(),
        marks: z.partialRecord(z.enum(BOOT_MARKS), z.number().nullable()),
        assets: z.object({ count: z.number(), refetched: z.number(), encodedKB: z.number() }).nullable(),
      }),
    ]),
    reportMemory: z.tuple([z.object({ window: z.enum(BOOT_WINDOWS), jsHeapMB: z.number().nullable(), domNodes: z.number() })]),
  },
} satisfies ArgSchemasFor<typeof DIAGNOSTICS_IPC>;
true satisfies Same<ArgsOfTable<typeof DIAGNOSTICS_IPC>, ZodArgsOf<typeof diagnosticsArgs>>;
