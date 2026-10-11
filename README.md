# 数学学习工作台

供本人管理学生、记录课堂情况、整理课后反馈与月度学习报告。登录入口公开，学生资料只允许获准的本人账户访问；页面不会附带预置学生或私人业务数据。

网站入口：[数学学习工作台](https://icelemon233.github.io/math-learning-workbench/)。使用已配置的本人账户登录；网站不提供注册入口。

界面使用 Ant Design 6：统一导航、响应式卡片、筛选表格、表单校验、日期选择、弹窗和消息提示。手机端使用抽屉导航，较宽的记录表格可横向滚动。

## 功能

- 手动维护数学知识目录，为每位学生记录「待评估、薄弱、基本掌握、已掌握」四种掌握状态与备注。
- 用简短表单记录课堂内容、表现、问题、作业与下节计划；保存后更新知识掌握情况并同步到其他已登录设备。
- 按固定家长反馈格式生成课后反馈：知识点分行，课堂表现分为状态、问题、原因与对策三段，先写下节计划再写作业；可编辑、保存并复制文字。
- 按所选月份或自定日期周期汇总课堂与掌握情况，手动整理或智能生成月报，并保存为固定快照；已保存月报不随后续记录变化，可导出 Word，或通过浏览器打印另存为 PDF。
- 智能辅助生成反馈、月报、薄弱点归纳和下节建议；生成内容需要本人核对。未配置模型时仍可手动记录与整理。

## 本地运行

需要 Node.js 24 与 pnpm 11.25.0。

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
```

将 `.env.example` 复制为 `.env.local`，填写项目地址和 **publishable key**。这两个值用于浏览器访问受权限保护的数据，不能替换为 secret、service_role 或模型 API Key。

```sh
node scripts/validate-config.mjs
pnpm dev
```

本地页面同样需要完成数据库与本人账户配置。仅启动静态前端不会产生远程数据库或模型服务。

## 在线使用与更新

1. 登录网站，添加学生与年级，维护数学知识目录，再为学生关联适用知识点。
2. 课后记录事实与掌握情况，生成、核对并保存反馈；按月份或自定周期生成固定月报。
3. 源码更新推送到 `main` 后，工作流会校验配置、测试、构建并发布。发布结果在仓库 Actions 中查看。

当前站点使用独立后端和本人账户白名单。后端配置见 [后端说明](supabase/backend-setup.md)，日常维护见 [部署说明](docs/deployment.md)，验证范围与待验收项目见 [验证记录](docs/verification.md)。

## 验证

```sh
node scripts/validate-config.mjs
pnpm test
pnpm test:ai
pnpm build
node scripts/validate-config.mjs --check-dist
```

模型凭证只保存在后端 Secrets。不要把凭证、登录密码、报告或学生资料提交进仓库，也不要在聊天中提供高权限密钥。
