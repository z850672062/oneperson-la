import type { Category } from '@prisma/client';
import { prisma } from '../prisma';
import {
  addDays,
  endOfDay,
  inclusiveDayCount,
  startOfDay,
  startOfWeek,
  toDateOnly,
  type DateRange
} from '../utils/date';

interface TrendPoint {
  date: string;
  created: number;
  done: number;
}

export interface DashboardSummaryResult {
  range: { from: string; to: string; label: string };
  stats: {
    created: number;
    done: number;
    doing: number;
    overdue: number;
    hours: number;
    doneHours: number;
    rate: number;
  };
  byCategory: Array<{ categoryId: string; name: string; count: number }>;
  statusDist: Array<{ key: 'running' | 'waiting' | 'overdue'; name: string; count: number }>;
  trend: TrendPoint[];
}

const WAITING_PATTERN = /反馈|谈判|待/;

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function buildDashboardSummary(range: DateRange): Promise<DashboardSummaryResult> {
  const [records, topCategories] = await Promise.all([
    prisma.record.findMany({
      where: { createdAt: { gte: startOfDay(range.from), lte: endOfDay(range.to) } },
      include: { category: { include: { parent: true } } }
    }),
    prisma.category.findMany({
      where: { parentId: null },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }]
    })
  ]);

  const todayStart = startOfDay(new Date());
  let done = 0;
  let overdue = 0;
  let running = 0;
  let waiting = 0;
  let hours = 0;
  let doneHours = 0;

  const topById = new Map<string, Category>();
  for (const category of topCategories) topById.set(category.id, category);
  const categoryCount = new Map<string, number>();
  for (const category of topCategories) categoryCount.set(category.id, 0);

  for (const record of records) {
    hours += record.hours;
    const isDone = record.status === 'done';
    const isOverdue = !isDone && Boolean(record.dueDate && record.dueDate.getTime() < todayStart.getTime());

    if (isDone) {
      done += 1;
      doneHours += record.hours;
    } else if (isOverdue) {
      overdue += 1;
    } else if (WAITING_PATTERN.test(record.sub)) {
      waiting += 1;
    } else {
      running += 1;
    }

    const top = record.category.parent ?? record.category;
    if (topById.has(top.id)) {
      categoryCount.set(top.id, (categoryCount.get(top.id) || 0) + 1);
    }
  }

  const created = records.length;
  const doing = created - done - overdue;

  const byCategory = topCategories.map((category) => ({
    categoryId: category.id,
    name: category.name,
    count: categoryCount.get(category.id) || 0
  }));

  const statusDist: DashboardSummaryResult['statusDist'] = [
    { key: 'running', name: '推进中', count: running },
    { key: 'waiting', name: '等待中', count: waiting },
    { key: 'overdue', name: '已逾期', count: overdue }
  ];

  return {
    range: { from: toDateOnly(range.from), to: toDateOnly(range.to), label: range.label },
    stats: {
      created,
      done,
      doing,
      overdue,
      hours: roundHours(hours),
      doneHours: roundHours(doneHours),
      rate: created ? Math.round((done / created) * 100) : 0
    },
    byCategory,
    statusDist,
    trend: buildTrend(records, range)
  };
}

function buildTrend(
  records: Array<{ createdAt: Date; status: string }>,
  range: DateRange
): TrendPoint[] {
  const dayCount = inclusiveDayCount(range.from, range.to);
  const daily = dayCount <= 31;

  const buckets = new Map<string, TrendPoint>();
  if (daily) {
    let cursor = startOfDay(range.from);
    while (cursor.getTime() <= range.to.getTime()) {
      const key = toDateOnly(cursor);
      buckets.set(key, { date: key, created: 0, done: 0 });
      cursor = addDays(cursor, 1);
    }
  } else {
    let cursor = startOfWeek(range.from);
    const last = startOfDay(range.to);
    while (cursor.getTime() <= last.getTime()) {
      const key = toDateOnly(cursor);
      buckets.set(key, { date: key, created: 0, done: 0 });
      cursor = addDays(cursor, 7);
    }
  }

  for (const record of records) {
    const key = daily ? toDateOnly(record.createdAt) : toDateOnly(startOfWeek(record.createdAt));
    const point = buckets.get(key);
    if (!point) continue;
    point.created += 1;
    if (record.status === 'done') point.done += 1;
  }

  return Array.from(buckets.values());
}
