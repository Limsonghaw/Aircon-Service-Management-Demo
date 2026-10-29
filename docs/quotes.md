# 报价功能

先完成 Customer migration，再在 Supabase SQL Editor 执行
`supabase/migrations/202609290003_create_quotes.sql`，随后重启后端。
后端沿用现有 Supabase 配置，前端不需要新的密钥或依赖。

## API

- `GET /api/quotes`：报价列表及项目、客户名称、计算金额。
- `GET /api/quotes/{id}`：详情；不存在返回 404。
- `POST /api/quotes`：新增。
- `PUT /api/quotes/{id}`：整体保存资料、状态及项目。

状态为 `draft`、`sent`、`accepted`、`rejected`。报价包含 1–100 条项目；
数量和单价最多两位小数，每行小计按四舍五入保留两位，总额为小计之和。
零单价可用于免费项目，数量必须大于零。总额由后端计算，客户端不提交总额。
`save_quote` 函数在同一个事务内保存报价和全部项目，失败时整体回滚。
重复编号返回 409，客户不存在返回 400。RLS 和 RPC 权限限制为后端 service role。

## 实际验收

1. 新增报价，按姓名、电话或邮箱搜索并选择客户。
2. 添加两条项目，检查预览总额并保存；刷新详情确认数据仍存在。
3. 编辑数量、移除项目、修改状态后保存，再刷新核对。
4. 输入重复编号，确认显示错误且原报价项目仍保留。
5. 在手机宽度检查表单与报价详情。

本阶段不包含报价转换 Job/Invoice、PDF 或发送邮件。Dashboard 的报价摘要仍为演示数据。
