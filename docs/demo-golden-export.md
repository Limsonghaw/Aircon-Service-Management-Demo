# 怎样只读导出黄金示范资料

黄金示范资料是一份固定的虚构资料副本。以后示范网站被访客改动时，系统可以用这份副本恢复客户、工单、报价等内容。请等你批准导出后，再选择下面一种方法。导出的资料需要审核，之后才会在另一个 PR 放入正式的种子文件。

## 方法一：在你自己的电脑运行

在自己的电脑打开这份代码，切到 `feat/demo-daily-reset` 分支，并进入项目的主文件夹。请安装 Node.js 24。macOS 或 Linux 可以用 Bash，Windows 可以用 Git Bash。

在 Supabase 后台打开**专用的虚构示范项目**。点项目顶部的 **Connect（连接）**，找到项目 URL。在 **Settings（设置）→ API Keys（API 密钥）** 找到旧版的 `service_role` 密钥。项目编号（project ref）就是项目 URL 中 `.supabase.co` 前面的部分，也可以在项目设置里核对。密钥只输入你自己的终端，请勿发到聊天或写进文件。 [Supabase 密钥帮助](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)

先执行下面的设置命令。它们只在当前终端保存设置，**只读，不连接数据库**。输入密钥时，屏幕不会显示内容。

```bash
read -r -p '项目 URL: ' DEMO_SUPABASE_URL
read -r -p '项目编号: ' DEMO_ALLOWED_PROJECT_REF
read -r -s -p 'service_role 密钥: ' DEMO_SUPABASE_SERVICE_ROLE_KEY
printf '\n'
export DEMO_SUPABASE_URL DEMO_ALLOWED_PROJECT_REF DEMO_SUPABASE_SERVICE_ROLE_KEY
export DEMO_ALLOWED_USER_EMAILS='demo@gmail.com'
```

**只读导出**。这条命令只读取线上资料，在你的个人文件夹里新建一份 JSON。它会拒绝覆盖已有文件。

```bash
node scripts/export-demo-seed.mjs --read-only-export --output "$HOME/aircon-demo-golden-review.json"
```

脚本默认按马来西亚当天来计算日期偏移。如果要指定一个基准日期，可以在命令末尾加上 `--business-date YYYY-MM-DD`，把 `YYYY-MM-DD` 换成你选的日期。脚本会显示各表笔数、电邮和电话各有多少个不同值。结束后可以关闭该终端。

## 方法二：在 Supabase 后台用 SQL 查看

打开正确的示范项目，然后点 **SQL Editor**。先运行下面两句 **只读** 查询。第一张结果表应该只有 `demo@gmail.com` 一行，第二张结果表的电邮也应该在允许名单内。如果有空白或其他电邮，请先停止。

```sql
select lower(btrim(email)) as email from auth.users order by email;
select email, employee_id from public.user_profiles order by id;
```

确认后，可以逐条运行下面的 **只读** 查询，并把结果保存到自己的电脑供审核。这个方法会保留原始日期。后续整理种子文件时，请把四个业务日期字段转换为相对日期。 [种子文件日期规则](../scripts/demo-seed/README.md)

```sql
select id, name, notes, is_active, created_at, updated_at from public.teams order by id;
select id, team_id, name, phone, role, notes, is_active, created_at, updated_at from public.employees order by id;
select id, name, customer_type, phone, email, address, notes, created_at, updated_at from public.customers order by id;
select id, quote_number, customer_id, valid_until, status, notes, created_at, updated_at from public.quotes order by id;
select id, quote_id, position, description, quantity, unit_price from public.quote_items order by id;
select id, job_number, customer_id, title, service_date, team, status, source_quote_id, created_at, updated_at from public.jobs order by id;
select id, invoice_number, customer_id, amount, due_date, status, notes, source_quote_id, items, discount, created_at, updated_at from public.invoices order by id;
select id, expense_number, description, amount, expense_date, status, notes, created_at, updated_at from public.expenses order by id;
```

## 导出后怎样检查

用文字编辑器打开 JSON，或查看你保存的查询结果。检查每一笔资料和备注，确认没有真实客户姓名、真实电话号码、身份证号码、真实地址或其他个人资料。唯一获准的登录电邮是 `demo@gmail.com`，客户资料里的其他电邮也必须是虚构的。发现真实资料时，请先停止分享并处理这些资料。

请先把结果留在自己的电脑，等审核和你的批准后，再由后续 PR 收录。除非另有安排，请不要自己提交导出文件。
