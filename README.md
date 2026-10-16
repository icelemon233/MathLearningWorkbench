# Math Learning Workbench

English | [简体中文](./README.zh-CN.md)

A workspace for math tutors to record lessons, track topic mastery, and turn class notes into useful feedback and learning reports.

## What you can do

- Maintain student profiles and a math topic catalog.
- Record lesson content, homework, observations, and next steps.
- Track each student's understanding of individual topics.
- Write and revise feedback, with optional AI assistance.
- Create reports for a month or a custom period, export Word documents, or print to PDF.

Saved reports preserve a snapshot of the learning record at the time they are created. AI drafts remain editable and should be reviewed before sharing.

## Use your own workspace

The app requires a configured Supabase backend and an authorized account. AI assistance is optional; recording lessons and writing feedback can be done manually.

For a local setup, use Node.js 24 and pnpm 11.25.0. Prepare your own backend and account, then copy `.env.example` to `.env.local` and fill in your project URL and publishable client key. Model credentials belong on the backend.

```sh
pnpm install --frozen-lockfile
node scripts/validate-config.mjs
pnpm dev
```

Open the local address printed by the server and sign in with the account configured for your deployment.
