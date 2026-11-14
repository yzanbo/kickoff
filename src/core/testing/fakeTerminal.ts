// テスト用の偽のシェル（node-pty の代わり）。書いたものを覚え、出力・終わりを手で起こせる
import type { SpawnTerminal, TerminalProcess } from "../terminal/sessions.js";

export interface FakeTerminal extends TerminalProcess {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  written: string[];
  killed: boolean;
  /** シェルが出力したことにする */
  emit(data: string): void;
  /** シェルが終わったことにする */
  end(exitCode: number): void;
}

/** 偽のシェルを作る口と、作ったシェルの一覧 */
export function fakeTerminals() {
  const spawned: FakeTerminal[] = [];
  const spawn: SpawnTerminal = (file, args, { cols, rows, cwd, env }) => {
    const dataFns: ((d: string) => void)[] = [];
    const exitFns: ((e: { exitCode: number }) => void)[] = [];
    const t: FakeTerminal = {
      file,
      args,
      cwd,
      env,
      cols,
      rows,
      written: [],
      killed: false,
      write: (data) => void t.written.push(data),
      resize: (c, r) => Object.assign(t, { cols: c, rows: r }),
      kill: () => void (t.killed = true),
      onData: (fn) => void dataFns.push(fn),
      onExit: (fn) => void exitFns.push(fn),
      emit: (data) => dataFns.forEach((fn) => fn(data)),
      end: (exitCode) => exitFns.forEach((fn) => fn({ exitCode })),
    };
    spawned.push(t);
    return t;
  };
  return { spawn, spawned };
}
