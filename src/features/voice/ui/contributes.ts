// 拡張点への登録（app/renderer/registry.ts が読む）: 入力欄の音声入力と音声モード
import { composerSlots } from "@/features/composer/ui";
import { useComposerFieldVoice, useComposerVoiceMode } from "./composerVoice";

export const contributes = [composerSlots.item({ kind: "voice", useField: useComposerFieldVoice, useMode: useComposerVoiceMode })];
