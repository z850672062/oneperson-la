import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DatePicker, Modal, Select, Spin } from 'antd'
import {
  DownloadOutlined,
  FileTextOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { getSummary, type DashboardPeriod } from '../api/dashboard'
import { exportReport, generateReport, type ReportType } from '../api/reports'
import { apiErrorMessage } from '../api/client'
import { toastError, toastSuccess } from '../api/notify'
import { downloadBlob, todayStamp } from '../utils/download'
import { formatHours, formatRange } from '../utils/format'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import CategoryBars from '../components/CategoryBars'
import StatusDist from '../components/StatusDist'
import EmptyState from '../components/EmptyState'
import LoadError from '../components/LoadError'
import MarkdownDoc from '../components/MarkdownDoc'
import type { DashboardSummary, Report } from '../types'

const TrendChart = lazy(() => import('../components/TrendChart'))

const PERIODS: Array<{ key: DashboardPeriod; label: string }> = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '本季度' },
  { key: 'year', label: '今年' },
  { key: 'custom', label: '自定义' },
]

const REPORT_TYPES: Array<{ value: ReportType; label: string }> = [
  { value: 'day', label: '日报' },
  { value: 'week', label: '周报' },
  { value: 'month', label: '月报' },
  { value: 'quarter', label: '季报' },
  { value: 'year', label: '年报' },
]

function reportTypeOf(period: DashboardPeriod): ReportType {
  if (period === 'month') return 'month'
  if (period === 'quarter') return 'quarter'
  if (period === 'year') return 'year'
  return 'week'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<DashboardPeriod>('week')
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState<ReportType>('week')
  const [report, setReport] = useState<Report | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSummary({
        period,
        from: period === 'custom' ? customRange?.[0].format('YYYY-MM-DD') : undefined,
        to: period === 'custom' ? customRange?.[1].format('YYYY-MM-DD') : undefined,
      })
      setSummary(data)
    } catch (loadError) {
      setError(apiErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [period, customRange])

  useEffect(() => {
    if (period === 'custom' && !customRange) return
    void load()
  }, [load, period, customRange])

  const stats = summary?.stats
  const trend = useMemo(() => summary?.trend ?? [], [summary])
  const trendEmpty = !trend.length || trend.every((item) => !item.created && !item.done)
  const doneRate =
    stats && stats.rate > 0 && stats.rate <= 1 ? stats.rate * 100 : stats?.rate ?? 0
  const hoursShare =
    stats && stats.hours > 0 ? Math.round((stats.doneHours / stats.hours) * 100) : 0

  const onPeriodClick = (key: DashboardPeriod) => {
    if (key === 'custom') {
      setDraftRange(customRange)
      setRangeOpen(true)
      return
    }
    setPeriod(key)
  }

  const confirmCustomRange = () => {
    if (!draftRange) {
      toastError('请选择自定义日期区间')
      return
    }
    setCustomRange(draftRange)
    setPeriod('custom')
    setRangeOpen(false)
  }

  const openReport = () => {
    setReport(null)
    setReportError(null)
    setReportType(reportTypeOf(period))
    setReportOpen(true)
  }

  const generate = async () => {
    setReportLoading(true)
    setReportError(null)
    try {
      const result = await generateReport({
        type: reportType,
        period: period === 'custom' ? undefined : period,
        from: period === 'custom' ? customRange?.[0].format('YYYY-MM-DD') : undefined,
        to: period === 'custom' ? customRange?.[1].format('YYYY-MM-DD') : undefined,
      })
      setReport(result)
      toastSuccess('报表已生成')
    } catch (generateError) {
      setReportError(apiErrorMessage(generateError))
    } finally {
      setReportLoading(false)
    }
  }

  const downloadReport = async (target: Report) => {
    const blob = await exportReport(target.id)
    const safeTitle = target.title.replace(/[\\/:*?"<>|]/g, '-')
    downloadBlob(blob, `${safeTitle}-${todayStamp()}.md`)
  }

  const quickExport = async () => {
    setExporting(true)
    try {
      const result = await generateReport({
        type: reportTypeOf(period),
        period: period === 'custom' ? undefined : period,
        from: period === 'custom' ? customRange?.[0].format('YYYY-MM-DD') : undefined,
        to: period === 'custom' ? customRange?.[1].format('YYYY-MM-DD') : undefined,
      })
      await downloadReport(result)
      toastSuccess('Markdown 已导出')
    } catch (exportError) {
      toastError(apiErrorMessage(exportError))
    } finally {
      setExporting(false)
    }
  }

  return (
    <main>
      <PageHeader
        title="工作汇总"
        range={summary ? formatRange(summary.range) : '加载中…'}
        actions={
          <>
            <Button icon={<MessageOutlined />} onClick={() => navigate('/chat')}>
              知识助手
            </Button>
            <Button type="primary" icon={<FileTextOutlined />} onClick={openReport}>
              生成报表
            </Button>
          </>
        }
      />

      <div className="page-content">
        <div className="chips" role="group" aria-label="统计周期">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip${period === item.key ? ' on' : ''}`}
              aria-pressed={period === item.key}
              onClick={() => onPeriodClick(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && !summary ? <LoadError message="工作汇总加载失败" description={error} onRetry={() => void load()} /> : null}

        {loading && !summary ? (
          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
              <Spin />
              <div className="card-note" style={{ marginTop: 10 }}>
                正在加载工作汇总…
              </div>
            </div>
          </div>
        ) : null}

        {summary && stats ? (
          <>
            <div className="stats-grid">
              <StatCard
                label="新增工作"
                value={stats.created}
                unit="项"
                hint="期内受理的全部事项"
                tone="blue"
              />
              <StatCard
                label="办结"
                value={stats.done}
                unit="项"
                hint={`结案率 ${Math.round(doneRate)}%`}
                hintTone={doneRate >= 60 ? 'ok' : undefined}
                tone="green"
              />
              <StatCard
                label="在办"
                value={stats.doing}
                unit="项"
                hint={`含 ${stats.overdue} 项已逾期`}
                hintTone={stats.overdue > 0 ? 'bad' : undefined}
                tone="amber"
              />
              <StatCard
                label="逾期"
                value={stats.overdue}
                unit="项"
                hint={stats.overdue > 0 ? '存在逾期事项，请优先处理' : '无逾期，状态良好'}
                hintTone={stats.overdue > 0 ? 'bad' : 'ok'}
                tone="red"
              />
              <StatCard
                label="投入工时"
                value={formatHours(stats.hours)}
                unit="h"
                hint={`办结 ${formatHours(stats.doneHours)}h · 占比 ${hoursShare}%`}
                tone="indigo"
              />
            </div>

            <div className="dash-grid">
              <div className="card">
                <div className="card-head">
                  <span className="card-title">分类工作量</span>
                  <span className="card-note">本周期按分类计数</span>
                </div>
                <CategoryBars items={summary.byCategory} />
                <div className="card-foot">
                  合计 {stats.created} 项 · 平均每项 {formatHours(stats.created ? stats.hours / stats.created : 0)}h
                </div>
              </div>

              <div className="card">
                <div className="card-head">
                  <span className="card-title">在办状态分布</span>
                  <span className="card-note">按当前状态归类</span>
                </div>
                <StatusDist items={summary.statusDist} />
                <div className="card-foot">
                  {stats.overdue > 0
                    ? `另有 ${stats.overdue} 项逾期，请优先处理`
                    : '当前无逾期事项，节奏正常'}
                </div>
              </div>
            </div>

            <div className="card trend-card">
              <div className="card-head">
                <span className="card-title">工作量走势</span>
                <div className="legend" aria-hidden="true">
                  <span>
                    <i style={{ background: '#41719c' }} />
                    新增
                  </span>
                  <span>
                    <i style={{ background: '#b98f45' }} />
                    办结
                  </span>
                </div>
              </div>
              {trendEmpty ? (
                <EmptyState
                  title="本周期暂无走势数据"
                  description="记录工作并办结后，这里会按日展示新增与办结趋势"
                />
              ) : (
                <div className="chart-shell">
                  <Suspense fallback={<div className="chart-skeleton" />}>
                    <TrendChart data={trend} />
                  </Suspense>
                </div>
              )}
              <div className="card-foot">按日统计，数据来自真实工作记录</div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div
                className="card-foot"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span>报表由当前筛选区间自动汇总，可直接导出 Markdown 归档。</span>
                <div className="page-actions">
                  <Button
                    icon={<DownloadOutlined />}
                    loading={exporting}
                    onClick={() => void quickExport()}
                  >
                    导出 Markdown
                  </Button>
                  <Button type="primary" onClick={openReport}>
                    生成周报
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <Modal
        open={rangeOpen}
        title="自定义统计区间"
        width={420}
        onCancel={() => setRangeOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setRangeOpen(false)}>
            取消
          </Button>,
          <Button key="ok" type="primary" onClick={confirmCustomRange}>
            应用
          </Button>,
        ]}
      >
        <div style={{ padding: '10px 0 18px' }}>
          <label htmlFor="custom-range" className="record-label">
            <b>选择起止日期</b>
          </label>
          <DatePicker.RangePicker
            id="custom-range"
            style={{ width: '100%' }}
            value={draftRange}
            allowClear={false}
            format="YYYY-MM-DD"
            onChange={(value) => setDraftRange(value as [Dayjs, Dayjs] | null)}
          />
          <div className="field-hint">用于统计新增、办结、在办、逾期与工时。</div>
        </div>
      </Modal>

      <Modal
        open={reportOpen}
        title="生成报表"
        width={760}
        onCancel={() => setReportOpen(false)}
        footer={[
          <Button key="close" onClick={() => setReportOpen(false)}>
            关闭
          </Button>,
          <Button
            key="export"
            icon={<DownloadOutlined />}
            disabled={!report}
            onClick={() => {
              if (report) void downloadReport(report)
            }}
          >
            导出 Markdown
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0 14px' }}>
          <Select
            aria-label="报表类型"
            style={{ width: 140 }}
            value={reportType}
            options={REPORT_TYPES}
            onChange={(value) => setReportType(value)}
          />
          <Button type="primary" loading={reportLoading} onClick={() => void generate()}>
            {report ? '重新生成' : '生成报表'}
          </Button>
          <span className="card-note">
            {period === 'custom' && customRange
              ? `${customRange[0].format('YYYY-MM-DD')} — ${customRange[1].format('YYYY-MM-DD')}`
              : `区间：${PERIODS.find((item) => item.key === period)?.label}`}
          </span>
        </div>

        {reportError ? (
          <LoadError message="报表生成失败" description={reportError} onRetry={() => void generate()} />
        ) : null}

        {report ? (
          <div className="report-preview">
            <div className="card-note" style={{ marginBottom: 8 }}>
              {report.title} · {dayjs(report.createdAt).format('YYYY-MM-DD HH:mm')}
            </div>
            <MarkdownDoc content={report.markdown} />
          </div>
        ) : (
          <EmptyState
            compact
            title="尚未生成报表"
            description="选择报表类型后点击生成，将基于当前区间真实数据汇总"
          />
        )}
      </Modal>
    </main>
  )
}
