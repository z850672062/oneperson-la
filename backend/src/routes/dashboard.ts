import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { validationError } from '../utils/errors';
import { buildPeriodRange } from '../utils/date';
import { buildDashboardSummary } from '../services/dashboardService';

export const dashboardRouter = Router();

const querySchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year', 'custom']).default('week'),
  from: z.string().optional(),
  to: z.string().optional()
});

dashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query);
    if (query.period === 'custom' && (!query.from || !query.to)) {
      throw validationError('自定义周期必须提供 from 与 to');
    }

    let range;
    try {
      range = buildPeriodRange(query.period, { from: query.from, to: query.to });
    } catch (error) {
      throw validationError(error instanceof Error ? error.message : '日期区间无效');
    }

    const summary = await buildDashboardSummary(range);
    res.status(200).json(summary);
  })
);
