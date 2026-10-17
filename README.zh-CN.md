<p align="center"><img src="./docs/brand/cinna-app-icon.png" alt="MathLearningWorkbench icon" width="128"></p>

<h1 align="center">MathLearningWorkbench</h1>

<p align="center"><a href="./README.md">English</a> · 简体中文</p>

供数学教师记录课堂、跟踪知识掌握情况、整理课后反馈与学习报告。

## 课堂与报告

- 维护学生档案和数学知识目录。
- 记录课堂内容、作业、观察和下节计划。
- 更新每位学生对各知识点的掌握情况。
- 手动写反馈，或生成可修改的 AI 草稿。
- 按月份或自定周期生成报告，导出 Word，或通过打印保存为 PDF。

已保存的报告保留生成时的学习记录快照。AI 草稿分享前需要教师核对。

## 运行自己的工作台

需要 Node.js 24、pnpm 11.25.0、已配置的 Supabase 后端，以及获准使用的账户。AI 辅助为可选功能。

准备后端与账户后，将 `.env.example` 复制为 `.env.local`，填写项目地址和 publishable 客户端密钥。模型凭据留在后端。

```sh
pnpm install --frozen-lockfile
node scripts/validate-config.mjs
pnpm dev
```

## 部署与源码访问

完整源码、后端代码和维护文档保存在私有仓库。推送 `main` 后，工作流校验配置、测试并构建，再把通过检查的网页产物同步到公开发布仓库 [CinnaGithubPage](https://github.com/icelemon233/CinnaGithubPage)，由它的 Pages 工作流发布[网站](https://icelemon233.github.io/CinnaGithubPage/math-learning-workbench/)。

发布前会阻止源映射、环境文件和项目源码目录进入公开仓库。浏览器运行需要下载前端 JavaScript，因此前端构建文件仍可查看；学生资料与模型凭证不包含在构建中。仓库权限、专用发布密钥和版本核验方法见 [部署说明](docs/deployment.md)。

打开服务输出的本地地址，使用自己部署时配置的账户登录。

开发者：Cinna。
