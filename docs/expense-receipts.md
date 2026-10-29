# 费用收据上传

## 数据库与配置

按顺序在 Supabase SQL Editor 执行：

1. `supabase/migrations/202610010005_add_expense_receipts.sql`
2. `supabase/migrations/202610010006_allow_receipt_maintenance.sql`

只执行未成功应用的文件。005 新增私有 `expense-receipts` bucket、收据索引表、原子登记／上传日志 RPC。
006 只授权后端 `service_role` 删除收据索引，供维护和验收清理；应用不提供删除接口。
不授予 anon/authenticated 表或 Storage 访问权限。遇到既有公开的同名 bucket，005 会拒绝执行。

沿用后端 Supabase 配置，不新增依赖。ServiceRoleKey／secret key 保存在 user secrets 或后端环境变量，
不能进入 Vite 配置或前端代码。新 `sb_` key 仅发送 apikey，旧 JWT key 同时发送 bearer。
前端和 API 同站点部署，并在生产使用 HTTPS。

应用与 Supabase 限制单个文件为 10 MB；HTTP multipart 总上限为 11 MB，允许文件字段／边界的开销。
反向代理和部署服务器也需允许至少 11 MB 请求，否则请求可能先被代理拒绝。

## 使用

- 保存费用后，在列表或手机卡片点击「收据」。
- 选择 JPG、PNG 或 PDF，然后点击「上传收据」。每项费用可保存多张，一次上传一个文件。
- 手机宽度（750px 及以下）提供「拍照收据」。使用原生照片文件输入和 `capture="environment"` 请求后置相机；
  拍摄后显示所选文件名及大小，仍需点击「上传收据」才保存。取消拍照保留原来选定的文件。
  电脑不显示此按钮；原文件选择入口在两种布局均保留。浏览器决定相机／选择器实际行为，
  不支持直接拍摄时仍可从文件入口选择照片，参见 [MDN capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)。
- 收据列表显示原文件名、大小、上传人及时间；「查看」在新页打开，「下载」保存原文件。
- 关闭后重新打开，或点击「刷新收据」，重新读取已保存记录。
- 只允许老板／管理员操作；员工和未登录者均不能访问收据接口。每次请求检查实时角色，
  登记事务也检查实时角色，避免旧 cookie 继续使用已撤销权限。
- 支持 JPEG、PNG、PDF；HEIC、SVG、Office 文档暂不接受。手机 HEIC 照片需先导出 JPEG 或 PNG。

不自动识别金额或改变费用检查状态。上传不覆盖已有收据。本模块只处理费用，Quote 附件和 Job 照片后续分别接入。

## 存储与失败恢复

API：`GET/POST /api/expenses/{expenseId}/receipts`，上传用 multipart 字段 `file`；
`GET /api/expenses/{expenseId}/receipts/{receiptId}/file` 查看，增加 `?download=true` 下载。
接口返回收据摘要，不返回 service key、Storage 路径或永久公开链接。

服务端检查长度、扩展名、声明 MIME 和文件头／尾基本格式。原文件名只用于显示／下载，
移除路径和控制字符；Storage 路径由费用 ID 和随机 UUID 生成，扩展名按规范 MIME 决定。
这是基础格式检查，不包含病毒扫描或完整 PDF／图片解析。文件不在后端执行；
查看和下载发送正确 MIME、`nosniff` 和 `Cache-Control: no-store`。

先上传私有对象，再通过 `register_expense_receipt` 原子登记索引和 `receipt_uploaded` 日志。
日志保留上传人、费用编号、文件名／大小和收据 ID，不保存文件内容或 Storage 链接。
下载校验费用归属、路径、字节数与 SHA-256。

数据库明确拒绝（权限、费用消失、无效元数据）时只清理本次新上传对象。
网络超时或未知响应可能发生在事务提交之后，不自动删除文件；页面不会显示上传成功。
先刷新列表检查同名、大小及时间，确认结果后再重试，避免重复上传。

维护时先备份数据库与整个私有 bucket。核对 `expense_receipts.storage_path`，
只清理确认没有引用的对象。删除已登记资料须由维护人员明确选定收据 ID 和费用 ID，
再删除索引及对应文件；费用外键防止直接删除仍有收据的费用。操作日志保留追溯。
没有自动清理任务，也不保证 PostgreSQL 和 Storage 跨服务原子提交。

## 验收

- 前端 lint、TypeScript / Vite build，后端测试。
- 老板和管理员上传／查看／下载，员工及匿名请求拒绝，过期管理角色也拒绝。
- 空文件、超过 10 MB、伪装扩展名、截断 PNG、非 JPG/PNG/PDF 均不能进入 Storage。
- 上传后刷新／重新打开仍可读取；下载字节一致、正确 MIME 和文件名、私有对象不能匿名访问。
- 其他费用 ID 不能读取该收据；修改费用状态／说明不删除收据。
- 上传失败不登记记录；明确拒绝只清理新文件；未知结果保留文件待核对。
- 检查桌面和 390px 手机宽度；真机拍照／文件选择仍需在实际设备验证。

2026-10-01 本地验收：真实 Supabase 私有 bucket 上传、原子登记、全新连接下载及 SHA-256 校验通过，
不同费用不能查询该收据，匿名公开对象访问被拒绝，上传日志已登记。验收使用明确标记的临时费用，
结束后已清理测试费用、收据索引及 Storage 文件，标记为 QA 的审计日志保留。
桌面及 390px UI 模拟测试覆盖文件选择、上传成功、关闭后重新打开及超大文件拒绝。
