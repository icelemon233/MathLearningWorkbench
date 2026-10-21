# 后端配置

本目录包含初始 SQL 和 AI Edge Function。数据库与模型密钥都在服务端，网站构建产物仅包含项目公开地址和 publishable key。源附件与学生资料不放入仓库。

## 初始化数据库与账户

1. 在专用的空项目中使用 SQL Editor 执行 `schema.sql` 一次，再执行 `lesson-deletion.sql` 开启课堂删除。`schema.sql` 不是 migration，不要重复执行到已有同名表的项目；`lesson-deletion.sql` 是可重复执行的独立增量脚本。
2. 在 Authentication 管理页面创建本人账户，使用个人邮箱及独立密码。关闭新用户注册与匿名登录。本地 `config.toml` 的 Auth 配置不会自动修改已托管项目的控制台设置。
3. 从该 Auth 用户的管理详情复制 UUID，在 SQL Editor 单独执行下面的语句。只在管理端填入真实 UUID，不把它提交到仓库。

```sql
insert into public.app_owner(singleton, owner_id)
values (true, '<AUTH_USER_UUID>');
```

`app_owner` 只容纳一条白名单记录。浏览器只能读取与本人 UUID 匹配的记录，没有修改白名单的权限。其他登录账户也无法读取教学数据。

## 模型服务

将以下四个变量设为 Edge Function Secrets，密钥不要放进前端环境变量、代码、截图或日志。

| 名称 | 内容 |
|---|---|
| `AI_BASE_URL` | `https://api.deepseek.com`、`https://api.deepseek.com/v1` 或 `https://ark.cn-beijing.volces.com/api/v3` |
| `AI_MODEL` | 自己已开通的模型 ID，或受支持的模型接入点 ID |
| `AI_API_KEY` | 模型服务 API key |
| `ALLOWED_ORIGIN` | 网站 origin，如 `https://example.github.io`，不包含项目路径和末尾斜杠 |

需要本地联调时，`ALLOWED_ORIGIN` 可用逗号分隔追加明确的本地 origin。不要使用 `*`。模型 ID 不设默认值，避免无意调用未开通或不适配的模型。

当前使用 DeepSeek 时，建议设置 `AI_BASE_URL=https://api.deepseek.com`、`AI_MODEL=deepseek-flash`（2026-10-12 核对官方文档）。教学总结与反馈请求显式发送 `thinking: { type: 'disabled' }` 和 `response_format: { type: 'json_object' }`，将输出预算用于草稿，并减少无效 JSON 返回；这些参数只对 DeepSeek 地址发送，豆包使用自己开通的模型或接入点 ID，且不会收到这些参数。模型名称可能更新，切换时以账号可用模型和官方文档为准。

函数读取平台提供的 `SUPABASE_URL` 与 `SUPABASE_PUBLISHABLE_KEYS.default`；旧项目可回退至 `SUPABASE_ANON_KEY`。函数不使用 service role key。每次业务请求都通过 `auth.getUser(jwt)` 验证身份并检查 `app_owner.owner_id`，数据库查询使用同一用户 JWT，继续受 RLS 保护。

## 发布函数

先安装并验证当前 CLI；使用 `supabase --help`、`supabase link --help`、`supabase secrets set --help`、`supabase functions deploy --help` 确认本机版本支持的参数。链接到目标项目后，用该 CLI 版本支持的 Secrets 命令或控制台设置以上变量，部署函数名 `ai-assistant`。

`config.toml` 与已部署函数均使用 `verify_jwt = false`，由函数自行完成身份验证。此设置只关闭平台入口的预校验；函数仍强制要求 `Authorization: Bearer <用户会话 JWT>`，通过 Auth 服务的 `auth.getUser(jwt)` 验证身份，再检查唯一 `app_owner` 白名单。所有数据库操作继续携带该用户 JWT 并受 RLS 约束。publishable key 不能代替用户会话，不能删除这些服务端检查。允许 origin 的 CORS 预检可以不带会话；业务请求始终需要已登录本人身份。

Supabase 默认建议为用户 JWT 调用保留平台预校验，同时明确支持由函数处理鉴权的配置。本项目采用后一种方式；这不是新 publishable key 必须关闭预校验的通用要求。发布时确认远程函数的 `verify_jwt` 与此配置一致。

依赖锁定在该函数的 `deno.json`、`deno.lock` 中。修改依赖后重新运行类型检查、测试并更新锁文件，再发布函数。

数据库脚本只把 `students`、`knowledge_points`、`lessons`、`student_knowledge`、`monthly_reports` 加入 `supabase_realtime` publication。不要修改 `realtime` schema。若项目尚无该 publication，在控制台为上述五张表启用 Postgres Changes。

## 数据与 RPC 契约

数据列与 `src/types.ts` 对应；`student_knowledge` 的唯一状态是 `pending / weak / basic / mastered`。学生与知识目录采用归档方式管理。只有课堂记录开放本人删除权限，月报仍禁止修改和删除。

### 保存课堂

```ts
await client.rpc('save_lesson', {
  p_lesson: {
    id, student_id, lesson_date, content, performance, problems,
    homework_completion, homework, next_plan, feedback,
    knowledge_updates: [{ knowledge_point_id, status, note }],
  },
  p_expected_updated_at: currentLesson?.updated_at ?? null,
  p_mastery_versions: {
    [knowledge_point_id]: currentStudentKnowledge?.updated_at ?? null,
  },
});
```

返回完整 `Lesson`。新建可省略 `id`；编辑必须传最近读取到的课堂 `updated_at`。每个本次确认的知识点必须传原掌握记录的版本，新关联用 `null`。课堂和掌握变更在同一事务保存；任一冲突则全部回滚。

编辑旧课不能覆盖后来由其他课堂或手动更新的掌握状态。遇到 `lesson_conflict` 请刷新课堂；遇到 `mastery_conflict` 请刷新掌握记录，或取消本次掌握变更后保存课堂。编辑传入空 `knowledge_updates` 不会擦除该课原有的知识记录，也不改变掌握状态；新确认的知识记录按知识点合并到该课中。

### 删除课堂

发布含删除入口的前端之前，在已有项目执行一次 `lesson-deletion.sql`，无需重新运行 `schema.sql`。脚本只添加删除策略、最小权限与 RPC，不删除现有记录。删除功能本身不涉及 AI 函数；反馈润色功能需要同时更新 `ai-assistant`。

```ts
await client.rpc('delete_lesson', {
  p_lesson_id: lesson.id,
  p_expected_updated_at: lesson.updated_at,
});
```

确认弹窗固定使用打开时的 `updated_at`，刷新数据不会悄悄替换用户确认过的版本。RPC 校验本人白名单及记录归属，与 `save_lesson` 使用同一学生事务锁，再校验行版本；成功后返回被删除的课堂 ID。`lesson_delete_conflict` 表示课堂已更新，`lesson_missing` 表示记录已不存在或不可访问。

删除在同一事务中解除当前掌握记录的 `last_lesson_id` 关联并移除课堂，课堂反馈随同一行移除；不回退、推断或删除掌握状态和备注，也不改动后续课堂及手动评估。解除来源会更新掌握记录版本，旧表单不会覆盖它。已生成月报与导出快照保持原样，新报告不再包含被删除课堂。

Postgres Changes 的 DELETE 通知不能按行过滤，因此课堂订阅不附加 `owner_id` filter；事件只触发重新读取，业务数据仍由本人白名单和 RLS 决定可见范围，不直接信任事件载荷。请求未收到响应时提示核对结果，不将网络失败当作删除成功。

### 保存月报

```ts
await client.rpc('save_monthly_report', {
  p_student_id, p_period_start, p_period_end, p_content,
  p_title, // optional
  p_expected_snapshot_hash, // optional; the AI function supplies this
});
```

返回完整 `MonthlyReport`。默认自然月，也可调整起止日期；结束日期包含当天，周期最多 366 天。`p_content` 包含 `state / level / guidance / supplement / plan` 五个文字字段；`supplement` 可为空，其余需有内容。手工报告也使用此 RPC。

`monthly_report_context` 接受同样的学生与周期参数，返回 `{ snapshot, snapshot_hash }`。它从数据库一次性读取学生、周期内课堂及当前知识状态；没有课堂记录的周期不能生成月报。AI 使用该快照拟稿，保存时再核对 hash，生成期间源数据变化会明确报错，不保存与证据不符的报告。

INSERT 触发器强制从真实数据库重建 snapshot，浏览器不能伪造它。每个学生同一起止周期只能一份；重试返回原报告。月报没有 UPDATE/DELETE 权限，触发器还会阻止管理角色意外修改或删除。后续编辑课堂和知识状态不会改变已生成的月报或其导出依据。

知识快照代表生成报告时的当前状态，并不虚构过去月份的月末状态。

## AI 调用契约

```ts
await client.functions.invoke('ai-assistant', {
  body: { action: 'lesson_feedback', lesson_id },
}); // { feedback: string }

await client.functions.invoke('ai-assistant', {
  body: { action: 'monthly_report', student_id, period_start, period_end, context: '' },
}); // { report: MonthlyReport }, generation also saves the immutable report

await client.functions.invoke('ai-assistant', {
  body: { action: 'student_insights', student_id },
}); // { insights: string, suggestions: string[] }
```

课后反馈每次都读取本节课已保存的内容、表现、问题、上次作业完成情况、本次作业和下节课计划。反馈框中的人工修改与已有反馈不作为再次生成的依据；旧浏览器发送的可选 `draft` 仍检查类型和 12000 字上限，但会被丢弃，不发送给模型。

模型返回 `class_content`、`class_performance`、`next_plan`、`homework` 四个字符串数组，按已有记录归类、分点和润色。每条最多 2500 字，每类最多 40 条，缺失资料返回空数组；字段缺失、类型错误或旧的整段 `feedback` 输出会被拒绝。服务端将这些要点组装为不超过 12000 字的 `{ feedback: string }` 响应：

```text
[学生姓名]家长您好，我是数学付老师
以下是孩子[上课日期：年/月/日]的数学课堂反馈，请您查收[太阳]

1️⃣课堂内容
（1）[知识点或课堂任务]

2️⃣课堂表现
（1）[已记录的表现、问题或上次作业情况]

3️⃣课后作业及后续计划
（1）下节课计划：[已记录的计划]
（2）课后作业：[已记录的任务及条件]
```

姓名、日期、署名、标题和序号由程序生成。空白单项略过，整栏无资料时写“待补充”；课堂表现、计划或作业对应的原始字段全空时，服务端也会丢弃模型为该类补写的内容。计划排在作业之前，不为缺少的单项额外添加占位文字。

只整理老师已有的观察、原因、建议与任务，保留数量、题号、否定和替代安排的条件，不自行添加原因分析、练习或家长建议。不写考试成绩分数或提分承诺，数学分数、公式、页码、题号及耗时可正常使用。生成只返回待核对文字；老师可继续修改、复制并显式保存，失败时保留编辑稿。再次整理前，页面会提醒未保存文字将被替换。

薄弱归纳与下节建议不会改动掌握状态。月报模型成功且格式校验通过后永久保存一次。已有月报直接返回原件，不再调用模型。模型错误、格式错误、输出中断、超时或源数据冲突时均不创建替代报告。

请求只接受已知动作与对应字段，最多 64 KiB。模型来源仅为服务端指定的 HTTPS 地址，拒绝浏览器传入地址或密钥；模型请求禁止重定向，超时为 55 秒。持久限流为每分钟 12 次、每天 120 次，包含失败的模型尝试；计数存储不含学生内容。

错误响应为 `{ error: { code, message } }`，不返回数据库、鉴权头或模型服务的原始错误。应用代码不记录教学内容及密钥。供应商自身的数据处理以其账号配置为准。

## 验证

纯逻辑测试可使用支持 TypeScript 转换的 Node.js：

```sh
pnpm test:ai
```

函数目录中运行 `deno check index.ts` 和 `deno test --allow-env handler.test.ts`。函数测试使用 mock 验证鉴权、白名单、JWT 传递、月报保存和失败路径，不调用模型或生产数据库。SQL 验证脚本 `tests/schema.test.mjs` 使用临时内存 Postgres，不连接生产库，需要测试环境提供 `@electric-sql/pglite`。部署后还要在目标项目执行 advisor 检查，并确认匿名、其他账户与本人账户三种权限，以及两设备的 Realtime 同步。

## 官方参考

- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [数据库函数与权限](https://supabase.com/docs/guides/database/functions)
- [Edge Function 身份验证](https://supabase.com/docs/guides/functions/auth)
- [平台入口与鉴权头](https://supabase.com/docs/guides/functions/auth-headers)
- [getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Function Secrets](https://supabase.com/docs/guides/functions/secrets)
- [函数依赖](https://supabase.com/docs/guides/functions/dependencies)
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [模型 Chat API](https://api-docs.deepseek.com/api/create-chat-completion/)
- [思考模式与当前模型示例](https://api-docs.deepseek.com/guides/thinking_mode/)
- [对话接口](https://docs.volcengine.com/docs/ark/chat-api?lang=zh)
