import { useEffect, useState } from "react";
import { appChatDefaults } from "@shared/ai/chatOptions";
import type { ChatOptionsPatch, ProviderId } from "@shared/settings/types";
import { PROVIDER_LABELS } from "@shared/settings/types";
import type { AppSettings } from "@shared/foundation/contract/settings";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { SaveActions } from "@/foundation/ui/kit/SaveActions";
import { saveProjectAiDefaults, useProjectAiDefaults } from "@/features/ai/ui/stores/projectAiDefaults";
import { ChatDefaultsFields } from "./ChatDefaultsFields";

/** 書いていないときの既定（描くたびに作らない。書き換えない） */
const NO_PATCH: ChatOptionsPatch = Object.freeze({});

/** プロジェクトの設定の「AI」: このプロジェクトの AI（provider）の新しいチャットの既定。書いていない項目はアプリの設定のその AI の既定に従う */
export function ProjectAiDefaults({ projectId, provider, app }: { projectId: number; provider: ProviderId; app: AppSettings | undefined }) {
  const saved = useProjectAiDefaults(projectId).data?.[provider] ?? NO_PATCH;
  const [draft, setDraft] = useState<ChatOptionsPatch>(saved);
  const save = useAction<"save">();
  const savedKey = JSON.stringify(saved);
  // 保存した値が変わったら（ほかの窓・AI を替えた）下書きを取り直す
  useEffect(() => setDraft(JSON.parse(savedKey) as ChatOptionsPatch), [savedKey]);

  const keys = ["model", "effort", "permission_mode", "fast_mode"] as const;
  const dirty = keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k]));
  const label = PROVIDER_LABELS[provider];

  return (
    <div className="ai-defaults">
      <h3>{label} の既定</h3>
      <p className="muted small">
        このプロジェクトの {label} の新しいチャットは、ここで決めた設定から始まります。「アプリの設定に従う」の項目は、設定画面の AI の既定（{label}）を使います。
      </p>
      <div className="form">
        <ChatDefaultsFields provider={provider} value={draft} onChange={setDraft} inherit={app ? appChatDefaults(app, provider) : null} />
        <SaveActions save={save} disabled={!dirty} onSave={() => saveProjectAiDefaults(projectId, provider, draft)} />
      </div>
    </div>
  );
}
