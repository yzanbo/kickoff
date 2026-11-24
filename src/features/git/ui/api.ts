// Git の API の呼び手（取り決めは @shared/git/contract.ts。作業場所は @/foundation/ui/api/workdir の workdirInput で渡す）
import { gitContract } from "@shared/git/contract";
import { client } from "@/foundation/ui/api/client";

export const gitApi = client(gitContract);
