// メインプロセスの OS ごとに違う処理の口（デスクトップのアプリだけで使うもの。コアと共通のものは core/platform の HostPlatform）
import type { ExternalBrowserId, ExternalTerminalId } from "@shared/ipc";

/** メインプロセスの OS ごとに違う処理 */
export interface DesktopPlatform {
  /** 入っている外部のターミナル */
  installedTerminals: () => ExternalTerminalId[];
  /** 外部のターミナルでフォルダを開く */
  openTerminal: (id: ExternalTerminalId, dir: string) => Promise<void>;
  /** 入っている外部のブラウザ */
  installedBrowsers: () => ExternalBrowserId[];
  /** 外部のブラウザでページを開く（url がなければアプリを開くだけ。開けなければ失敗） */
  openBrowser: (id: ExternalBrowserId, url?: string) => Promise<void>;
  /** コマンドが、開発中の Electron のアプリのメインプロセスか（終わるときに子の Electron を先に止めるため。Helper は含まない） */
  isDevElectronMain: (command: string) => boolean;
}
