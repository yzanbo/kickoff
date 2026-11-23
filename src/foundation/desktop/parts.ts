// メインプロセスの部品の形（土台の部品と機能の desktop/index.ts が出し、src/app/desktop/index.ts が mergeParts で並べて土台へ渡す。土台は機能を読まない）
import type { MenuItemConstructorOptions } from "electron";
import type { CoreProcess, HostHandlers } from "@/foundation/desktop/app/coreProcess";
import type { IpcArgSchemas, IpcHandlers } from "@/foundation/desktop/ipc/register";

/** メインの部品（土台・コアの帯・機能） */
export interface DesktopPart {
  name: string;
  /** その部品の IPC の処理（まとまり → 名前 → 処理） */
  ipc?: Partial<IpcHandlers>;
  /** IPC の引数の形（zod。ipc と同じまとまり。型と zod の一致は各 ipcArgs の Same で確かめる） */
  argSchemas?: Partial<IpcArgSchemas>;
  /** アプリのメニューの「ヘルプ」に足す項目 */
  menu?: MenuItemConstructorOptions[];
  /** コア → メインの RPC の処理（browser.* など） */
  hostMethods?: Partial<HostHandlers>;
  /** 起動の初め、窓を作る前に呼ぶ（webview の守り・見張りなど） */
  start?(): void;
  /** コアのプロセスを作ったら呼ぶ（コアからの知らせを受ける） */
  connectCore?(core: CoreProcess): void;
  /** コアの準備ができ、画面のセッションを置いたあとに呼ぶ */
  ready?(): void;
}

/** 部品を定める（渡した形のまま返す。ipc・hostMethods のまとまりの型を呼ぶ側が読めるように） */
export const defineDesktopPart = <P extends DesktopPart>(part: P): P => part;

/** 並べた部品を合わせたもの（start・connectCore・ready は呼ぶ側が並び順に呼ぶ） */
export interface MergedParts {
  ipc: IpcHandlers;
  argSchemas: IpcArgSchemas;
  hostMethods: Partial<HostHandlers>;
  menu: MenuItemConstructorOptions[];
}

/** 表を 1 つに合わせる（同じキーが 2 つの部品にあれば投げる = 起動のときに分かる） */
function mergeTables(parts: readonly DesktopPart[], pick: (p: DesktopPart) => object | undefined, what: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const owner = new Map<string, string>();
  for (const part of parts) {
    for (const [key, value] of Object.entries(pick(part) ?? {})) {
      const before = owner.get(key);
      if (before) throw new Error(`${what} の ${key} を ${before} と ${part.name} の 2 つが出しています`);
      owner.set(key, part.name);
      out[key] = value;
    }
  }
  return out;
}

/** 部品を並び順に合わせる（IPC のまとまり・引数の形・RPC の名前が重なれば投げる。メニューの項目は並び順につなぐ）。全部のまとまりがそろったかは登録のときに確かめる */
export function mergeParts(parts: readonly DesktopPart[]): MergedParts {
  return {
    ipc: mergeTables(parts, (p) => p.ipc, "IPC のまとまり") as IpcHandlers,
    argSchemas: mergeTables(parts, (p) => p.argSchemas, "IPC の引数の形") as IpcArgSchemas,
    hostMethods: mergeTables(parts, (p) => p.hostMethods, "コアから呼ばれる口") as Partial<HostHandlers>,
    menu: parts.flatMap((p) => p.menu ?? []),
  };
}
