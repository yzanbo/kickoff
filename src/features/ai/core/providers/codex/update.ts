import fs from "node:fs/promises";
import type { ProviderUpdate } from "@shared/ai/types";
import { CODEX_INSTALL_SOURCE_LABELS, CODEX_LATEST_URLS, CODEX_UPDATE_COMMANDS, codexInstallSource, codexLatestOf, isNewer, type CodexInstallSource } from "@shared/ai/cliUpdates";
import { fetchJson, USER_AGENT } from "@/features/ai/core/providers/shared/http";

/** 最新の版を聞き直すまで（1 日に 1 回まで） */
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
/** 聞けなかったら、この間をあけて聞き直す */
const RETRY_AFTER_FAIL_MS = 60 * 60 * 1000;

interface Checked {
  at: number;
  latest: string | null;
  failed: boolean;
}

/**
 * 入れた codex に新しい版が出ているか（設定の「接続」の Codex の欄に、最新の版と上げるコマンドを出す）。
 * 最新の版は入れ方ごとに聞く先が違い（Homebrew の cask は npm より遅れて出ることがある）、入れ方が分からなければ知らせない。
 * 聞くのは入れ方ごとに 1 日 1 回まで（覚えはメモリだけ）。聞けなければ知らせず、1 時間あけて聞き直す
 */
export class CodexUpdateCheck {
  private checked = new Map<CodexInstallSource, Checked>();
  private inflight = new Map<CodexInstallSource, Promise<string | null>>();

  constructor(
    private readonly fetchLatest: (url: string) => Promise<unknown> = (url) => fetchJson(url, { headers: { "User-Agent": USER_AGENT } }),
    private readonly now: () => number = Date.now,
  ) {}

  async of(executable: string, version: string | null): Promise<ProviderUpdate | null> {
    if (!version) return null;
    const source = codexInstallSource(await fs.realpath(executable).catch(() => executable));
    if (!source) return null;
    const latest = await this.latest(source);
    return isNewer(latest, version) && latest ? { latest, command: CODEX_UPDATE_COMMANDS[source], source: CODEX_INSTALL_SOURCE_LABELS[source] } : null;
  }

  private async latest(source: CodexInstallSource): Promise<string | null> {
    const prev = this.checked.get(source);
    const age = prev ? this.now() - prev.at : Infinity;
    if (prev && age < (prev.failed ? RETRY_AFTER_FAIL_MS : CHECK_EVERY_MS)) return prev.latest;
    const running = this.inflight.get(source);
    if (running) return running;
    const job = this.fetchLatest(CODEX_LATEST_URLS[source]).then(
      (body) => {
        const latest = codexLatestOf(body);
        // 読めない答えは聞けなかったのと同じに扱う（前に読めた版は残す）
        this.checked.set(source, latest ? { at: this.now(), latest, failed: false } : { at: this.now(), latest: prev?.latest ?? null, failed: true });
        return latest ?? prev?.latest ?? null;
      },
      () => {
        this.checked.set(source, { at: this.now(), latest: prev?.latest ?? null, failed: true });
        return prev?.latest ?? null;
      },
    );
    this.inflight.set(source, job);
    try {
      return await job;
    } finally {
      this.inflight.delete(source);
    }
  }
}
