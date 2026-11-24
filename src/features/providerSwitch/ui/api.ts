// AI の切り替えの API の呼び手（取り決めは @shared/providerSwitch/contract.ts）
import { providerSwitchContract } from "@shared/providerSwitch/contract";
import { client } from "@/foundation/ui/api/client";

export const providerSwitchApi = client(providerSwitchContract);
