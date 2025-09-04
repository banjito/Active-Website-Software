/**
 * Global Keyboard Navigation Utility
 * Provides arrow key navigation and Enter key functionality for all input fields
 */

interface NavigableElement {
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  row: number;
  col: number;
}

class KeyboardNavigationManager {
  private navigableElements: NavigableElement[] = [];
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private init() {
    if (this.isInitialized) return;
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupGlobalNavigation());
    } else {
      this.setupGlobalNavigation();
    }
    
    this.isInitialized = true;
  }

  private setupGlobalNavigation() {
    // Set up a MutationObserver to handle dynamically added elements
    const observer = new MutationObserver(() => {
      this.refreshNavigableElements();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['type', 'disabled', 'readonly']
    });

    // Initial setup
    this.refreshNavigableElements();
    
    // Add global event listener
    document.addEventListener('keydown', this.handleGlobalKeyDown.bind(this));
  }

  private refreshNavigableElements() {
    // Clear existing elements
    this.navigableElements = [];

    // Find all navigable input elements
    const selectors = [
      'input[type="text"]',
      'input[type="number"]',
      'input[type="email"]',
      'input[type="password"]',
      'input[type="date"]',
      'input[type="time"]',
      'input[type="datetime-local"]',
      'input[type="tel"]',
      'input[type="url"]',
      'input[type="search"]',
      'textarea',
      'select'
    ];

    const elements = document.querySelectorAll(selectors.join(', ')) as NodeListOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
    
    elements.forEach((element) => {
      // Skip disabled, readonly, or hidden elements
      const isReadOnly = (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.readOnly;
      if (element.disabled || isReadOnly || element.style.display === 'none' || element.hidden) {
        return;
      }

      // Skip elements that are not visible
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return;
      }

      const position = this.calculatePosition(element);
      this.navigableElements.push({
        element,
        row: position.row,
        col: position.col
      });
    });

    // Sort elements by row, then by column
    this.navigableElements.sort((a, b) => {
      if (a.row !== b.row) {
        return a.row - b.row;
      }
      return a.col - b.col;
    });
  }

  private calculatePosition(element: HTMLElement): { row: number; col: number } {
    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // Calculate row and column based on position
    // Using a grid system where each 50px vertically is a new row
    // and each 100px horizontally is a new column
    const row = Math.floor((rect.top + scrollTop) / 50);
    const col = Math.floor((rect.left + scrollLeft) / 100);
    
    return { row, col };
  }

  private handleGlobalKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    
    // Only handle navigation for input elements
    if (!this.isNavigableElement(target)) {
      return;
    }

    const currentElement = target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const currentIndex = this.navigableElements.findIndex(item => item.element === currentElement);
    
    if (currentIndex === -1) {
      // Element not found, refresh and try again
      this.refreshNavigableElements();
      return;
    }

    const currentItem = this.navigableElements[currentIndex];
    let targetElement: HTMLElement | null = null;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        targetElement = this.findElementInDirection(currentItem, 'right');
        break;
        
      case 'ArrowLeft':
        event.preventDefault();
        targetElement = this.findElementInDirection(currentItem, 'left');
        break;
        
      case 'ArrowDown':
        event.preventDefault();
        targetElement = this.findElementInDirection(currentItem, 'down');
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        targetElement = this.findElementInDirection(currentItem, 'up');
        break;
        
      case 'Enter':
        event.preventDefault();
        targetElement = this.findNextElement(currentIndex);
        break;
        
      default:
        return;
    }

    if (targetElement) {
      targetElement.focus();
      
      // Select all text for input elements (but not for selects)
      if (targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement) {
        targetElement.select();
      }
    }
  }

  private isNavigableElement(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    const type = (element as HTMLInputElement).type?.toLowerCase();
    
    return (
      (tagName === 'input' && [
        'text', 'number', 'email', 'password', 'date', 'time', 
        'datetime-local', 'tel', 'url', 'search'
      ].includes(type)) ||
      tagName === 'textarea' ||
      tagName === 'select'
    );
  }

  private findElementInDirection(currentItem: NavigableElement, direction: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
    const { row, col } = currentItem;
    let bestMatch: NavigableElement | null = null;
    let bestDistance = Infinity;

    for (const item of this.navigableElements) {
      if (item.element === currentItem.element) continue;

      let isValidDirection = false;
      let distance = 0;

      switch (direction) {
        case 'right':
          isValidDirection = item.col > col && Math.abs(item.row - row) <= 2;
          distance = Math.abs(item.col - col) + Math.abs(item.row - row) * 0.5;
          break;
          
        case 'left':
          isValidDirection = item.col < col && Math.abs(item.row - row) <= 2;
          distance = Math.abs(col - item.col) + Math.abs(item.row - row) * 0.5;
          break;
          
        case 'down':
          isValidDirection = item.row > row;
          distance = Math.abs(item.row - row) + Math.abs(item.col - col) * 0.5;
          break;
          
        case 'up':
          isValidDirection = item.row < row;
          distance = Math.abs(row - item.row) + Math.abs(item.col - col) * 0.5;
          break;
      }

      if (isValidDirection && distance < bestDistance) {
        bestMatch = item;
        bestDistance = distance;
      }
    }

    return bestMatch?.element || null;
  }

  private findNextElement(currentIndex: number): HTMLElement | null {
    // Find the next element in the sorted order
    const nextIndex = currentIndex + 1;
    if (nextIndex < this.navigableElements.length) {
      return this.navigableElements[nextIndex].element;
    }
    
    // If at the end, wrap to the beginning
    if (this.navigableElements.length > 0) {
      return this.navigableElements[0].element;
    }
    
    return null;
  }

  // Public method to manually refresh elements (useful for dynamic content)
  public refresh() {
    this.refreshNavigableElements();
  }

  // Public method to disable navigation temporarily
  public disable() {
    document.removeEventListener('keydown', this.handleGlobalKeyDown.bind(this));
  }

  // Public method to re-enable navigation
  public enable() {
    document.addEventListener('keydown', this.handleGlobalKeyDown.bind(this));
  }
}

// Create and export a singleton instance
export const keyboardNavigation = new KeyboardNavigationManager();

// Export the class for advanced usage
export { KeyboardNavigationManager };

// Auto-initialize when the module is imported
export default keyboardNavigation; 