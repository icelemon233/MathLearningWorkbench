# Math Learning Workbench · 数学学习工作台

[English](./README.md) | 简体中文

为数学教师整理课堂记录、跟踪知识掌握情况、撰写课后反馈与学习报告的工作台。

## 可以做什么

- 维护学生档案与数学知识目录。
- 记录课堂内容、作业、观察与下节计划。
- 跟踪每位学生对各个知识点的掌握情况。
- 撰写、修改课后反馈，也可选择 AI 辅助。
- 按月份或自定周期生成报告，导出 Word，或通过打印保存为 PDF。

已保存的报告会保留生成时的学习记录快照。AI 草稿可以继续修改，分享前应由教师核对。

## 使用自己的工作台

应用需要已配置的 Supabase 后端和获准使用的账户。AI 辅助为可选功能，课堂记录与反馈也可手动整理。

本地运行需要 Node.js 24 和 pnpm 11.25.0。先准备自己的后端与账户，再将 `.env.example` 复制为 `.env.local`，填写项目地址和 publishable 客户端密钥。模型凭据应配置在后端。

```sh
pnpm install --frozen-lockfile
node scripts/validate-config.mjs
pnpm dev
```

打开服务输出的本地地址，使用自己部署时配置的账户登录。
