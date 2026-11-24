// 作業を止める前の、裏の作業も止まることの確かめ（ダイアログ。文は backgroundText.ts）
import { confirm } from "@/foundation/ui/kit/ask";
import type { BackgroundState } from "@shared/ai/turnEvents";
import { stopAgentsText } from "./backgroundText";

/**
 * 作業を止める前に、裏で動いているサブエージェント・コマンドも止まることを確かめる（なければそのまま true）。
 * runningAgents: サブエージェントの一覧の行から数えた動いている数（裏の作業の一覧の知らせがまだないときに使う）
 */
export function confirmStopAgents(background: BackgroundState | null, runningAgents: number, action: string): Promise<boolean> {
  const text = stopAgentsText(background, runningAgents, action);
  return !text ? Promise.resolve(true) : confirm({ ...text, danger: true }).then((r) => r !== null);
}
