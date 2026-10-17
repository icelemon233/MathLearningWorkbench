<p align="center"><img src="./docs/brand/cinna-app-icon.png" alt="MathLearningWorkbench icon" width="128"></p>

<h1 align="center">MathLearningWorkbench</h1>

<p align="center">English · <a href="./README.zh-CN.md">简体中文</a></p>

A workspace for math tutors to keep lesson records, track topic mastery, and prepare feedback and learning reports.

[Open workspace](https://icelemon233.github.io/MathLearningWorkbench/). The hosted workspace requires an authorized account.

## Lessons and reports

- Maintain student profiles and a math topic catalog.
- Record lesson content, homework, observations, and next steps.
- Update each student's mastery of individual topics.
- Write feedback or generate an editable AI draft.
- Create reports for a month or a custom period; export Word files or print to PDF.

Saved reports keep a snapshot of the learning record when they are created. Review AI drafts before sharing them.

## Run your own workspace

Requires Node.js 24, pnpm 11.25.0, a configured Supabase backend, and an authorized account. AI assistance is optional.

Follow the [backend setup guide](supabase/backend-setup.md) to prepare your backend and account, then copy `.env.example` to `.env.local`. Fill in your project URL and publishable client key; model credentials stay on the backend.

```sh
pnpm install --frozen-lockfile
node scripts/validate-config.mjs
pnpm dev
```

Open the local address printed by the server and sign in with the account configured for your deployment.

## Deployment

This repository includes the application and backend source. GitHub Pages hosts the web app; teaching records and model credentials stay in your backend. See the [deployment guide](docs/deployment.md) to publish your own workspace.

Developer: Cinna.
