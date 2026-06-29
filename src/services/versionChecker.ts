// Automatic version checker - notifies users when a new version is deployed
// so they can refresh on their own terms (no surprise auto-reload)
import { toast } from "../components/ui/toast";

interface VersionInfo {
  version: string;
  timestamp: string;
}

export class VersionChecker {
  private static instance: VersionChecker;
  private currentVersion: string | null = null;
  private checkInterval: number = 5 * 60 * 1000; // Check every 5 minutes
  private intervalId: NodeJS.Timeout | null = null;
  private isChecking = false;
  private updateNotified = false;

  private constructor() {
    this.initialize();
  }

  static getInstance(): VersionChecker {
    if (!VersionChecker.instance) {
      VersionChecker.instance = new VersionChecker();
    }
    return VersionChecker.instance;
  }

  private async initialize() {
    // Get current version on startup
    this.currentVersion = await this.fetchVersion();

    // Start periodic checking
    this.startPeriodicCheck();

    // Also check when window regains focus
    window.addEventListener("focus", () => {
      this.checkForUpdate();
    });
  }

  private async fetchVersion(): Promise<string | null> {
    try {
      // Add timestamp to prevent caching of the version file itself
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-cache",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (response.ok) {
        const data: VersionInfo = await response.json();
        return data.version;
      }
    } catch (error) {
      console.warn("Could not fetch version info:", error);
    }
    return null;
  }

  private startPeriodicCheck() {
    // Clear any existing interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    // Check for updates periodically
    this.intervalId = setInterval(() => {
      this.checkForUpdate();
    }, this.checkInterval);
  }

  private async checkForUpdate() {
    // Prevent concurrent checks
    if (this.isChecking) return;

    this.isChecking = true;

    try {
      const latestVersion = await this.fetchVersion();

      if (!latestVersion || !this.currentVersion) {
        this.isChecking = false;
        return;
      }

      // If versions don't match, we have an update
      if (latestVersion !== this.currentVersion) {
        console.log(
          "New version detected:",
          latestVersion,
          "Current:",
          this.currentVersion,
        );
        this.handleUpdate(latestVersion);
      }
    } catch (error) {
      console.warn("Error checking for updates:", error);
    } finally {
      this.isChecking = false;
    }
  }

  private handleUpdate(newVersion: string) {
    // Stop checking - we only need to notify once per session
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Avoid stacking duplicate toasts (e.g. focus event firing repeatedly)
    if (this.updateNotified) return;
    this.updateNotified = true;

    console.log("New version available:", newVersion);

    // Show a persistent toast and let the user refresh when they're ready.
    // Never reload out from under them - they may be mid-task.
    toast({
      title: "Hey! Refresh the page to update ampOS!",
      variant: "info",
      persistent: true,
      action: {
        label: "Refresh now",
        onClick: () => window.location.reload(),
      },
    });
  }

  // Allow manual check from dev tools or admin panel
  public manualCheck() {
    return this.checkForUpdate();
  }

  // Expose for debugging
  public getCurrentVersion(): string | null {
    return this.currentVersion;
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Auto-start on import
export const versionChecker = VersionChecker.getInstance();

// Expose to window for debugging
if (typeof window !== "undefined") {
  (window as any).versionChecker = versionChecker;
}
