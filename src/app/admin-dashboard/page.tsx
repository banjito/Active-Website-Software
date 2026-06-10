import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { isSuperUser } from "@/lib/roles";
import {
  ShieldCheck,
  Settings,
  Users,
  ArrowLeft,
  FileText,
  Database,
  Sliders,
  LockKeyhole,
  Shield,
  Bell,
  Clock,
  Link2,
  DollarSign,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import AdminUserManagement from "@/components/admin/AdminUserManagement";
import SystemHealthMonitoring from "@/components/admin/SystemHealthMonitoring";
import { SystemLogsCard } from "@/components/admin/SystemLogsCard";
import { PortalConfiguration } from "@/components/admin/PortalConfiguration";
import { DataBackupControls } from "@/components/admin/DataBackupControls";
import { EncryptionSettings } from "@/components/admin/EncryptionSettings";
import RoleManagement from "@/components/admin/RoleManagement";
import PermissionManagement from "@/components/admin/PermissionManagement";
import NotificationDevControls from "@/components/admin/NotificationDevControls";
import InProgressDashboard from "@/components/admin/InProgressDashboard";
import IntegrationsSettings from "@/components/admin/IntegrationsSettings";
import QuickBooksDashboard from "@/components/admin/QuickBooksDashboard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { HeaderBar } from "@/components/ui/HeaderBar";

type AdminView =
  | "dashboard"
  | "userManagement"
  | "systemHealth"
  | "systemLogs"
  | "portalConfig"
  | "dataBackup"
  | "encryptionSettings"
  | "roleManagement"
  | "permissionManagement"
  | "notifDevControls"
  | "inProgressDashboard"
  | "integrations"
  | "quickbooks";

type AdminCard = {
  title: string;
  icon: LucideIcon;
  iconClassName: string;
  cardClassName: string;
  view?: Exclude<AdminView, "dashboard">;
  path?: string;
};

const adminCards: AdminCard[] = [
  {
    title: "In Progress Dashboard",
    icon: Clock,
    iconClassName: "text-cyan-700 dark:text-cyan-200",
    cardClassName:
      "border-cyan-200 bg-cyan-50/80 dark:border-cyan-900 dark:bg-cyan-950/30",
    view: "inProgressDashboard",
  },
  {
    title: "User Management",
    icon: Users,
    iconClassName: "text-indigo-700 dark:text-indigo-200",
    cardClassName:
      "border-indigo-200 bg-indigo-50/80 dark:border-indigo-900 dark:bg-indigo-950/30",
    view: "userManagement",
  },
  {
    title: "Role Management",
    icon: ShieldCheck,
    iconClassName: "text-emerald-700 dark:text-emerald-200",
    cardClassName:
      "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/30",
    view: "roleManagement",
  },
  {
    title: "Permission Management",
    icon: Shield,
    iconClassName: "text-orange-700 dark:text-orange-200",
    cardClassName:
      "border-orange-200 bg-orange-50/80 dark:border-orange-900 dark:bg-orange-950/30",
    view: "permissionManagement",
  },
  {
    title: "Notification Dev Controls",
    icon: Bell,
    iconClassName: "text-rose-700 dark:text-rose-200",
    cardClassName:
      "border-rose-200 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/30",
    view: "notifDevControls",
  },
  {
    title: "System Health",
    icon: Settings,
    iconClassName: "text-blue-700 dark:text-blue-200",
    cardClassName:
      "border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/30",
    view: "systemHealth",
  },
  {
    title: "System Logs",
    icon: FileText,
    iconClassName: "text-yellow-800 dark:text-yellow-200",
    cardClassName:
      "border-yellow-200 bg-yellow-50/80 dark:border-yellow-900 dark:bg-yellow-950/30",
    view: "systemLogs",
  },
  {
    title: "Portal Configuration",
    icon: Sliders,
    iconClassName: "text-purple-700 dark:text-purple-200",
    cardClassName:
      "border-purple-200 bg-purple-50/80 dark:border-purple-900 dark:bg-purple-950/30",
    view: "portalConfig",
  },
  {
    title: "Data Backup",
    icon: Database,
    iconClassName: "text-teal-700 dark:text-teal-200",
    cardClassName:
      "border-teal-200 bg-teal-50/80 dark:border-teal-900 dark:bg-teal-950/30",
    view: "dataBackup",
  },
  {
    title: "Encryption Settings",
    icon: LockKeyhole,
    iconClassName: "text-red-700 dark:text-red-200",
    cardClassName:
      "border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/30",
    view: "encryptionSettings",
  },
  {
    title: "Integrations",
    icon: Link2,
    iconClassName: "text-green-700 dark:text-green-200",
    cardClassName:
      "border-green-200 bg-green-50/80 dark:border-green-900 dark:bg-green-950/30",
    view: "integrations",
  },
  {
    title: "QuickBooks Dashboard",
    icon: DollarSign,
    iconClassName: "text-lime-800 dark:text-lime-200",
    cardClassName:
      "border-lime-200 bg-lime-50/80 dark:border-lime-900 dark:bg-lime-950/30",
    view: "quickbooks",
  },
  {
    title: "Custom Report Builder",
    icon: ClipboardList,
    iconClassName: "text-amber-800 dark:text-amber-200",
    cardClassName:
      "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30",
    path: "/custom-forms/templates",
  },
];

const viewTitles: Record<AdminView, string> = {
  dashboard: "Admin Dashboard",
  inProgressDashboard: "In Progress Dashboard",
  userManagement: "User Management",
  systemHealth: "System Health",
  systemLogs: "System Logs",
  portalConfig: "Portal Configuration",
  dataBackup: "Data Backup",
  encryptionSettings: "Encryption Settings",
  roleManagement: "Role Management",
  permissionManagement: "Permission Management",
  notifDevControls: "Notification Dev Controls",
  integrations: "Integrations",
  quickbooks: "QuickBooks Dashboard",
};

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<AdminView>("dashboard");

  const hasAdminAccess =
    user?.user_metadata?.role === "Admin" || isSuperUser(user?.email);

  // Redirect non-admin users
  React.useEffect(() => {
    if (user && !hasAdminAccess) {
      navigate("/portal");
    }
  }, [user, hasAdminAccess, navigate]);

  if (!user || !hasAdminAccess) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const handleBackClick = () => {
    setCurrentView("dashboard");
  };

  // Render current view based on state
  const renderView = () => {
    switch (currentView) {
      case "userManagement":
        return <AdminUserManagement />;
      case "systemHealth":
        return <SystemHealthMonitoring />;
      case "systemLogs":
        return <SystemLogsCard />;
      case "portalConfig":
        return <PortalConfiguration />;
      case "dataBackup":
        return <DataBackupControls />;
      case "encryptionSettings":
        return <EncryptionSettings />;
      case "roleManagement":
        return <RoleManagement />;
      case "permissionManagement":
        return <PermissionManagement />;
      case "notifDevControls":
        return <NotificationDevControls />;
      case "inProgressDashboard":
        return <InProgressDashboard />;
      case "integrations":
        return <IntegrationsSettings />;
      case "quickbooks":
        return <QuickBooksDashboard />;
      default:
        return renderDashboard();
    }
  };

  // Render the main dashboard cards
  const renderDashboard = () => {
    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-2 border-b border-gray-200 pb-5 dark:border-dark-300">
          <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">
            Admin Dashboard
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {adminCards.map(
            ({
              title,
              icon: Icon,
              iconClassName,
              cardClassName,
              view,
              path,
            }) => (
              <Card
                key={title}
                aria-label={title}
                role="button"
                tabIndex={0}
                className={`group cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-black/30 focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 dark:focus:ring-offset-black ${cardClassName}`}
                onClick={() =>
                  path ? navigate(path) : view && setCurrentView(view)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (path) {
                      navigate(path);
                    } else if (view) {
                      setCurrentView(view);
                    }
                  }
                }}
              >
                <CardHeader className="flex flex-row items-center p-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className={`h-6 w-6 shrink-0 ${iconClassName}`} />
                    <CardTitle className="text-2xl font-medium leading-7 text-gray-900 dark:text-white">
                      {title}
                    </CardTitle>
                  </div>
                </CardHeader>
              </Card>
            ),
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background dark:bg-dark-background">
      <div className="sticky top-0 z-30 w-full shrink-0 print:hidden border-b border-gray-200 dark:border-dark-200">
        <HeaderBar />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
          {currentView !== "dashboard" && (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={handleBackClick}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to Dashboard
              </Button>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {viewTitles[currentView]}
              </h2>
            </div>
          )}
          {renderView()}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
