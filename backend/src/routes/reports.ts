import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { notFound, validationError } from '../utils/errors';
import { buildReportRange, type ReportType } from '../utils/date';
import { generateReportMarkdown } from '../services/reportService';
import { serializeReport } from '../services/serializers';

export const reportsRouter = Router();

const generateSchema = z.object({
  type: z.enum(['day', 'week', 'month', 'quarter', 'year']),
  period: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

reportsRouter.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const body = generateSchema.parse(req.body);
    let range;
    try {
      range = buildReportRange(body.type as ReportType, {
        period: body.period,
        from: body.from,
        to: body.to
      });
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : '报表区间无效');
    }

    const { title, markdown } = await generateReportMarkdown(body.type as ReportType, range);
    const report = await prisma.report.create({
      data: {
        type: body.type,
        title,
        rangeFrom: range.from,
        rangeTo: range.to,
        markdown
      }
    });
    res.status(201).json({ report: serializeReport(report) });
  })
);

reportsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [items, total] = await Promise.all([
      prisma.report.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.report.count()
    ]);
    res.status(200).json({ items: items.map(serializeReport), total });
  })
);

reportsRouter.get(
  '/:id/export',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) throw notFound('报表不存在');
    const filename = `report-${report.id}.md`;
    const encodedTitle = encodeURIComponent(`${report.title}.md`);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedTitle}`
    );
    res.status(200).send(report.markdown);
  })
);

reportsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) throw notFound('报表不存在');
    res.status(200).json({ report: serializeReport(report) });
  })
);
