import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Briefcase, FileText, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { useBranding } from "@/lib/BrandingContext";
import { getCompany } from "@/services/portalData";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { CompanyMenu } from "@/components/CompanyMenu";
import { AccountMenu } from "@/components/AccountMenu";

const navItems = [
  { to: "/jobs", label: "My Jobs", icon: Briefcase },
  { to: "/reports", label: "Reports", icon: FileText },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { customerId } = useAuth();
  const { logoUrl, setBranding } = useBranding();

  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;
    void getCompany()
      .then((company) => {
        if (cancelled) return;
        setBranding({
          logoUrl: company?.logo_url ?? null,
          primaryColor: company?.brand_primary ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setBranding({ logoUrl: null, primaryColor: null });
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, setBranding]);

  return (
    <div className="relative min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-card/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:h-20">
          <NavLink
            to="/jobs"
            className="flex min-w-0 shrink items-center gap-2.5 sm:gap-3"
            aria-label="ampOS ACCESS home"
          >
            <Logo className="h-7 shrink-0 translate-y-[5px] text-foreground transition-colors hover:text-primary sm:h-9" />
            {logoUrl && (
              <>
                <span
                  className="h-7 w-px shrink-0 bg-border sm:h-9"
                  aria-hidden
                />
                <img
                  src={logoUrl}
                  alt="Company logo"
                  className="h-7 max-w-[7rem] shrink object-contain sm:h-9 sm:max-w-[10rem]"
                />
              </>
            )}
          </NavLink>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <nav className="hidden items-center gap-5 sm:flex">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-2 px-3.5 py-2 text-sm font-medium transition-all duration-300 ease-spring",
                      isActive
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )
                  }
                >
                  <Icon className="h-4 w-4 transition-transform duration-300 ease-spring group-hover:scale-110" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2 sm:pl-4">
              <ThemeToggle />
              <a
                href="mailto:jack@ampos.io"
                aria-label="Support"
                title="Support"
                className="inline-flex h-9 w-9 items-center justify-center border border-border bg-card/60 text-muted-foreground transition-all duration-300 ease-spring hover:scale-105 hover:border-primary/40 hover:text-foreground active:scale-95"
              >
                <MessageCircleQuestion className="h-[18px] w-[18px]" />
              </a>
              <CompanyMenu />
              <AccountMenu />
            </div>
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="flex items-center gap-1 border-t border-border/60 px-4 py-2 sm:hidden">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main
        key={location.pathname}
        className="mx-auto max-w-6xl animate-fade-in px-4 py-6 sm:py-8"
      >
        {children}
      </main>
    </div>
  );
}
