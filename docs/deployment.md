# 部署说明

站点入口：[MathLearningWorkbench](https://icelemon233.github.io/MathLearningWorkbench/)。网页由 GitHub Pages 发布，数据、登录与模型调用由 Supabase 后端提供。托管工作台需要获准使用的账户；自行部署时使用自己的后端和账户。

## 准备后端

按[后端配置说明](../supabase/backend-setup.md)初始化专用项目、所有者账户与 AI 函数。先执行 `schema.sql`，再执行 `lesson-deletion.sql`；不要在已有同名业务表的项目重复运行初始脚本。

教学记录保存在数据库，导出的报告保存在使用者设备。仓库保存程序与数据库结构，不提交学生资料、账户标识、密码或模型密钥。公开源码不会授予数据库访问权限，权限仍由登录会话、所有者白名单与 RLS 决定。

AI 辅助为可选功能。模型凭据通过 Edge Function Secrets 配置，不传入前端构建。`ALLOWED_ORIGIN` 填网站 origin，例如 `https://example.github.io`，不包含仓库路径；不能使用 `*`。

## 配置仓库

在自己的仓库中设置以下 **Repository variables**：

| 名称 | 内容 |
| --- | --- |
| `VITE_SUPABASE_URL` | 自己的托管项目 HTTPS 根地址 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 该项目的 `sb_publishable_` 公开密钥 |

公开密钥标识应用，数据权限由会话和 RLS 决定。不要填写 `sb_secret_`、旧版 `service_role` JWT、登录密码或模型 API Key。

在 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。`main` 分支推送或手动运行 **Deploy website** 后，工作流校验配置、运行测试、构建并检查网页产物，再发布到当前仓库的 Pages 站点。

工作流仅上传 `dist/`。环境文件、后端脚本、项目源码目录和 source map 不进入网站产物；源码通过仓库公开提供。发布使用 GitHub Actions 的临时权限，无需跨仓库 SSH 发布密钥或个人访问令牌。

## 本地检查

运行环境为 Node.js 24、pnpm 11.25.0。复制 `.env.example` 为 `.env.local`，填写自己的公开前端配置后执行：

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
node scripts/validate-config.mjs
pnpm test
pnpm test:ai
pnpm test:publish
pnpm build
node scripts/validate-config.mjs --check-dist
node scripts/validate-public-build.mjs
```

配置检查仅允许项目地址和 publishable key 两个 `VITE_` 变量；构建检查拒绝源映射、环境文件、符号链接及常见后端凭证。生产构建使用相对资源路径，可部署在仓库对应的 Pages 子路径。

## 发布后核验

等待 **Deploy website** 的构建与部署作业均成功。访问仓库 Pages 地址，检查首页与静态资源可加载，并核对 `release.json` 中的 revision 与源码提交一致。

使用自己的账户检查登录、记录保存、退出后的访问限制，以及两台设备的实时同步和并发冲突提示。核对反馈复制、Word 导出与打印 PDF。AI 配置完成后再验证真实生成结果；模拟测试和部署成功不能代替真实账户验收。

部署自己的后端时，分别验证匿名、未获准账户和所有者的权限。不要通过关闭 RLS、开放注册或向前端写入服务端密钥来处理权限错误。

## 故障定位

- **配置检查失败**：核对仓库 Variables 和公开密钥类型，再重新运行工作流。
- **Pages 配置或部署失败**：确认发布源为 GitHub Actions，且部署作业具有 `pages: write`、`id-token: write` 权限。
- **页面可打开但资源加载失败**：检查实际发布地址与资源路径，确认上传的是 `dist/`。
- **登录或数据访问失败**：核对账户、所有者白名单、表授权与 RLS，保留访问限制。
- **智能生成失败**：核对后端 Secrets、模型配置、额度与函数日志，不将模型密钥放入前端。

## 相关说明

- [后端初始化与接口](../supabase/backend-setup.md)
- [验证记录](verification.md)
- [GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
