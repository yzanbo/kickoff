// 拡張点への登録（app/renderer/registry.ts が読む）: 入力欄の音声入力と音声モード
import { settingsSections } from "@/features/settings/ui";
import { composerSlots } from "@/features/composer/ui";
import { voiceSection } from "./settings/appSettings";

export const contributes = [composerSlots.item({ kind: "voice", id: "voice", load: () => import("./ComposerVoice").then((m) => m.composerVoice) }), settingsSections.item(voiceSection)];
