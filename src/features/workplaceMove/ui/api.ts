// 作業場所の移動の API の呼び手（取り決めは @shared/workplaceMove/contract.ts）
import { workplaceMoveContract } from "@shared/workplaceMove/contract";
import { client } from "@/foundation/ui/api/client";

export const workplaceMoveApi = client(workplaceMoveContract);
