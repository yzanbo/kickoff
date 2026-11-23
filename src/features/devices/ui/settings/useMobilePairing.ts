import type { Device, DeviceAccess, PairingState } from "@shared/devices/types";
import { pairingLink } from "@shared/devices/pairing";
import { devicesApi } from "@/features/devices/ui/api";
import { useServerEvent } from "@/foundation/ui/api/events";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { useQuery } from "@/foundation/ui/query";
import { confirm } from "@/foundation/ui/kit/ask";

/** QR の画像（data: の PNG）を作る。qrcode は使うときだけ読み込む */
const qrDataUrl = (text: string) => import("qrcode").then(({ toDataURL }) => toDataURL(text, { margin: 1, width: 360, errorCorrectionLevel: "M" }));

/** QR の画像（data: の PNG。文が変わったら作り直し、作り終えるまでは null） */
function useQrImage(text: string | null): string | null {
  return useQuery(text === null ? null : ["useMobilePairing.qr", text], () => qrDataUrl(text!)).data ?? null;
}

/**
 * 設定の「スマホ連携」の様子と操作: ペアリング（番号・QR・確かめを待っている頼み）と、つないだ端末の一覧。
 * 様子はサーバーの知らせ（pairing / devices）でその場で直す
 */
export function useMobilePairing() {
  const pairing = useQuery("useMobilePairing.pairing", () => devicesApi("GET /api/pairing"));
  const devices = useQuery("useMobilePairing.devices", () => devicesApi("GET /api/devices"));
  const action = useAction<"start" | "cancel" | "approve" | "deny" | "revoke" | "access">();
  const state = pairing.data;

  useServerEvent(["pairing", "devices"], (e) => {
    if (e.type === "pairing") pairing.setData(e.state);
    if (e.type === "devices") devices.reload();
  });

  const link = state?.code ? pairingLink(state.url, state.code, state.host_id) : null;
  const qr = useQrImage(link);

  const set = (next: PairingState) => pairing.setData(next);
  return {
    state,
    devices: devices.data ?? ([] as Device[]),
    link,
    qr,
    action,
    start: () => action.run("start", async () => set(await devicesApi("POST /api/pairing"))),
    cancel: () => action.run("cancel", async () => set(await devicesApi("DELETE /api/pairing"))),
    approve: (id: string, access: DeviceAccess) => action.run("approve", async () => set(await devicesApi("POST /api/pairing/requests/:requestId/approve", { params: { requestId: id }, body: { access } }))),
    setAccess: (device: Device, access: DeviceAccess) => action.run("access", () => devicesApi("PATCH /api/devices/:deviceId", { params: { deviceId: device.id }, body: { access } })),
    deny: (id: string) => action.run("deny", async () => set(await devicesApi("POST /api/pairing/requests/:requestId/deny", { params: { requestId: id } }))),
    revoke: async (device: Device) => {
      const ok = await confirm({
        title: `「${device.name}」を取り消しますか？`,
        message: "この端末は、もうこの Mac の Kickoff につなげなくなります。もう一度使うときは、つなぎ直してください。",
        confirmLabel: "取り消す",
        danger: true,
      });
      if (ok) await action.run("revoke", () => devicesApi("DELETE /api/devices/:deviceId", { params: { deviceId: device.id } }));
    },
  };
}
