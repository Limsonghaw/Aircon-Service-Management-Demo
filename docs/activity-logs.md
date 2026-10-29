# 操作日志

先依序完成现有 migration，再在 Supabase SQL Editor 执行：

`supabase/migrations/202609300001_create_activity_logs.sql`

完成后重启后端。此 migration 会建立不可由 API 直接修改的日志表，并在客户、工作单、
发票、报价、费用、团队和员工资料新增或编辑成功后自动记录。状态字段或启用状态变化会
独立标为 `status_changed`；从报价转换的发票和工作单标为 `quote_converted`。

当前登录功能尚未接入，所以操作者显示为“系统”。`actor_user_id` 已预留给后续用户与权限模块。

## 验收

1. 新增并编辑一名客户，确认出现“新增”和“编辑”记录。
2. 修改 Quote、Invoice、Job 或 Expense 状态，确认显示变更前后的状态。
3. 将已接受 Quote 转成 Invoice 和 Job，确认出现两条“报价转换”记录。
4. 输入无效资料导致保存失败，确认不会产生操作记录。
