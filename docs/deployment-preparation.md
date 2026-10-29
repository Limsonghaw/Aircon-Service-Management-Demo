# 部署准备与平台选择

更新：2026-10-02。用户尚未选择平台；本阶段只整理要求与报价，不创建云资源、不购买、不部署。

## 已验证

- Git 工作区开始时干净；人工验收记录已提交。
- 前端 lint、TypeScript 与 Vite production build 通过。
- 后端 Release publish 成功：`dotnet publish backend/ShengHengAircon.Api.csproj -c Release --no-restore -o backend/bin/deployment-check`。
- 生产发布包需要 .NET 10 ASP.NET Core runtime（或对应容器基础镜像）。构建阶段需 .NET SDK、兼容 Vite 8 的 Node 环境，并按 lockfile 安装前端依赖。
- 成功构建不代表生产路由、HTTPS、登录持久性和目标服务器 PDF 已验收。

## 当前缺项与后续实施

1. 同域入口：当前所有前端请求使用相对 `/api`，Vite proxy 仅在开发服务生效。生产需把 `/api` 转发后端，其他路径服务 frontend/dist；页面刷新如 /quotes/id 必须回退 index.html，API 不得回退 HTML。可选择反向代理或 ASP.NET 静态文件托管，待平台确定再实现。
2. HTTPS：当前 Cookie SecurePolicy=SameAsRequest；生产需确保 Secure Cookie 和正确识别 HTTPS。代理环境需配置可信转发来源与 Forwarded Headers，不应无条件信任外部转发头。
3. 登录：Cookie SameSite=Strict，fetch 未设置跨域 credentials，CORS 未 AllowCredentials；优先保留同域部署以符合当前实现。ASP.NET Data Protection 密钥需持久保存，重启/重新部署验证已有登录；多实例需共享密钥并保护其访问。
4. Secrets：后端配置 ASPNETCORE_ENVIRONMENT=Production、Supabase__Enabled=true、Supabase__Url、Supabase__ServiceRoleKey。真实 key 只进平台 secrets/环境，不进 Git 或 Vite。生产 AllowedHosts 按域名收窄。
5. PDF：Playwright 1.63.0 所需浏览器必须随发布安装；安装与运行采用相同 PLAYWRIGHT_BROWSERS_PATH，服务账号可读/执行。Linux 同时安装系统依赖和中文字体。浏览器应置于持久、受控目录或镜像中，避免依赖开发账号缓存。用实际部署运行账号验证 Quote/Invoice PDF；升级 Playwright 时同步浏览器版本。既往缺失文件报错重启恢复的原因尚未查明，不能认定路径配置会自动根治。
6. Supabase：核对目标项目 migration 应用记录，只执行未应用项；验证私有 buckets、老板/管理员/员工账号和所属团队。应用服务器备份不能替代 Supabase 数据库及 Storage 对象备份。
7. 运维：持久日志、health 监控、自动重启、上传请求大小及代理超时、预算提醒、部署回滚及数据库备份/恢复计划。health 当前仅确认进程响应，不检查 Supabase 或 PDF。

## 候选费用（USD/月）

以下为官方标价与规划估算，未含税、域名、超额流量/Storage、额外磁盘及备份；汇率不固定，因此不作为 MYR 报价。

| 平台 | 官方价格 | 本项目优点 | 本项目代价/限制 |
| --- | --- | --- | --- |
| Railway | Hobby 最低 $5（含 $5 使用额度）；Pro 最低 $20（含 $20 额度），按资源实际用量计费 | 管理部署/HTTPS 简便，适合容器化后端 | 月费随内存/CPU/流量波动；需配置 PDF 镜像、密钥持久卷。$5 不保证是最终账单 |
| Render | Web compute 512MB $7；2GB/1CPU $25 | 固定实例费用较易理解，托管部署和 HTTPS | ASP.NET 与 Chromium 的组合应先用 2GB 做负载验证；512MB 不能假定可靠，持久磁盘等另计 |
| DigitalOcean VPS | Basic 2GB/1vCPU $12；4GB/2vCPU $24 | 环境控制直接、同域前后端方便、实例费用明确 | 自行处理 Linux、代理、TLS、补丁、日志、备份和故障恢复；维护时间需计入成本 |

Railway 的 $10–20/月仅可作为小团队轻负载的应用预算估算，正式金额需测量；若选 Pro 则至少 $20。Render $25/月可作为 2GB 应用实例的起步费用。VPS 2GB 是试运行起点，PDF 峰值需测量后决定是否升为 4GB。

Supabase 独立计费：Free $0，闲置一周可能暂停；Pro $25/月起。单个默认规模生产项目需核对组织的 compute credits/超额用量，不能假设所有规模均固定 $25。使用 Pro 时，Render 2GB + Supabase 基础预算约 $50/月；VPS 2GB + Supabase 约 $37/月（未含上述额外费用）。

偏向省维护：先比较 Railway 与 Render 的区域、账单及持久卷；偏向固定费用和可控环境：VPS，但需明确维护人。平台选择后才编写目标部署配置。

## 参考

- https://docs.railway.com/pricing
- https://render.com/pricing
- https://www.digitalocean.com/pricing/droplets
- https://supabase.com/pricing
- https://playwright.dev/dotnet/docs/browsers
- https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0
