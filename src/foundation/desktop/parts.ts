// メインプロセスの機能の部品の形（機能の desktop/index.ts が出し、src/app/desktop/index.ts が土台へ渡す。土台は機能を読まない）
import type { CoreProcess, HostHandlers } from "@/foundation/desktop/app/coreProcess";
import type { IpcHandlers } from "@/foundation/desktop/ipc/register";

/** 機能が出すメインの部品 */
export interface DesktopPart {
  name: string;
  /** その部品の IPC の処理（まとまり → 名前 → 処理） */
  ipc?: Partial<IpcHandlers>;
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
