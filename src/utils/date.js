const { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfDay,
  endOfDay,
  parseISO,
  isValid,
  addMonths,
  subMonths
} = require('date-fns');

/**
 * Date manipulation utilities
 */
class DateUtil {
  /**
   * Format date to string
   */
  static formatDate(date, pattern = 'yyyy-MM-dd') {
    const d = new Date(date);
    if (!isValid(d)) return null;
    return format(d, pattern);
  }

  /**
   * Format date to datetime string
   */
  static formatDateTime(date, pattern = 'yyyy-MM-dd HH:mm:ss') {
    const d = new Date(date);
    if (!isValid(d)) return null;
    return format(d, pattern);
  }

  /**
   * Get start of month
   */
  static getMonthStart(date = new Date()) {
    return startOfMonth(new Date(date));
  }

  /**
   * Get end of month
   */
  static getMonthEnd(date = new Date()) {
    return endOfMonth(new Date(date));
  }

  /**
   * Get start of day
   */
  static getDayStart(date = new Date()) {
    return startOfDay(new Date(date));
  }

  /**
   * Get end of day
   */
  static getDayEnd(date = new Date()) {
    return endOfDay(new Date(date));
  }

  /**
   * Parse ISO date string
   */
  static parseDate(dateString) {
    try {
      return parseISO(dateString);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current month in YYYY-MM-DD format (first day of month)
   */
  static getCurrentMonth() {
    return format(startOfMonth(new Date()), 'yyyy-MM-dd');
  }

  /**
   * Get previous month
   */
  static getPreviousMonth(date = new Date()) {
    return subMonths(new Date(date), 1);
  }

  /**
   * Get next month
   */
  static getNextMonth(date = new Date()) {
    return addMonths(new Date(date), 1);
  }

  /**
   * Check if date is valid
   */
  static isValidDate(date) {
    return isValid(new Date(date));
  }
}

module.exports = DateUtil;
