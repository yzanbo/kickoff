// 外部のターミナル（Terminal.app・Ghostty など。選んだアプリで作業場所を開く）
import { EXTERNAL_TERMINALS, type ExternalTerminalId } from "../../core/types";
import { useSharedChoice } from "./hooks/useStoredState";
import { reportFailure } from "./runActions";
import { EXTERNAL_TERMINAL_KEY } from "./storageKeys";

const TERMINAL_IDS = EXTERNAL_TERMINALS.map((t) => t.id);

/** 外部のターミナルの表示名 */
export const terminalLabel = (id: ExternalTerminalId) => EXTERNAL_TERMINALS.find((t) => t.id === id)?.label ?? id;

/**
 * 選んでいる外部のターミナル（設定の「ターミナル」で選ぶ。どの部品にもすぐ伝わる）と、そのアプリでフォルダを開く関数。
 * 開けなければお知らせで出す
 */
export function useExternalTerminal() {
  const [terminal, setTerminal] = useSharedChoice<ExternalTerminalId>(EXTERNAL_TERMINAL_KEY, TERMINAL_IDS, "terminal");
  const open = (dir: string) => void window.kickoff?.openExternalTerminal(dir, terminal).catch(reportFailure("ターミナルを開けませんでした"));
  return { terminal, setTerminal, label: terminalLabel(terminal), open };
}
