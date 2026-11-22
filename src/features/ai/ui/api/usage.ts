// AI ごとの使用状況の呼び手（取り決めは @shared/ai/contract.ts。読むのは ai の店 stores/usage.ts・usage/serviceUsageStore.ts だけ）
import { usageContract } from "@shared/ai/contract";
import { client } from "@/foundation/ui/api";

export const usageApi = client(usageContract);
