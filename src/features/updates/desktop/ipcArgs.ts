// 画面から届く更新の IPC の引数の形（zod）。取り決め（@shared/updates/ipc の UPDATES_IPC）の引数と同じ形にし、違えば typecheck で分かる
import { UPDATES_IPC } from "@shared/updates/ipc";
import type { Same } from "@shared/foundation/contract";
import { none } from "@/foundation/desktop/ipc/args";
import type { ArgSchemasFor, ArgsOfTable, ZodArgsOf } from "@/foundation/desktop/ipc/register";

export const updatesArgs = {
  updates: {
    snapshot: none,
    check: none,
    install: none,
    cancelInstall: none,
    skip: none,
  },
} satisfies ArgSchemasFor<typeof UPDATES_IPC>;
true satisfies Same<ArgsOfTable<typeof UPDATES_IPC>, ZodArgsOf<typeof updatesArgs>>;
