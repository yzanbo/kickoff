// スマホ連携の API の呼び手（取り決めは @shared/devices/contract.ts。コアの受け口は core/routes/devices.ts）
import { devicesContract } from "@shared/devices/contract";
import { client } from "@/foundation/ui/api/client";

export const devicesApi = client(devicesContract);
