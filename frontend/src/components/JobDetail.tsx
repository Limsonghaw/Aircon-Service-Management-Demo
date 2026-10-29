import { translate as t, useLanguage } from '../i18n'
import { useCallback, useEffect, useState } from 'react'
import { useResource } from '../hooks/useResource'
import { LoadState } from './DataState'
import { Link } from 'react-router-dom'
import { getJobDetails, type CustomerJob, type JobDetails } from '../services/customersApi'
import { JobPhotos } from './JobPhotos'
import { useInteraction } from '../contexts/InteractionContext'
import { useAuth } from '../contexts/useAuth'
import { JobPoDocuments } from './JobPoDocuments'

const statusLabels = { pending: '待安排', scheduled: '已安排', in_progress: '进行中', completed: '已完成' }
export function JobDetail({ job, canManage, busy, onClose, onBusy, returnState }: {
  job: CustomerJob; canManage: boolean; returnState?: unknown; busy: boolean; onClose: () => void; onBusy: (busy: boolean) => void
}) {
  useLanguage()
  const { user } = useAuth()
  const canUsePo = user?.role === 'owner' || user?.role === 'admin'
  const [showPhotos, setShowPhotos] = useState(false)
  useEffect(() => () => onBusy(false), [onBusy])
  const loader = useCallback(() => getJobDetails(job.id), [job.id])
  const state = useResource(loader, null as JobDetails | null)
  const details = state.available ? state.data : null
  const { leave } = useInteraction()
  const phone = details?.phone?.trim()
  const address = details?.address?.trim()
  const dialNumber = phone?.replace(/[^\d+]/g, '')
  if (showPhotos) return <JobPhotos job={job} onClose={() => setShowPhotos(false)} onBusy={onBusy} />
  return <section className="job-detail-panel" aria-labelledby="job-detail-title">
    <div className="dashboard-section-heading"><h2 id="job-detail-title">{t("工作详情 · ")}{job.jobNumber}</h2><button type="button" className="text-button" disabled={busy} onClick={() => leave(onClose)}>{t("关闭详情")}</button></div>
    <div className="job-detail-title"><h3>{job.title}</h3><span className={`badge status-${statusLabels[job.status]}`}>{t(statusLabels[job.status])}</span></div>
    <div className="job-detail-columns">
      <div className="job-detail-contact"><h3>{t("客户与地点")}</h3>
        <p>{canManage ? <Link className="table-link" to={`/customers/${job.customerId}`} state={returnState}>{details?.job.customerName || job.customerName || t('查看客户')}</Link> : details?.job.customerName || job.customerName || '客户姓名未提供'}</p>
        <LoadState state={state} label={t("工作联系资料")} />{state.available && <>
          <p>{t(phone || '未填写联系电话')}</p><p>{t(address || '未填写地址')}</p>
          <div className="job-contact-actions">{dialNumber && <a className="primary-button" href={`tel:${dialNumber}`}>{t("拨打电话")}</a>}{address && <a className="secondary-button" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer">{t("打开地图")}</a>}</div>
        </>}
      </div>
      <div className="job-detail-schedule"><h3>{t("工作安排")}</h3><dl><dt>{t("服务日期")}</dt><dd>{job.serviceDate.replaceAll('-', '/')}</dd><dt>{t("施工团队")}</dt><dd>{job.team === '未安排' ? t('未安排') : job.team}</dd><dt>{t("状态")}</dt><dd>{t(statusLabels[job.status])}</dd></dl><h3>{t("工作内容")}</h3><p>{job.title}</p></div>
      <div className="job-detail-photos"><h3>{t("工作照片")}</h3><p>{t("打开相册查看、上传或下载工作照片。")}</p><button type="button" className="secondary-button" disabled={busy} onClick={() => leave(() => setShowPhotos(true))}>{t("照片")}</button></div>
    </div>
    {canUsePo && <JobPoDocuments key={job.id} jobId={job.id} blocked={false} onBusy={onBusy} />}
  </section>
}
