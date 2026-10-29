# 工作详情 PO（采购订单）PDF：代码验收与迁移待确认

日期：2026-10-08。用户已确认独立附件表与私有存储空间的方案，并要求优先实施第⑤项。代码、接口及迁移文件已完成；迁移尚未执行，①至④暂缓后续工作。测试使用隔离资料，没有连接或修改真实 Supabase。

## 当前代码与安排

- `frontend/src/components/JobDetail.tsx` 已有工作详情、安排和照片区，可增加独立「PO（采购订单）PDF」区。
- `Attachments.tsx` 已有待上传文件卡片、PDF 阅读器、下载、进度和失败预览重试；`useUnsaved` 支持选中文件／上传期间离开保护。
- 工作照片权限允许所属团队员工访问，PO 不能复用 `can_access_job_photos`，必须独立限制老板／管理员。
- PO 在选中文件时生成稳定附件 ID，同一次上传重试复用该 ID；新补传生成新 ID。API 先查询登记记录，存储已存在时校验原始字节，再通过幂等登记函数确认结果。不会使用 upsert、覆盖或删除历史文件。
- 第⑤项已优先完成代码，①至④的原有改动保留，暂缓后续工作；执行迁移与真实数据库验收仍须另行确认。

## 具体迁移内容

文件：`supabase/migrations/202610080001_add_job_po_documents.sql`。

| 对象 | 新增内容 |
| --- | --- |
| 私有 bucket `job-po-documents` | `public=false`；仅 `application/pdf`；单份最多 `10485760` 字节，与项目已有「10 MB」限制一致 |
| 表 `public.job_po_documents` | 附件 ID、工作单 ID、原文件名、MIME、字节数、私有路径、SHA-256、上传人 ID／姓名和上传时间 |
| 文件路径 | 固定为 `{jobId}/{attachmentId}.pdf`，不以原文件名建立路径 |
| 索引 | 按工作单、时间及附件 ID 倒序查询，列出全部历史文件 |
| RLS／授权 | 表开启 RLS，撤销浏览器角色及 service_role 的普通写权限；service_role 仅可读，登记必须走后端专用函数 |
| Storage 策略 | 新增限定此 bucket 的 restrictive 策略，阻止 anon／authenticated 直接读取或写入，避免被其他宽泛策略开放；不授予任何新权限 |
| 访问函数 `can_access_job_po_documents` | 核对工作单存在及用户当前角色为 owner/admin；员工即使属于工作团队也不能访问 |
| 登记函数 `register_job_po_document` | 重新核对实时角色并锁定关联记录，登记与日志同事务；相同 ID、同工作单／上传人／文件元数据的重试返回原记录，参数不同则冲突 |
| 审计 | 使用已有 `updated` 动作，详情写入 `operation=job_po_uploaded`、附件 ID、文件名、大小和校验值；不修改共享日志枚举。当前日志列表会显示「编辑」，PO 界面／API 实施时可按 operation 展示上传说明 |

仅新增对象，不更新现有工作单、账号角色或附件数据。不增加状态、工作单必填字段、状态触发器或「必须有 PO」条件。

## 需要确认的影响

1. **工作单删除限制**：附件 `job_id` 外键使用 `ON DELETE RESTRICT`。有 PO 历史的工作单不可直接删除，建立、安排、完成和补传不受影响。API 已将删除失败提示明确为有关联照片或 PO PDF；不提供删除 PO 规避历史保留的入口。
2. **上传人历史保护**：上传人外键同样限制删除已有上传历史的用户资料，避免丢失文件归属。此次不修改任何账号权限或账号数据。
3. **冲突时停止**：若目标 bucket 已存在但公开、文件类型或大小限制不匹配，迁移整体回滚，不覆盖配置或清理已有文件。若表／函数／策略已存在，普通 CREATE 会失败并回滚，需要先只读核对来源；不自动替换。
4. **权限边界**：数据库函数只向 service_role 开放。应用仍须从登录身份取得 user ID，API 使用原有 Management 策略，并在上传、列表、查看、下载每次操作中核对实时角色、工作单及附件归属；不能接受浏览器提供的上传人身份或 Storage 路径。
5. **10 MB 与 PDF 校验**：bucket 和表约束大小／类型，API 仍必须校验真实 PDF 字节、文件名和 MIME；不能只相信扩展名。请求总大小需给 multipart 包装留余量，实际文件仍最多 10 MB。
6. **运行方式**：本次没有连接或操作数据库。执行将创建表、索引、函数、bucket 与策略，需要数据库及 Storage 管理权限；执行前仍需确认目标测试环境及已有对象／权限。新增空表无需回填业务记录。

## 已完成的界面与 API

- 仅在管理角色「工作详情」中显示 PO 区，文件输入为可选，所有工作单状态都可补传。
- 上传、查看、下载各自经过后端授权；不返回公开 Storage URL，不给员工入口或 API 权限。
- 每次补传生成新附件 ID，历史列表保留原文件；不提供覆盖、删除或清空历史操作。
- 选择文件后显示文件名、大小和待上传提示；上传失败保留 File，支持重试，传输 100% 只表示已发送，必须等接口确认登记成功才显示保存成功。
- 同一请求同步锁防重复上传。未知结果先核对稳定 ID／列表，重试不可覆盖已有不同内容，不能清理已登记文件。
- 上传期间阻止关闭工作详情或离开；选中而未上传时提示继续编辑或放弃本次选择，不影响已有历史文件。
- PO 不参与工作单建立、安排或完成接口的有效性检查。

新增接口：

- `GET /api/jobs/{jobId}/po-documents`：读取历史列表。
- `POST /api/jobs/{jobId}/po-documents/{documentId}`：multipart 上传，固定 ID 支持重试。
- `GET /api/jobs/{jobId}/po-documents/{documentId}/file`：授权后查看 PDF。
- 同上增加 `?download=true`：下载原 PDF 文件。

列表与文件响应不缓存；下载核对固定路径、大小和 SHA-256，列表响应不暴露 Storage 路径、上传人 ID 或 SHA。管理角色从工作单、客户详情和日历打开工作详情均可使用；员工不会挂载 PO 区或发送 PO 请求。照片与 PO 的上传忙碌状态合并，并互相阻止新上传，避免一个请求结束时过早放开离开保护。

代码涉及 `JobPoDocumentModels.cs`、`JobPoDocumentsController.cs`、`SupabaseJobPoDocumentStore.cs`、`Program.cs`、`JobsController.cs`，以及 `JobPoDocuments.tsx`、`JobPoDocuments.css`、`jobPoDocumentsApi.ts`、`JobDetail.tsx`、`JobPhotos.tsx`。没有新增依赖，没有改工作单状态或原有工作单必填字段。第①项与其他已有工作区改动未纳入本项撤回范围。

## 验收与撤回

| 验收 | 当前状态 |
| --- | --- |
| TypeScript、相关文件 ESLint、前后端独立构建 | 测试通过；后端零警告／零错误，Vite 保留已有 bundle 大小警告 |
| 相关后端权限、API、仓储及工作照片回归 | 测试通过；58 项、0 失败、0 跳过；包括实时角色拒绝、员工／匿名拒绝、跨工作单附件拒绝、私有路径与哈希检查 |
| 检查工作详情、附件组件、既有权限、迁移草案 | 已静态检查；SQL 尚未执行 |
| 执行迁移、SQL 运行及权限验证 | 尚未验证；等待明确执行确认及目标环境 |
| 不上传即可建立、安排、完成，完成后补传 | 测试通过；真实前端、临时 loopback 模拟 API，使用既有客户详情新增和工作单编辑路径 |
| 上传有效 PDF、10 MB 边界、错误文件拒绝 | 测试通过；后端精确 10485760 字节接受、超过 1 字节拒绝，空文件／伪装格式／错误 MIME 拒绝；浏览器拒绝错误扩展名及超限文件 |
| 查看 PDF、下载原文件、哈希比对、历史文件保留 | 测试通过；电脑及 390px 视口实际渲染 PDF、下载文件与上传源逐字节相同；关闭重开保留历史 |
| 失败保留文件、重试去重、上传期间离开保护 | 测试通过；503 与不完整成功响应保留选中文件，重试相同 ID；后端另测存储／登记丢失响应不重复、不覆盖、不删除；手机忙碌时关闭禁用、导航离开被阻止 |
| 老板／管理员允许，员工／匿名拒绝，跨工作单附件拒绝 | 隔离测试通过；未修改真实账号角色 |
| 电脑、手机宽度操作及截图 | 测试通过；1440px、390px，320px 无横向溢出，共 13 个浏览器场景、无页面异常 |
| 真实 Supabase Storage／RPC／RLS、实体手机及 Safari | 尚未验证；迁移未执行，不能以模拟 API 测试代替真实集成验收 |

本轮没有发现阻断隔离验收的应用问题。PDF 工具的包装路径不可用，改用已安装 Poppler 可执行文件完成渲染；其 Symbol／ArialUnicode 字体提示未影响本次英文隔离 PDF 的可见内容，已实际查看输出 PNG。此工具问题不涉及应用代码。

## 实际验收证据

本机忽略目录 `.local-deploy/qa-job-po/` 保存脚本、隔离数据、截图及实际下载文件，不混入生产发布目录。浏览器使用临时 loopback HTTP 夹具，接收真实 multipart 文件字节，所有业务 API 均为模拟数据；仅测试过程监听随机本机端口，结束即关闭，没有启动、停止或重启既有应用服务。

- [电脑 PO 历史列表](../.local-deploy/qa-job-po/desktop-history.png)
- [电脑失败后保留文件及重试](../.local-deploy/qa-job-po/desktop-failure.png)
- [电脑实际 PDF 预览](../.local-deploy/qa-job-po/desktop-preview.png)
- [手机 PO 历史列表](../.local-deploy/qa-job-po/mobile-history.png)
- [手机上传期间离开保护](../.local-deploy/qa-job-po/mobile-upload-guard.png)
- [手机实际 PDF 预览](../.local-deploy/qa-job-po/mobile-preview.png)
- [320px 布局](../.local-deploy/qa-job-po/mobile-320.png)
- [员工工作详情没有 PO](../.local-deploy/qa-job-po/employee-no-po.png)
- [电脑实际下载文件渲染](../.local-deploy/qa-job-po/desktop-downloaded-page.png)
- [手机实际下载文件渲染](../.local-deploy/qa-job-po/mobile-downloaded-page.png)

`results.json` 记录 13 个浏览器场景；`download-results.json` 记录两个实际下载文件各一页及 SHA-256。已用 pypdf 重新打开、检查内容，再用 Poppler 渲染并查看下载文件，不能只以保存接口成功判定文件可读。

执行前撤回仅移除本草案。执行后撤回应用代码仍保留表、bucket、历史元数据与文件；不编写删除真实数据的 down migration，不运行 DROP TABLE、清空 bucket 或删除文件。保留独立读取接口时，管理角色仍可按原授权下载历史文件；若代码完全退回不含该接口的版本，数据仍在，但需恢复读取接口或由管理员按原授权恢复访问。

数据库事务失败会回滚本次 SQL；SQL 外部实际文件上传不属于这个事务，后续 API 必须区分明确未登记与结果未知。结果未知时保留文件并核对，不因重试或代码撤回删除真实文件。

本次未执行迁移，未 commit、push、部署或重启服务。执行前请确认上述内容，尤其删除限制、私有访问和重复上传处理，并明确目标测试数据库；确认后先在隔离环境验证实际 SQL、RPC、Storage 与权限。
