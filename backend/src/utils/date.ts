export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function parseDateInput(value: string): Date {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dayMatch) {
    const year = Number(dayMatch[1]);
    const month = Number(dayMatch[2]);
    const day = Number(dayMatch[3]);
    const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) {
      throw new Error(`非法日期：${value}`);
    }
    return parsed;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`非法日期：${value}`);
  }
  return parsed;
}

export function startOfWeek(date: Date): Date {
  const base = startOfDay(date);
  const offset = (base.getDay() + 6) % 7; // 周一为一周起点
  return addDays(base, -offset);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function startOfQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
}

export function endOfQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999);
}

export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

export function endOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

export type PeriodKey = 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type ReportType = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

export function inclusiveDayCount(from: Date, to: Date): number {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1;
}

export function isoWeekNumber(date: Date): number {
  const target = startOfDay(date);
  const dayNumber = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNumber = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNumber + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

const quarterNames = ['第一季度', '第二季度', '第三季度', '第四季度'];

export function buildPeriodRange(
  period: PeriodKey,
  options: { from?: string; to?: string } = {},
  base = new Date()
): DateRange {
  if (period === 'custom') {
    const from = options.from ? parseDateInput(options.from) : startOfDay(base);
    const to = options.to ? parseDateInput(options.to) : startOfDay(base);
    if (from.getTime() > to.getTime()) {
      throw new Error('起始日期不能晚于结束日期');
    }
    return {
      from: startOfDay(from),
      to: endOfDay(to),
      label: `${toDateOnly(from)} 至 ${toDateOnly(to)}`
    };
  }

  if (period === 'week') {
    const from = startOfWeek(base);
    const to = endOfDay(addDays(from, 6));
    return { from, to, label: `${from.getFullYear()} 年第 ${isoWeekNumber(from)} 周` };
  }

  if (period === 'month') {
    const from = startOfMonth(base);
    const to = endOfMonth(base);
    return { from, to, label: `${from.getFullYear()} 年 ${from.getMonth() + 1} 月` };
  }

  if (period === 'quarter') {
    const from = startOfQuarter(base);
    const to = endOfQuarter(base);
    return {
      from,
      to,
      label: `${from.getFullYear()} 年${quarterNames[Math.floor(from.getMonth() / 3)]}`
    };
  }

  const from = startOfYear(base);
  const to = endOfYear(base);
  return { from, to, label: `${from.getFullYear()} 年` };
}

export function buildReportRange(
  type: ReportType,
  options: { period?: string; from?: string; to?: string } = {},
  base = new Date()
): DateRange {
  if (options.from) {
    const from = parseDateInput(options.from);
    const to = options.to ? parseDateInput(options.to) : from;
    if (from.getTime() > to.getTime()) {
      throw new Error('起始日期不能晚于结束日期');
    }
    return {
      from: startOfDay(from),
      to: endOfDay(to),
      label: `${toDateOnly(from)} 至 ${toDateOnly(to)}`
    };
  }

  let anchor = base;
  if (options.period) {
    const period = options.period.trim();
    if (/^\d{4}-\d{2}$/.test(period)) {
      anchor = new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 1);
    } else {
      anchor = parseDateInput(period);
    }
  }

  if (type === 'day') {
    const from = startOfDay(anchor);
    return {
      from,
      to: endOfDay(anchor),
      label: `${from.getFullYear()} 年 ${from.getMonth() + 1} 月 ${from.getDate()} 日`
    };
  }

  if (type === 'week') {
    const from = startOfWeek(anchor);
    return {
      from,
      to: endOfDay(addDays(from, 6)),
      label: `${from.getFullYear()} 年第 ${isoWeekNumber(from)} 周`
    };
  }

  if (type === 'month') {
    const from = startOfMonth(anchor);
    return {
      from,
      to: endOfMonth(anchor),
      label: `${from.getFullYear()} 年 ${from.getMonth() + 1} 月`
    };
  }

  if (type === 'quarter') {
    const from = startOfQuarter(anchor);
    return {
      from,
      to: endOfQuarter(anchor),
      label: `${from.getFullYear()} 年${quarterNames[Math.floor(from.getMonth() / 3)]}`
    };
  }

  const from = startOfYear(anchor);
  return { from, to: endOfYear(anchor), label: `${from.getFullYear()} 年` };
}

export function formatDateTime(date: Date): string {
  return `${toDateOnly(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
