import type { ProviderId } from "@shared/types";
import { useModels } from "@/stores/providers";
import { modelDisplayName } from "./models";

/** チャットのモデルの名前（"Opus 5.5"。そのチャットの AI のモデルの一覧で引く。メモの仕様書「0028」の G6） */
export function ModelName({ provider, model }: { provider: ProviderId; model: string }) {
  return <>{modelDisplayName(useModels(provider), model)}</>;
}
