// つなぐ前の準備（DB ワーカーの中）: 準備のコマンドを順に流し（様子は最後の 1 回分だけメモリに持ち、保存しない）、済んだ接続は
// 切るときに後片付けのコマンドを流す。パスワードを取るコマンドは、つなぐたびに流して出力をパスワードにする（出力は見せない）
import { expandPrepCommand, usesMyIp, type DbPrepVars } from "@shared/database/dbPrep";
import { errorMessage } from "@shared/errors";
import { DB_MY_IP_URL, type DbPrepKind, type DbPrepState } from "@shared/types";
import type { DbTargetCommands, WorkerEvent } from "../protocol.js";
import { fetchMyIp, runShell, type ShellRun } from "./shell.js";

/** 準備のコマンド 1 つの待ち時間（SSO のログインはブラウザでの操作を待つので長め） */
const PREPARE_TIMEOUT_MS = 10 * 60_000;
/** 後片付け・パスワードを取るコマンドの待ち時間 */
const SHORT_TIMEOUT_MS = 2 * 60_000;

export type EmitRun = (event: WorkerEvent) => void;

export function createPrep(emit: EmitRun) {
  const states = new Map<number, DbPrepState>();
  const running = new Map<number, ShellRun>();
  /** 準備が済んだ接続（切るときに流す後片付けと、埋めた値。{my_ip} は準備と後片付けで同じものを使う） */
  const prepared = new Map<number, { cleanup: string[]; vars: DbPrepVars }>();

  const record = (connectionId: number, kind: DbPrepKind, command: string, ok: boolean) => emit({ event: "prep_run", connection_id: connectionId, kind, command, ok });

  /** 後片付けを流す（準備が済んでいなければ何もしない。失敗しても残りを流す） */
  const cleanup = async (connectionId: number) => {
    const rec = prepared.get(connectionId);
    if (!rec) return;
    prepared.delete(connectionId);
    for (const command of rec.cleanup) {
      let ok = false;
      try {
        ok = (await runShell(expandPrepCommand(command, rec.vars), { timeoutMs: SHORT_TIMEOUT_MS }).done).ok;
      } catch {
        ok = false;
      }
      record(connectionId, "cleanup", command, ok);
    }
  };

  return {
    /** 準備を流し始める（待たずに返す。同じ接続で流している間は断る） */
    prepare(p: { connection_id: number; commands: string[]; cleanup: string[]; vars: DbPrepVars; my_ip_url: string | null }) {
      if (states.get(p.connection_id)?.running) throw new Error("この接続の準備はもう流れています");
      const state: DbPrepState = { running: true, steps: [], error: null, finished_at: null };
      states.set(p.connection_id, state);
      void (async () => {
        try {
          const vars: DbPrepVars = { ...p.vars };
          if (usesMyIp([...p.commands, ...p.cleanup])) vars.my_ip = await fetchMyIp(p.my_ip_url ?? DB_MY_IP_URL);
          for (const command of p.commands) {
            const step: DbPrepState["steps"][number] = { command, status: "running", output: "" };
            state.steps.push(step);
            const run = runShell(expandPrepCommand(command, vars), { timeoutMs: PREPARE_TIMEOUT_MS, onOutput: (t) => (step.output = (step.output + t).slice(-20_000)) });
            running.set(p.connection_id, run);
            const result = await run.done;
            running.delete(p.connection_id);
            step.output = result.output;
            step.status = result.ok ? "ok" : "failed";
            record(p.connection_id, "prepare", command, result.ok);
            if (!result.ok) {
              state.error = `「${command}」が失敗しました。残りのコマンドは流していません`;
              return;
            }
          }
          // 後片付けは、前の準備のものがあれば先に流してから置き換える（開けたものを閉じ忘れない）
          if (prepared.has(p.connection_id)) await cleanup(p.connection_id);
          prepared.set(p.connection_id, { cleanup: p.cleanup, vars });
        } catch (e) {
          state.error = errorMessage(e);
        } finally {
          running.delete(p.connection_id);
          state.running = false;
          state.finished_at = new Date().toISOString();
        }
      })();
      return { started: true };
    },
    state: (connectionId: number) => states.get(connectionId) ?? null,
    /** どれかの接続の準備を流しているか */
    busy: () => [...states.values()].some((s) => s.running),
    cancel(connectionId: number) {
      const run = running.get(connectionId);
      run?.kill();
      return { cancelled: Boolean(run) };
    },
    cleanup,
    /** すべての準備した接続の後片付け */
    async cleanupAll() {
      for (const id of [...prepared.keys()]) await cleanup(id);
    },
    /** {my_ip} の値（準備で取ったものがあればそれ、なければ問い合わせる） */
    async varsFor(commands: DbTargetCommands, command: string): Promise<DbPrepVars> {
      const vars: DbPrepVars = { ...commands.vars, ...prepared.get(commands.connection_id)?.vars };
      if (usesMyIp([command]) && !vars.my_ip) vars.my_ip = await fetchMyIp(commands.my_ip_url ?? DB_MY_IP_URL);
      return vars;
    },
    /** パスワードを取るコマンドを流し、標準出力をパスワードにする（出力は画面にも記録にも出さない） */
    async password(commands: DbTargetCommands): Promise<string> {
      const command = commands.password!;
      const result = await runShell(expandPrepCommand(command, await this.varsFor(commands, command)), { timeoutMs: SHORT_TIMEOUT_MS }).done;
      const password = result.stdout.trim();
      const ok = result.ok && password !== "";
      record(commands.connection_id, "password", command, ok);
      if (!ok) throw new Error("パスワードを取るコマンドが失敗しました（出力はパスワードを含むことがあるので出しません。ターミナルで流して確かめてください）");
      return password;
    },
  };
}

export type Prep = ReturnType<typeof createPrep>;
