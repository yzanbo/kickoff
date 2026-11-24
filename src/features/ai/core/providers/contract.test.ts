// プロバイダーの適合テスト: どの AI でも同じに振る舞うこと（7 つの筋書き）を、4 つの adapter（偽の Claude SDK・偽の codex app-server・偽の Copilot クライアント・偽の ACP のエージェント）で確かめる
import { test } from "vitest";
import { PROVIDER_ADAPTERS } from "@/features/ai/core/testing/providerAdapters";
import { PROVIDER_SCENARIOS } from "./testing/contract";

for (const a of PROVIDER_ADAPTERS) for (const s of PROVIDER_SCENARIOS) test(`${a.id}: ${s.name}`, () => s.run(a));
