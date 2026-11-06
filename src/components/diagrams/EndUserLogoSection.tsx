import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { prepareUpload } from "@/lib/diagrams/symbolUpload";
import {
  fetchCustomerChoices,
  fetchDiagramSiteSettings,
  saveDiagramSiteSettings,
  type CustomerChoice,
} from "@/services/siteDiagramsService";

interface EndUserLogoSectionProps {
  siteId: string;
  userId: string | null;
}

/** Whose logo prints on this site's drawings, whoever the job's customer is. */
export default function EndUserLogoSection({ siteId, userId }: EndUserLogoSectionProps) {
  /** Null when the database can't store this yet. */
  const [ready, setReady] = useState(false);
  const [customers, setCustomers] = useState<CustomerChoice[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchDiagramSiteSettings(siteId), fetchCustomerChoices()])
      .then(([settings, choices]) => {
        if (cancelled || settings === null) return;
        setCustomers(choices);
        setCustomerId(settings.end_user_customer_id ?? "");
        setLogo(settings.end_user_logo);
        setReady(true);
      })
      .catch((error) => console.error("Failed to load the end-user logo:", error));
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!ready) return null;

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLogo((await prepareUpload(file)).dataUrl);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveDiagramSiteSettings(siteId, customerId || null, customerId ? null : logo, userId);
      toast.success("End-user logo saved.");
    } catch (error) {
      console.error("Failed to save the end-user logo:", error);
      toast.error("The end-user logo couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">End-user logo</h3>
      <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
        Prints in the title block. If the job's customer is the same company, it prints once.
      </p>
      <Select
        aria-label="End-user customer"
        value={customerId}
        onChange={(event) => setCustomerId(event.target.value)}
        options={[
          { value: "", label: "Not a customer: upload a logo" },
          ...customers.map((customer) => ({ value: customer.id, label: customer.name })),
        ]}
      />
      {!customerId && (
        <div className="mb-2 flex items-center gap-3">
          <input
            type="file"
            aria-label="End-user logo file"
            accept=".svg,.png,image/svg+xml,image/png"
            className="text-sm"
            onChange={(event) => void onFile(event)}
          />
          {logo && <img src={logo} alt="End-user logo" className="h-10 max-w-[8rem] object-contain" />}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </section>
  );
}
