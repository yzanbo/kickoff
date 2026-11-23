// 本物の起動の外の世界の口（CoreOptions から作る。テストの偽物は testing/testEnv.ts）
import os from "node:os";
import path from "node:path";
import { createProviders } from "@/features/ai/core/providers/index";
import { siblingSessionCheck } from "@/features/chat/core/sessions/siblingSessions";
import { forkWorker } from "@/features/database/core/client";
import { devWorkerEntry } from "@/features/database/core/entry";
import { expoPushSender } from "@/features/devices/core/push";
import { listPullRequests } from "@/features/github/core/pulls";
import { currentSelf } from "@/features/guard/core/guard/selfProtection";
import { defaultNotesDir } from "@/features/notes/core/defaultDir";
import type { CoreEnv, CoreOptions } from "./types";

export function realEnv(opts: CoreOptions): CoreEnv {
  // エージェントが自分（このプロセス・保存先・API）を壊さないよう、自分の情報を守りに渡す
  const self = currentSelf(opts.dataDir, opts.port, opts.platform, opts.platformParts.selfGuard, opts.hostPid);
  return {
    platformParts: opts.platformParts,
    recoveredReason: opts.recoveredReason,
    secretCipher: opts.secretCipher ?? null,
    hostPid: opts.hostPid,
    browser: opts.browser,
    mcpBaseUrl: `http://127.0.0.1:${opts.port}`,
    ai: {
      providers: (authFor) => createProviders(authFor),
    },
    // 製品版と開発版は同じ ~/.claude/projects に会話記録を置く（開発版のデータは製品版から写す）ので、会話記録を片付ける前に、ほかの Kickoff が使っていないか確かめる
    chat: { sessionsElsewhere: siblingSessionCheck(opts.dataDir, opts.platform.appDataRoot) },
    trash: { installCommand: true },
    // ノートの親フォルダの既定は ~/Documents/kickoff（保存先のフォルダ名のアプリ名を空白のない小文字に。開発版は kickoff-dev で、製品版のノートに触らない）
    notes: { defaultDir: defaultNotesDir(opts.dataDir, path.join(os.homedir(), "Documents")) },
    attachments: {},
    voice: {},
    devices: {},
    notifications: { notify: opts.notify, push: opts.push ?? expoPushSender() },
    docker: {},
    ports: {},
    terminal: { env: opts.terminalEnv },
    remoteImages: {},
    github: { service: {}, ci: {}, prWatch: { listPullRequests } },
    // DB ワーカー（Electron のアプリはメインが起動する。渡されなければソースの worker を node ＋ tsx で fork）
    database: { worker: opts.dbWorker ?? (() => forkWorker(devWorkerEntry())), cleanExports: true },
    guard: { sandbox: true, relay: true, self },
  };
}
