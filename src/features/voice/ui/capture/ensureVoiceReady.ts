// 音声入力・音声モードを始める前の準備の確かめ（マイクのボタンと音声モードで同じ）
import type { VoiceStatus } from "@shared/voice/types";
import { openSettings } from "@/features/settings/ui";
import { voiceStatusStore } from "@/features/voice/ui/store";

/**
 * 準備ができているか（取ってある状態が古いこともあるので、できていなければ取り直して確かめる）。できていなければ設定の「音声入力」を開いて false。
 * openaiTts なら OpenAI の声の API キーも要る。待つ間に頼みが取り下げられた（wanted が false）なら、設定を開かずに false
 */
export async function ensureVoiceReady(status: VoiceStatus | undefined, { openaiTts = false, wanted = () => true }: { openaiTts?: boolean; wanted?: () => boolean } = {}): Promise<boolean> {
  const fresh = status?.ready ? status : await voiceStatusStore.reload().catch(() => undefined);
  if (!wanted()) return false;
  if (fresh?.ready && (!openaiTts || fresh.openai.key_saved)) return true;
  openSettings("voice");
  return false;
}
