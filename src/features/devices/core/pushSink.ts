// スマホのプッシュの届け先（通知の機能に登録する）: プッシュの宛先を登録した端末のうち、その知らせを見ていない端末へ送る
import type { NoticeSink } from "@/features/notifications/core/index";
import type { DeviceStore } from "./db/devices";
import type { PushSender } from "./push";

/** 送れなくても、ほかの端末・この Mac の通知は止めない。宛先がもう使えなければ表から外す（その間に端末が登録し直していれば、新しい宛先は残す） */
export function pushSink({ devices, sender, hostId }: { devices: DeviceStore; sender: PushSender; hostId: string }): NoticeSink {
  return {
    name: "push",
    deliver(notice, seen) {
      for (const device of devices.list()) {
        const push = device.has_push && !seen(device.id) ? devices.push(device.id) : null;
        if (!push) continue;
        void sender.send(push, { ...notice.push, host_id: hostId, target: notice.target }).then(
          (result) => result === "gone" && JSON.stringify(devices.push(device.id)) === JSON.stringify(push) && devices.setPush(device.id, null),
          (e: unknown) => console.warn("[notifications] プッシュを送れません:", e),
        );
      }
    },
  };
}
