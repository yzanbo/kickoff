import { appChatDefaults } from "@shared/ai/chatOptions";
import type { ChatOptionsPatch, ProviderId } from "@shared/settings/types";
import { PROVIDER_LABELS } from "@shared/settings/types";
import type { AppSettings } from "@shared/foundation/contract/settings";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { saveProjectAiDefaults, useProjectAiDefaults } from "@/features/ai/ui/stores/projectAiDefaults";
import { ChatDefaultsFields } from "./ChatDefaultsFields";

/** 書いていないときの既定（描くたびに作らない。書き換えない） */
const NO_PATCH: ChatOptionsPatch = Object.freeze({});

/**
 * プロジェクトの設定の「AI」: このプロジェクトの AI（provider）の新しいチャットの既定（owner は説明の持ち主「このプロジェクト」「共通」）。書いていない項目はアプリの設定のその AI の既定に従う。
 * 変えたらすぐ保存する（ほかの窓・AI を替えて変わったら、店の値をそのまま出す）
 */
export function ProjectAiDefaults({ projectId, owner, provider, app }: { projectId: number; owner: string; provider: ProviderId; app: AppSettings | undefined }) {
  const saved = useProjectAiDefaults(projectId).data?.[provider] ?? NO_PATCH;
  const label = PROVIDER_LABELS[provider];
  const change = (next: ChatOptionsPatch) => void saveProjectAiDefaults(projectId, provider, next).catch(reportFailure("設定を保存できませんでした"));

  return (
    <div className="ai-defaults">
      <h3>{label} の既定</h3>
      <p className="muted small">
        {owner}の {label} の新しいチャットは、ここで決めた設定から始まります。「アプリの設定に従う」の項目は、設定画面の AI の既定（{label}）を使います。
      </p>
      <div className="form">
        <ChatDefaultsFields provider={provider} value={saved} onChange={change} inherit={app ? appChatDefaults(app, provider) : null} />
      </div>
    </div>
  );
}
