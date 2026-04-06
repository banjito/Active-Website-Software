// Automatic version checker - forces reload when new version is deployed
// This ensures users NEVER need to manually clear cache

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
    window.addEventListener('focus', () => {
      this.checkForUpdate();
    });
  }

  private async fetchVersion(): Promise<string | null> {
    try {
      // Add timestamp to prevent caching of the version file itself
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const data: VersionInfo = await response.json();
        return data.version;
      }
    } catch (error) {
      console.warn('Could not fetch version info:', error);
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
        console.log('New version detected:', latestVersion, 'Current:', this.currentVersion);
        this.handleUpdate(latestVersion);
      }
    } catch (error) {
      console.warn('Error checking for updates:', error);
    } finally {
      this.isChecking = false;
    }
  }

  private handleUpdate(newVersion: string) {
    // Stop checking
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Check if user might have unsaved work
    const hasUnsavedWork = this.checkForUnsavedWork();
    
    if (hasUnsavedWork) {
      // User has unsaved work - wait and check again in 30 seconds
      console.log('Update available but user has unsaved work. Will retry in 30 seconds.');
      setTimeout(() => {
        this.handleUpdate(newVersion);
      }, 30 * 1000);
    } else {
      // Safe to reload - do it silently without notification
      console.log('Applying update silently...');
      window.location.reload();
    }
  }

  private checkForUnsavedWork(): boolean {
    // Check various indicators of active work
    
    // 1. Check for form inputs with content (not just the search bar)
    const inputs = document.querySelectorAll('input[type="text"], textarea');
    const hasInputContent = Array.from(inputs).some((input: any) => {
      // Ignore search bars and filters
      const isSearchOrFilter = input.name?.includes('search') || 
                               input.placeholder?.toLowerCase().includes('search') ||
                               input.id?.includes('search');
      return !isSearchOrFilter && input.value && input.value.length > 0;
    });

    // 2. Check URL for edit/create/new pages
    const url = window.location.pathname.toLowerCase();
    const isWorkingPage = url.includes('/edit') || 
                          url.includes('/new') || 
                          url.includes('/create') ||
                          url.includes('/estimate') ||
                          url.includes('/opportunity/') ||
                          url.includes('/letter-proposal');

    // 3. Check for any modals/dialogs open (using common dialog classes)
    const hasOpenModal = document.querySelector('[role="dialog"]') !== null ||
                        document.querySelector('.modal') !== null ||
                        document.querySelector('[data-headlessui-state="open"]') !== null;

    return hasInputContent || isWorkingPage || hasOpenModal;
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
if (typeof window !== 'undefined') {
  (window as any).versionChecker = versionChecker;
}


