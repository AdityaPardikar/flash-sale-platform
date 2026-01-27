import { FlashSale } from '../models';

export interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
}

export interface SaleSchedule {
  startsIn: TimeRemaining | null;
  endsIn: TimeRemaining | null;
  status: 'upcoming' | 'active' | 'completed';
  canStart: boolean;
  shouldEnd: boolean;
}

export class SaleTimingService {
  /**
   * Calculate time remaining until a specific date
   */
  calculateTimeRemaining(targetDate: Date): TimeRemaining {
    const now = new Date().getTime();
    const target = new Date(targetDate).getTime();
    const diff = target - now;

    if (diff <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        isExpired: true,
      };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    return {
      days,
      hours,
      minutes,
      seconds,
      totalSeconds,
      isExpired: false,
    };
  }

  /**
   * Get comprehensive schedule information for a sale
   */
  getSaleSchedule(sale: FlashSale): SaleSchedule {
    const now = new Date().getTime();
    const startTime = new Date(sale.start_time).getTime();
    const endTime = new Date(sale.end_time).getTime();

    let status: 'upcoming' | 'active' | 'completed';
    let startsIn: TimeRemaining | null = null;
    let endsIn: TimeRemaining | null = null;

    if (now < startTime) {
      // Sale hasn't started yet
      status = 'upcoming';
      startsIn = this.calculateTimeRemaining(sale.start_time);
    } else if (now >= startTime && now < endTime) {
      // Sale is currently active
      status = 'active';
      endsIn = this.calculateTimeRemaining(sale.end_time);
    } else {
      // Sale has ended
      status = 'completed';
    }

    return {
      startsIn,
      endsIn,
      status,
      canStart: now >= startTime && sale.status === 'upcoming',
      shouldEnd: now >= endTime && sale.status === 'active',
    };
  }

  /**
   * Format time remaining as human-readable string
   */
  formatTimeRemaining(time: TimeRemaining): string {
    if (time.isExpired) {
      return 'Expired';
    }

    const parts: string[] = [];

    if (time.days > 0) {
      parts.push(`${time.days}d`);
    }
    if (time.hours > 0 || time.days > 0) {
      parts.push(`${time.hours}h`);
    }
    if (time.minutes > 0 || time.hours > 0 || time.days > 0) {
      parts.push(`${time.minutes}m`);
    }
    parts.push(`${time.seconds}s`);

    return parts.join(' ');
  }

  /**
   * Check if sale should transition to active
   */
  shouldActivate(sale: FlashSale): boolean {
    const now = new Date();
    return (
      sale.status === 'upcoming' &&
      new Date(sale.start_time) <= now &&
      new Date(sale.end_time) > now
    );
  }

  /**
   * Check if sale should transition to completed
   */
  shouldComplete(sale: FlashSale): boolean {
    const now = new Date();
    return sale.status === 'active' && new Date(sale.end_time) <= now;
  }

  /**
   * Validate sale timing configuration
   */
  validateSaleTiming(
    startTime: Date,
    endTime: Date
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const now = new Date();
    const start = new Date(startTime);
    const end = new Date(endTime);

    // Check if start time is in the past
    if (start < now) {
      errors.push('Start time cannot be in the past');
    }

    // Check if end time is before start time
    if (end <= start) {
      errors.push('End time must be after start time');
    }

    // Check minimum duration (5 minutes)
    const minDuration = 5 * 60 * 1000;
    if (end.getTime() - start.getTime() < minDuration) {
      errors.push('Sale duration must be at least 5 minutes');
    }

    // Check maximum duration (7 days)
    const maxDuration = 7 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxDuration) {
      errors.push('Sale duration cannot exceed 7 days');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate sale progress percentage
   */
  calculateProgress(sale: FlashSale): number {
    const now = new Date().getTime();
    const start = new Date(sale.start_time).getTime();
    const end = new Date(sale.end_time).getTime();

    if (now < start) {
      return 0;
    }

    if (now >= end) {
      return 100;
    }

    const totalDuration = end - start;
    const elapsed = now - start;
    const progress = (elapsed / totalDuration) * 100;

    return Math.round(progress * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get sales that need state transition
   */
  getSalesNeedingStateUpdate(sales: FlashSale[]): {
    toActivate: FlashSale[];
    toComplete: FlashSale[];
  } {
    const toActivate = sales.filter((sale) => this.shouldActivate(sale));
    const toComplete = sales.filter((sale) => this.shouldComplete(sale));

    return { toActivate, toComplete };
  }

  /**
   * Check if two time windows overlap
   */
  timesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
    return start1 < end2 && end1 > start2;
  }

  /**
   * Get next scheduled sale start time
   */
  getNextSaleTime(sales: FlashSale[]): Date | null {
    const now = new Date();
    const upcomingSales = sales
      .filter((sale) => new Date(sale.start_time) > now)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    return upcomingSales.length > 0 ? new Date(upcomingSales[0].start_time) : null;
  }
}

// Export singleton instance
export const saleTimingService = new SaleTimingService();
export default saleTimingService;
