# 登录与权限

## Migration

必须先执行操作日志 migration，再在 Supabase SQL Editor 执行：

`supabase/migrations/202609300002_create_user_profiles.sql`

此 migration 会为现有 Supabase Authentication 用户建立应用 profile。最早建立的现有用户会成为
`owner`；若目前没有用户，之后建立的第一个用户会自动成为 `owner`。其他新用户默认为 `employee`。

## 建立账号

1. 在 Supabase Dashboard 打开 Authentication → Users。
2. 建立用户并设置电邮和密码。不要把密码写入代码、migration 或文档。
3. 使用老板账号登录应用，在“用户与权限”页面分配角色。

角色权限：

- `owner`：全部业务功能，并可更改用户角色。
- `admin`：全部日常业务功能及操作日志，不能更改角色。
- `employee`：绑定员工后只可读取其有效团队的工作单和日历。

系统使用加密、HttpOnly、SameSite=Strict Cookie 保存八小时会话。Supabase service-role key 只保留在后端配置，
不会返回给浏览器。前端与 API 应部署在同一站点；跨站点 Cookie 部署需要另行评估 CORS 与 CSRF 设置。

## 验收

1. 未登录访问业务 API，确认返回 401。
2. 使用老板账号登录，确认可查看“用户与权限”并更改角色。
3. 使用管理员账号登录，确认可维护业务资料但不能更改角色。
4. 使用员工账号登录，确认只能进入工作单和日历。
5. 新增或编辑资料，确认操作日志显示实际登录者。
6. 登出后刷新页面，确认回到登录页。
