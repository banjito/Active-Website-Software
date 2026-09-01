import React from "react";
import {
  Users,
  Banknote,
  Plane,
  HeartHandshake,
  Truck,
  AlertTriangle,
  ClipboardList,
  ExternalLink,
} from "lucide-react";
import { companyConfig } from "@/lib/companyConfig";
import { toast } from "@/components/ui/toast";

/** Latin cross, drawn to lucide's 24x24 / 2px-stroke grid. Lucide's own
 *  `Cross` is the symmetric medical plus, not the Christian cross. */
const LatinCross: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 3h4v5h5v4h-5v9h-4v-9H5V8h5z" />
  </svg>
);

interface EmployeeLinksSubmenuProps {
  onClose: () => void;
}

interface LinkItem {
  label: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Side panel off the profile menu with the outside services employees need
 * (payroll, travel, benefits, fleet). Every destination comes from
 * companyConfig so buyer instances can point them at their own vendors; an
 * empty value hides that row.
 */
export const EmployeeLinksSubmenu: React.FC<EmployeeLinksSubmenuProps> = ({
  onClose,
}) => {
  const links: LinkItem[] = [
    { label: "My Pay", url: companyConfig.paycheckUrl, icon: Banknote },
    { label: "Travel", url: companyConfig.travelUrl, icon: Plane },
    { label: "Benefits", url: companyConfig.benefitsUrl, icon: HeartHandshake },
    { label: "Fleetio", url: companyConfig.fleetUrl, icon: Truck },
    {
      label: companyConfig.employeeAssistanceLabel,
      url: companyConfig.employeeAssistanceFormUrl,
      icon: LatinCross,
    },
    {
      label: "Report Vehicle Accident",
      url: companyConfig.vehicleAccidentFormUrl,
      icon: AlertTriangle,
    },
    {
      label: "Incident Report",
      url: companyConfig.incidentReportFormUrl,
      icon: ClipboardList,
    },
  ].filter((link) => !!link.url);

  const copyHrEmail = async () => {
    const email = companyConfig.hrSupportEmail;
    try {
      await navigator.clipboard.writeText(email);
      toast({
        title: "HR email copied.",
        description: email,
        variant: "success",
        duration: 2000,
      });
    } catch {
      toast({
        title: "Could not copy HR email.",
        description: email,
        variant: "destructive",
      });
    }
    onClose();
  };

  const openLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      className="w-64 max-w-[calc(100vw-2rem)] max-h-[min(32rem,calc(100vh-6rem))] overflow-y-auto rounded-none bg-white dark:bg-dark-150 shadow-lg ring-1 ring-black ring-opacity-5 z-50"
      role="menu"
      aria-label="Employee Links"
    >
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700">
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">
          Employee Links
        </p>
      </div>

      <div className="py-1">
        {companyConfig.hrSupportEmail && (
          <button
            type="button"
            onClick={copyHrEmail}
            className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
          >
            <Users className="mr-3 h-5 w-5 shrink-0 text-neutral-400 dark:text-brand" />
            HR Support
            <span className="ml-auto text-xs text-neutral-400 dark:text-dark-400">
              Copy email
            </span>
          </button>
        )}

        {links.map(({ label, url, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => openLink(url)}
            className="flex items-center w-full px-4 py-2 text-sm text-neutral-700 dark:text-brand hover:bg-neutral-100 dark:hover:bg-dark-50"
          >
            <Icon className="mr-3 h-5 w-5 shrink-0 text-neutral-400 dark:text-brand" />
            {label}
            <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-400 dark:text-dark-400" />
          </button>
        ))}
      </div>
    </div>
  );
};
