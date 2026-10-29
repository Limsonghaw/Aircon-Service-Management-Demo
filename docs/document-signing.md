# Quote / Invoice 老板签名与 PDF

本模块只涉及 Quote、Invoice，不修改 Job，不包含客户在线签名或 Email / WhatsApp 分享。

## 安装与 migration

先执行尚未执行的 `supabase/migrations/202610010002_add_invoice_document_items.sql`，再执行
`supabase/migrations/202610010003_add_signed_documents.sql`。不要重复执行已经成功应用的 migration。
新 migration 建立私有 `signed-documents` bucket、不可由前端访问的签名记录表、文件快照 RPC 和原子登记/日志 RPC。
不增加 anon/authenticated Storage policy。现有同名 bucket 若公开，migration 会拒绝执行，请先检查该 bucket 的用途。

后端新增已获同意的 `Microsoft.Playwright` 1.63.0。在开发机或部署服务器执行：

```powershell
dotnet build backend/ShengHengAircon.Api.csproj -c Release
pwsh backend/bin/Release/net10.0/playwright.ps1 install chromium
```

Linux 服务器使用生成的脚本 `install --with-deps chromium` 安装浏览器及系统依赖，并安装中文字体
（例如 Noto CJK）。应用运行账号必须能读取该账号安装的浏览器目录；发布版本与浏览器版本必须匹配。
容器需要在镜像构建时安装浏览器/字体，不能只拷贝 .NET 发布目录。
PDF 引擎每个后端实例同时生成一份，排队等待超过 5 秒返回繁忙提示；不适用于高并发批量导出。

继续使用后端 Supabase 环境配置；ServiceRoleKey 或 secret key 只能保存在后端 secrets / 环境变量，绝不能配置到 Vite。
新 secret key 只发送 apikey header，不当作 JWT bearer；旧 service_role JWT 仍使用 bearer。
配置方式遵循 [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)。
生产环境必须使用 HTTPS，并持久保存 ASP.NET Cookie Data Protection keys。

## 操作流程

1. 老板打开 Quote / Invoice 的打印预览，确认日期、Ref / PO、Attn、条款／服务人员。
2. 点击「手写签名」，在画板手写，支持鼠标、触屏、清除重签。
3. 勾选确认，点击「确认签名并保存 PDF」。修改打印字段或笔画会取消确认。
4. 生成的 PDF 将签名放入公司签名栏，客户栏保持空白。Invoice 中老板是公司代表，不代表执行工作的员工。
5. 点击「下载签名 PDF」。普通浏览器打印仍输出未签名版，不会把历史签名套用到当前预览。

管理员可查看记录和下载；员工不能读取或下载此模块，只有老板能新增签名。
老板权限由 API cookie、实时 profile 查询及数据库登记事务三层检查。
手写笔画以规范化坐标保存在签名记录中，PDF 中转换为矢量图，不自动复用于其他文件。

## 保存并重复使用我的签名

在上述签名 migration 之后执行 `supabase/migrations/202610010004_add_owner_saved_signatures.sql`。
它新增私有 `owner-signatures` bucket、每个老板账号一条的常用签名索引、原子更新／操作日志 RPC。
不新增依赖，也不开放浏览器直接访问 Storage。

- 在 Quote 或 Invoice 打开画板，手写后点击「保存我的签名」。这一步只保存常用签名，不生成 PDF。
- 下次打开画板，点击「使用已保存签名」，检查后勾选确认，再保存当前单据的签名 PDF。
- 重新手写后可点击「替换我的常用签名」。替换不修改画板以外的单据，也不改变历史 PDF。
- 保存、载入、清除或重画笔画会取消本张单据的签名确认，防止把新笔画当作已确认内容。
- 「重新载入常用签名」只刷新常用签名记录，不清空当前画板。多页面同时替换时，旧版本提交返回 409；
  重新载入、检查后再保存。未知保存结果也应先重新载入检查。

`GET /api/documents/my-signature` 和 `PUT /api/documents/my-signature` 只接受当前登录老板的账号，
不会接收前端指定的用户 ID。管理员与员工均不能读写。每次请求重新检查实时老板角色；更新事务也会锁定
profile 并检查角色和常用签名版本。读取使用 `Cache-Control: no-store`，不使用浏览器持久存储。

Storage 文件是服务端序列化的规范化笔画 JSON，保持手机与电脑缩放一致；载入时校验归属路径、SHA-256
和笔画范围。生成 PDF 仍使用已审核的服务端模板及每份单据的独立快照。
操作日志只保存操作者和版本 ID，不保存签名内容或可访问文件的链接。

每次更换写入新的私有对象，并原子更换索引。已被更换的对象暂保留在私有 Storage，不能通过应用读取，
供维护时核对；不会覆盖或删除历史签名 PDF。明确的事务拒绝只清理本次新上传对象，
未知结果保留文件，避免删除可能已提交的签名。备份和人工清理时应纳入此 bucket，
只有核对 `owner_saved_signatures.storage_path` 后才能删除不再引用的对象。

2026-10-01 验收：真实私有 Storage 保存并由全新连接重新载入已确认的老板签名，归属路径和 SHA-256
校验通过，历史 Invoice PDF 字节保持不变，操作日志已登记。API 测试覆盖角色拒绝、过期老板权限、
非法笔画、Quote / Invoice 复用及更换后旧 PDF 下载；UI 模拟测试覆盖重新打开、取消确认、替换和
390px 手机宽度。手机真机触控仍按上面的验收清单检查。

## 版本、安全与失败处理

快照包括完整单据、排序明细和客户资料。预览会核对可见资料；提交时检查快照 hash，数据库登记时
再次锁定父单据和客户并比较快照。任何资料或状态变更都使旧版不再是当前签名。
历史 PDF 不覆盖、保留下载。重新签名生成新的 UUID 文件与记录，不删除旧版。

PDF 先上传私有 Storage，再原子登记快照和 `document_signed` 操作日志。数据库明确拒绝时清理新上传文件。
网络超时／未知数据库响应可能已经提交，因此保留文件供人工核对，不能盲目删除。
遇到「保存结果未确认」先重新打开预览检查签名历史；维护人员比较 Storage 对象与
`signed_documents.storage_path`，仅人工清理确认没有登记的孤立对象。
没有自动清理任务，也不保证 Storage 与 PostgreSQL 的跨服务原子性。

下载走受权限保护的后端，校验 PDF SHA-256 后返回，不暴露永久公开 URL。
快照、签名和客户资料属于敏感业务数据，备份需要同时包括数据库和 Storage 对象，限制备份访问。
不要删除签名人 profile；外键保留历史追溯。
这里是手写电子签名，不是 Adobe 身份验证、证书数字签章或不可篡改法律认证。

HTML 字段全部编码；PDF 浏览器禁用 JavaScript 和外部网络请求。使用与前端相同的嵌入式打印 CSS，
后端模板不读取前端提交的 HTML／金额。更改模板需同步检查前后端输出。

## 验收

- 前端 lint、TypeScript / Vite build、后端测试。
- 真 PDF 冒烟测试默认不启动浏览器；设置 `SHENGHENG_PDF_QA_DIRECTORY` 为存在的本机测试目录后
  运行 `dotnet test backend/ShengHengAircon.slnx -c Release`，会生成 Quote / Invoice 各 2 行和 60 行样本。
- 验证中文、金额、折扣、长描述分页、表头重复及公司签名栏完整保留。
- 在真实 Supabase 应用 migrations 后，用老板保存并重新打开下载，管理员无签名按钮，员工 API 返回 403。
- 修改金额／客户地址／状态后，历史签名标为历史版；旧预览提交应返回 409，不能登记旧资料。
- 手机浏览器手指签名不滚动页面，横竖屏签名坐标保持一致。真机触控仍需用户验收。
- 测试上传失败、生成失败及重新签名，确认不会误显示保存成功。

本地自动测试不等于真实 Supabase 集成验收；未执行 migration 前签名历史接口会不可用。

## PDF 生成失败的诊断

后端在 `PlaywrightDocumentPdfRenderer` 记录原始异常、签名记录 UUID 和失败阶段
（driver_start、browser_launch、page_content、pdf_export）。前端仍返回安全的通用提示，
不把服务器路径或业务快照暴露给客户端。启动终端应保留这条 Error 日志用于定位；
默认不写入日志文件。更新诊断代码后必须重新启动后端再复现，旧进程不会加载这些日志改动。

日志另记录最多 8,000 字符的错误原因，避免部分日志通道丢弃过大的异常载荷。
浏览器启动失败不等于缺少 Chromium 或字体，应依据原始异常处理，不要盲目重新安装。

2026-10-01 本地排障：旧后端在 browser_launch 阶段失败；重新构建并重启后，真实 Invoice
签名生成、私有 Storage 上传、登记和下载均返回 200（下载 113,363 字节）。旧进程启动失败的
底层异常未完整取得，因此重启恢复不能视为已证明缺少依赖或已排除所有复发原因。
