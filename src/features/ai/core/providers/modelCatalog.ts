import type { ModelOption } from "@shared/ai/types";
import type { ProviderId } from "@shared/settings/types";
import type { AgentProvider } from "./types";

/** モデルの一覧を覚えておく時間（取るのに 1 秒ほどかかるので 1 時間はとっておく。空の結果は覚えない） */
const MODEL_CATALOG_TTL_MS = 60 * 60_000;

const cached = new WeakMap<AgentProvider, { at: number; models: ModelOption[] }>();

/** その AI のモデルの一覧（チャット欄の一覧と、一覧にないモデルを外す守りで共通。取れなければ空） */
export async function providerModels(provider: AgentProvider, now: () => number = Date.now): Promise<ModelOption[]> {
  const hit = cached.get(provider);
  if (hit && now() - hit.at < MODEL_CATALOG_TTL_MS) return hit.models;
  const models = (await provider.models?.().catch(() => [])) ?? [];
  if (models.length > 0) cached.set(provider, { at: now(), models });
  return models;
}

/**
 * その AI のモデルの一覧にない名前を外す（null = その AI の既定で動かす）。
 * Claude Code の名前は Claude Code の一覧で選ぶので、ほかの AI に渡ると知らない名前として断られる。
 * Claude Code は一覧の外の名前（版付きの ID など）も受け付け、知らない名前は自分で断るので触らない。一覧が取れなければ触らない
 */
export async function knownModel(id: ProviderId, provider: AgentProvider, model: string | null): Promise<string | null> {
  if (!model || id === "claude") return model;
  const models = await providerModels(provider);
  if (models.length === 0) return model;
  return models.some((m) => m.value === model) ? model : null;
}
