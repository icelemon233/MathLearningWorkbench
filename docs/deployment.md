# 部署说明

站点入口：[数学学习工作台](https://icelemon233.github.io/math-learning-workbench/)。前端由 GitHub Pages 发布，数据、登录与模型调用由独立后端提供。

## 访问边界

登录页面与前端程序公开可访问。学生资料、课堂记录和月报由数据库权限保护，仅本人获准账户可读取和修改；隐藏按钮或知道站点网址都不构成授权。

仓库仅保存程序、数据库结构与部署说明。学生资料保存在数据库，报告下载到本人设备，不发布公共报告链接。

## 后端维护

当前部署已在独立项目初始化数据库、本人账户白名单与智能函数。结构与配置见 [后端说明](../supabase/backend-setup.md)。`supabase/schema.sql` 是初始结构，不要在当前项目重复执行；迁移到另一个项目时，应先确认它是本人选定的专用空项目。

课堂删除功能需要先应用 [增量脚本](../supabase/lesson-deletion.sql)，再发布前端。当前后端已应用该脚本并更新 `ai-assistant`，支持自由文本反馈润色；脚本不删除现有记录。新建项目仍需先运行初始结构再应用此增量脚本。

维护时核对以下配置：

1. 创建唯一登录账户，并关闭 **Allow new users to sign up**、匿名登录及不使用的登录提供方。
2. 将本人账户 ID 写入后端白名单。白名单不能由普通客户端新增或修改，也不写进公开源码。
3. 对所有业务表开启 RLS，撤销匿名访问，只授权必要操作；规则同时验证获准账户与记录归属。反馈允许编辑，保存的月报禁止修改。
4. 将需要同步的表加入实时 publication。各设备登录同一账户后订阅变化；重新联网后重新读取当前记录。
5. 部署智能函数。函数必须验证用户 JWT 与本人白名单，并通过用户权限读取资料；不能仅依赖浏览器校验或跨域限制。
6. 为 `supabase/functions/ai-assistant/index.ts` 对应的 `ai-assistant` 函数设置 Secrets：`AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY`、`ALLOWED_ORIGIN`。通过后台设置或 CLI 安全输入，不在前端、仓库变量或构建命令中传入模型密钥。`ALLOWED_ORIGIN` 填实际站点的 origin，不带仓库路径；不能使用 `*`。

权限或函数更新后应验证：未登录者无法读写业务表，未获准账户无法读写，获准本人能读写自己的记录；智能函数拒绝未认证和非本人调用。已保存月报应保持原快照。当前真实检查与待验收范围见 [验证记录](verification.md)；操作说明中要求的开关不能代替控制台的实际状态核对。

## 前端仓库与变量

源码使用独立 `math-learning-workbench` 公共仓库，Pages 发布源已设为 GitHub Actions。公开源码中不能含私人资料。私有源仓库也不等于私有站点。

仓库已配置以下两个 **Repository variables**；更换后端时，在 **Settings → Secrets and variables → Actions → Variables** 更新：

| 名称 | 内容 |
| --- | --- |
| `VITE_SUPABASE_URL` | 选定托管项目的 HTTPS 根地址 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 该项目的 `sb_publishable_` 公开密钥 |

公开密钥仅标识应用，数据权限由本人会话和 RLS 决定。不要填写 `sb_secret_`、旧版 `service_role` JWT、登录密码或模型 API Key。

在 **Settings → Pages** 保持 **GitHub Actions** 发布源。工作流仅在 `main` 推送时自动运行，发布构建后的 `dist/`；开发分支不会自动发布。

## 工作流与本地检查

运行环境固定为 Node.js 24、pnpm 11.25.0，使用锁文件安装依赖。工作流将官方 Actions 固定到完整提交 SHA，并将构建权限与部署权限分开；不需要额外的长期发布 token。

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
node scripts/validate-config.mjs
pnpm test
pnpm build
node scripts/validate-config.mjs --check-dist
```

本地校验读取 `.env.local` 等生产模式环境文件和当前进程变量，与正式构建保持一致。配置缺失、使用后端密钥或新增未经允许的 `VITE_` 变量时会阻止发布；构建产物还会检查常见后端凭证格式。检查无法代替源码与权限审阅。

## 发布后核验

等待 **Actions → Deploy static site** 完成，使用 `github-pages` 环境返回的网址打开站点。核验首页资源可加载、未登录无学生数据、本人可登录、记录可保存，以及第二台已登录设备能接收更新。最后检查反馈复制、月报 Word 下载与打印 PDF。

模型未配置时不应把固定模板冒充实时智能结果。配置模型后，再验证反馈、月报、薄弱归纳与下节建议。课后反馈可核对、编辑后保存；月报生成前确认周期和依据，保存后固定不再修改。

## 故障定位

- **配置检查失败**：补齐仓库 Variables，确认只填写公开项目配置，然后重新运行失败工作流。
- **Pages 配置读取失败**：确认已选择 GitHub Actions 发布源，且账户计划允许该仓库发布 Pages。
- **登录失败**：确认本人账户已创建、密码正确且后端项目正常运行；保持公开注册关闭。
- **页面可打开但数据无权限**：检查白名单、表授权和 RLS，不要通过关闭 RLS 解决。
- **多端未更新**：检查登录会话、实时 publication、订阅状态；重新联网后重新读取数据。
- **智能生成失败**：检查后端 Secrets、模型 ID、额度和函数日志；不要把模型 Key 临时塞进前端。

## 官方参考

- [静态 Pages 工作流与权限](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [登录与注册配置](https://supabase.com/docs/guides/auth/general-configuration)
- [行级访问规则](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [公开密钥和后端密钥](https://supabase.com/docs/guides/getting-started/api-keys)
- [实时数据库变更](https://supabase.com/docs/guides/realtime/postgres-changes)
- [函数身份验证](https://supabase.com/docs/guides/functions/auth)
- [函数 Secrets](https://supabase.com/docs/guides/functions/secrets)
