# 后端配置

本目录包含初始 SQL 和 AI Edge Function。数据库与模型密钥都在服务端，网站构建产物仅包含项目公开地址和 publishable key。源附件与学生资料不放入仓库。

## 初始化数据库与账户

1. 在专用的空项目中使用 SQL Editor 执行 `schema.sql` 一次。该文件不是 migration，不要重复执行到已有同名表的项目。
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

当前使用 DeepSeek 时，建议设置 `AI_BASE_URL=https://api.deepseek.com`、`AI_MODEL=deepseek-flash`（2026-10-12 核对官方文档）。教学总结与反馈请求显式发送 `thinking: { type: 'disabled' }`，将输出预算用于草稿；该参数只对 DeepSeek 地址发送，豆包使用自己开通的模型或接入点 ID，且不会收到此参数。模型名称可能更新，切换时以账号可用模型和官方文档为准。

函数读取平台提供的 `SUPABASE_URL` 与 `SUPABASE_PUBLISHABLE_KEYS.default`；旧项目可回退至 `SUPABASE_ANON_KEY`。函数不使用 service role key。每次业务请求都通过 `auth.getUser(jwt)` 验证身份并检查 `app_owner.owner_id`，数据库查询使用同一用户 JWT，继续受 RLS 保护。

## 发布函数

先安装并验证当前 CLI；使用 `supabase --help`、`supabase link --help`、`supabase secrets set --help`、`supabase functions deploy --help` 确认本机版本支持的参数。链接到目标项目后，用该 CLI 版本支持的 Secrets 命令或控制台设置以上变量，部署函数名 `ai-assistant`。

`config.toml` 与已部署函数均使用 `verify_jwt = false`，由函数自行完成身份验证。此设置只关闭平台入口的预校验；函数仍强制要求 `Authorization: Bearer <用户会话 JWT>`，通过 Auth 服务的 `auth.getUser(jwt)` 验证身份，再检查唯一 `app_owner` 白名单。所有数据库操作继续携带该用户 JWT 并受 RLS 约束。publishable key 不能代替用户会话，不能删除这些服务端检查。允许 origin 的 CORS 预检可以不带会话；业务请求始终需要已登录本人身份。

Supabase 默认建议为用户 JWT 调用保留平台预校验，同时明确支持由函数处理鉴权的配置。本项目采用后一种方式；这不是新 publishable key 必须关闭预校验的通用要求。发布时确认远程函数的 `verify_jwt` 与此配置一致。

依赖锁定在该函数的 `deno.json`、`deno.lock` 中。修改依赖后重新运行类型检查、测试并更新锁文件，再发布函数。

数据库脚本只把 `students`、`knowledge_points`、`lessons`、`student_knowledge`、`monthly_reports` 加入 `supabase_realtime` publication。不要修改 `realtime` schema。若项目尚无该 publication，在控制台为上述五张表启用 Postgres Changes。

## 数据与 RPC 契约

数据列与 `src/types.ts` 对应；`student_knowledge` 的唯一状态是 `pending / weak / basic / mastered`。学生与知识目录采用归档方式管理，浏览器没有物理删除记录的权限。

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

课后反馈返回草稿，由老师编辑保存；薄弱归纳与下节建议不会改动掌握状态。月报模型成功且格式校验通过后永久保存一次。已有月报直接返回原件，不再调用模型。模型错误、格式错误、输出中断、超时或源数据冲突时均不创建替代报告。

请求只接受已知动作与对应字段，最多 16 KiB。模型来源仅为服务端指定的 HTTPS 地址，拒绝浏览器传入地址或密钥；模型请求禁止重定向，超时为 55 秒。持久限流为每分钟 12 次、每天 120 次，包含失败的模型尝试；计数存储不含学生内容。

错误响应为 `{ error: { code, message } }`，不返回数据库、鉴权头或模型服务的原始错误。应用代码不记录教学内容及密钥。供应商自身的数据处理以其账号配置为准。

## 验证

纯逻辑测试可使用支持 TypeScript 转换的 Node.js：

```sh
node --experimental-transform-types --test supabase/functions/ai-assistant/logic.test.ts
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
