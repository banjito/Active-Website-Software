// /portal2: trial home page. The original /portal page (logo, buttons, portal
// cards) with the Announcements + four shortcut sections swapped for one
// compact work queue (src/components/portal/PortalWorkQueue.tsx).
import PortalLanding from "@/app/portal/page";

export default function Portal2Page() {
  return <PortalLanding layout="queue" />;
}
