// チャット欄の外の画像の呼び手（取り決めは @shared/remoteImages/contract.ts。コアの受け口は core/routes/chatImages.ts）
import { remoteImagesContract } from "@shared/remoteImages/contract";
import { client } from "@/foundation/ui/api/client";

export const remoteImagesApi = client(remoteImagesContract);
