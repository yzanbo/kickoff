// 画面に出すネイティブ機能（window.kickoff）の表: 土台と機能のまとまりを並べたもの（preload が window.kickoff を作り、メインが登録する）
import { FOUNDATION_IPC, type IpcTableMap } from "@shared/foundation/ipc";
import { BROWSER_IPC } from "@shared/browser/ipc";
import { DIAGNOSTICS_IPC } from "@shared/diagnostics/ipc";
import { UPDATES_IPC } from "@shared/updates/ipc";

/** 型の表（IpcTableMap）のまとまりを、値もすべて持つ（足し忘れは typecheck で分かる） */
export const NATIVE_API = { ...FOUNDATION_IPC, ...BROWSER_IPC, ...DIAGNOSTICS_IPC, ...UPDATES_IPC } as const satisfies { [G in keyof IpcTableMap]: IpcTableMap[G] };
