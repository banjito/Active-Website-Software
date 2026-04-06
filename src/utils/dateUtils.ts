/**
 * Date utility functions for the application
 */

import { format, differenceInDays, differenceInMonths, parseISO, isValid } from 'date-fns';

/**
 * Format a date string to a readable format
 */
export function formatDate(dateString: string): string {
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    if (!isValid(date)) {
      return 'Invalid date';
    }
    return format(date, 'MMM d, yyyy');
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

/**
 * Calculate the time elapsed as a percentage between start and end dates
 */
export function getTimeElapsedPercentage(startDate: string, endDate: string): number {
  try {
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
    const now = new Date();
    
    if (!isValid(start) || !isValid(end)) {
      return 0;
    }
    
    const totalDuration = differenceInDays(end, start);
    const elapsedDuration = differenceInDays(now, start);
    
    if (totalDuration <= 0) {
      return 100;
    }
    
    // If the end date is in the past, return 100%
    if (now > end) {
      return 100;
    }
    
    // If the start date is in the future, return 0%
    if (now < start) {
      return 0;
    }
    
    return Math.min(100, Math.max(0, (elapsedDuration / totalDuration) * 100));
  } catch (error) {
    console.error('Error calculating time elapsed percentage:', error);
    return 0;
  }
}

/**
 * Calculate days remaining until the end date
 */
export function getDaysRemaining(endDate: string): number {
  try {
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
    const now = new Date();
    
    if (!isValid(end)) {
      return 0;
    }
    
    // If the end date is in the past, return 0
    if (now > end) {
      return 0;
    }
    
    return differenceInDays(end, now);
  } catch (error) {
    console.error('Error calculating days remaining:', error);
    return 0;
  }
}

/**
 * Calculate months between two dates
 */
export function getMonthsBetween(startDate: string, endDate: string): number {
  try {
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
    
    if (!isValid(start) || !isValid(end)) {
      return 0;
    }
    
    return differenceInMonths(end, start);
  } catch (error) {
    console.error('Error calculating months between dates:', error);
    return 0;
  }
}

/**
 * Helper function to determine if a string represents a valid date
 */
export function isValidDateString(dateString: string): boolean {
  if (!dateString) return false;
  
  try {
    const date = parseISO(dateString);
    return isValid(date);
  } catch (error) {
    return false;
  }
}

/**
 * Determines if a date is in the past
 * @param dateString ISO date string
 * @returns True if the date is in the past, false otherwise
 */
export function isDatePast(dateString: string): boolean {
  return new Date(dateString) < new Date();
}

/**
 * Parse a date string (YYYY-MM-DD) as a local date, not UTC
 * This prevents timezone issues where dates appear one day off
 * @param dateString Date string in YYYY-MM-DD format
 * @returns Date object in local timezone
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date string (YYYY-MM-DD) as a local date string
 * This prevents timezone issues where dates appear one day off
 * @param dateString Date string in YYYY-MM-DD format or null
 * @returns Formatted date string or '-' if null
 */
export function formatLocalDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const date = parseLocalDate(dateString);
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error formatting local date:', error);
    return 'Invalid date';
  }
}

/**
 * Format a date-only string (YYYY-MM-DD) as MM/DD/YYYY in local time.
 * Use this for calibration dates and any date-only values to avoid the off-by-one
 * day bug (UTC midnight becoming previous day in US timezones).
 * @param dateString ISO date or date-only string, or null/undefined
 * @returns MM/DD/YYYY or '' if empty/invalid
 */
export function formatLocalDateShort(dateString: string | null | undefined): string {
  if (dateString == null || String(dateString).trim() === '') return '';
  try {
    const s = String(dateString).trim();
    const dateOnly = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      const date = parseLocalDate(dateOnly);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const date = parseLocalDate(dateOnly);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    }
    const date = parseISO(s);
    if (!isValid(date)) return '';
    return format(date, 'MM/dd/yyyy');
  } catch {
    return '';
  }
} 