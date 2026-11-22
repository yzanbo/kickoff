// プロジェクトの AI ごとのチャットの既定の呼び手（取り決めは @shared/ai/contract.ts）
import { aiDefaultsContract } from "@shared/ai/contract";
import { client } from "@/foundation/ui/api";

export const aiDefaultsApi = client(aiDefaultsContract);
