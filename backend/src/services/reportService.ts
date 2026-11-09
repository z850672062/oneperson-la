import { prisma } from '../prisma';
import { addDays, formatDateTime, startOfDay, toDateOnly, type DateRange, type ReportType } from '../utils/date';
import { buildDashboardSummary } from './dashboardService';

const reportTitles: Record<ReportType, string> = {
  day: '工作日报',
  week: '工作周报',
  month: '工作月报',
  quarter: '工作季报',
  year: '工作年报'
};

function mdCell(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export async function generateReportMarkdown(type: ReportType, range: DateRange) {
  const [summary, records] = await Promise.all([
    buildDashboardSummary(range),
    prisma.record.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      include: { category: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    })
  ]);

  const title = `${range.label}${reportTitles[type]}`;
  const today = startOfDay(new Date());
  const soon = startOfDay(addDays(today, 3));
  const lines: string[] = [];

  const hoursByTop = new Map<string, number>();
  for (const record of records) {
    const top = record.category;
    hoursByTop.set(top.id, (hoursByTop.get(top.id) || 0) + record.hours);
  }

  lines.push(`# ${title}`, '');
  lines.push(`> 统计区间：${toDateOnly(range.from)} 至 ${toDateOnly(range.to)}  `);
  lines.push(`> 生成时间：${formatDateTime(new Date())}`, '');

  lines.push('## 一、汇总概览', '');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | --- |');
  lines.push(`| 新增工作 | ${summary.stats.created} 项 |`);
  lines.push(`| 办结 | ${summary.stats.done} 项 |`);
  lines.push(`| 在办 | ${summary.stats.doing} 项 |`);
  lines.push(`| 逾期 | ${summary.stats.overdue} 项 |`);
  lines.push(`| 投入工时 | ${summary.stats.hours} 小时 |`);
  lines.push(`| 办结工时 | ${summary.stats.doneHours} 小时 |`);
  lines.push(`| 办结率 | ${summary.stats.rate}% |`, '');

  lines.push('## 二、分类工作量', '');
  lines.push('| 分类 | 记录数 | 工时（小时） |');
  lines.push('| --- | --- | --- |');
  for (const category of summary.byCategory) {
    lines.push(
      `| ${mdCell(category.name)} | ${category.count} | ${Math.round((hoursByTop.get(category.categoryId) || 0) * 100) / 100} |`
    );
  }
  lines.push('');

  lines.push('## 三、事项明细', '');
  if (!records.length) {
    lines.push('区间内暂无工作记录。', '');
  } else {
    lines.push('| 事项 | 分类 | 状态 | 风险 | 截止日期 | 工时 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const record of records) {
      const path = record.category.name;
      lines.push(
        `| ${mdCell(record.name)} | ${mdCell(path)} | ${record.status === 'done' ? '办结' : record.status === 'overdue' ? '逾期' : '在办'} | ${mdCell(record.risk)} | ${record.dueDate ? toDateOnly(record.dueDate) : '—'} | ${record.hours} |`
      );
    }
    lines.push('');
  }

  lines.push('## 四、风险与提醒', '');
  const overdue = records
    .filter(
      (record) =>
        record.status === 'overdue' ||
        (record.status !== 'done' && record.dueDate && record.dueDate.getTime() < today.getTime())
    )
    .sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));
  const dueSoon = records.filter(
    (record) =>
      record.status !== 'done' &&
      record.dueDate &&
      record.dueDate.getTime() >= today.getTime() &&
      record.dueDate.getTime() <= soon.getTime()
  );
  const highRisk = records.filter((record) => record.status !== 'done' && record.risk === '高');

  if (!overdue.length && !dueSoon.length && !highRisk.length) {
    lines.push('- 区间内无逾期、临期或高风险未结事项。');
  } else {
    for (const record of overdue) {
      lines.push(`- 逾期：${record.name}（截止 ${record.dueDate ? toDateOnly(record.dueDate) : '—'}，风险 ${record.risk}）`);
    }
    for (const record of dueSoon) {
      lines.push(`- 临期：${record.name}（截止 ${record.dueDate ? toDateOnly(record.dueDate) : '—'}）`);
    }
    for (const record of highRisk) {
      lines.push(`- 高风险：${record.name}（${record.sub || '待推进'}）`);
    }
  }
  lines.push('');

  lines.push('## 五、下阶段建议', '');
  const suggestions: string[] = [];
  if (overdue.length) {
    suggestions.push(`优先清理 ${overdue.length} 项逾期事项，逐项确认对方反馈与内部审批卡点，避免风险累积。`);
  }
  if (dueSoon.length) {
    suggestions.push(`未来 3 天有 ${dueSoon.length} 项临期事项，建议预留整块时间集中处理并提前同步相关方。`);
  }
  if (summary.byCategory.length) {
    const top = [...summary.byCategory].sort((a, b) => b.count - a.count)[0];
    if (top.count > 0) {
      suggestions.push(`${top.name}为区间内工作量最大的分类（${top.count} 项），可沉淀模板或清单，降低重复审查成本。`);
    }
  }
  if (summary.stats.rate < 60) {
    suggestions.push(`当前办结率 ${summary.stats.rate}%，建议按截止日期排序推进，必要时缩小在办并行数量。`);
  } else {
    suggestions.push(`当前办结率 ${summary.stats.rate}%，节奏良好，可把经验整理进知识库以复用。`);
  }
  suggestions.push('复盘本周高耗时事项，将可复用的审查要点补充到个人知识库，并更新记忆画像。');
  suggestions.forEach((suggestion, index) => lines.push(`${index + 1}. ${suggestion}`));
  lines.push('');

  return { title, markdown: lines.join('\n') };
}
