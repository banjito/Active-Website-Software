import { useState } from "react";
import { Download, Eye, Files, Mail } from "lucide-react";
import {
  getPacketCoverDownloadUrl,
  getPacketFullDownloadUrl,
  type Deliverable,
} from "@/services/portalData";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Action = "view" | "download";

const KINDS = {
  cover: {
    title: "Cover Letter",
    subtitle: "Sent with this packet",
    file: "Cover Letter",
    Icon: Mail,
    getUrl: getPacketCoverDownloadUrl,
  },
  full: {
    title: "Full Packet",
    subtitle: "Cover letter and every report in one PDF",
    file: "Full Packet",
    Icon: Files,
    getUrl: getPacketFullDownloadUrl,
  },
} as const;

/**
 * A packet-level row at the top of a Report Packet: the cover letter, or the
 * single merged "full packet" PDF. Styled like ReportRow.
 */
export function PacketCoverRow({
  packet,
  kind = "cover",
}: {
  packet: Deliverable;
  kind?: keyof typeof KINDS;
}) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const k = KINDS[kind];

  async function open(action: Action) {
    setBusy(action);
    setError(null);
    try {
      const url = await k.getUrl(packet.id);
      const fileName = `${packet.name ?? "Report Packet"} - ${k.file}.pdf`;
      const finalUrl =
        action === "download"
          ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`
          : url;
      window.open(finalUrl, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not open ${k.title.toLowerCase()}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="group border bg-card p-3 shadow-soft transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <k.Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{k.title}</div>
            <div className="text-xs text-muted-foreground">{k.subtitle}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => open("view")}
            disabled={busy !== null}
            title="View"
            aria-label={`View ${k.title.toLowerCase()}`}
          >
            {busy === "view" ? <Spinner /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => open("download")}
            disabled={busy !== null}
            title="Download"
            aria-label={`Download ${k.title.toLowerCase()}`}
          >
            {busy === "download" ? <Spinner /> : <Download className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
