<p align="center"><img src="./docs/brand/cinna-app-icon.png" alt="Math Learning Workbench Cinna icon" width="128"></p>

<h1 align="center">Math Learning Workbench</h1>

<p align="center">English · <a href="./README.zh-CN.md">简体中文</a></p>

A workspace for math tutors to keep lesson records, track topic mastery, and prepare feedback and learning reports.

## Lessons and reports

- Maintain student profiles and a math topic catalog.
- Record lesson content, homework, observations, and next steps.
- Update each student's mastery of individual topics.
- Write feedback or generate an editable AI draft.
- Create reports for a month or a custom period; export Word files or print to PDF.

Saved reports keep a snapshot of the learning record when they are created. Review AI drafts before sharing them.

## Run your own workspace

Requires Node.js 24, pnpm 11.25.0, a configured Supabase backend, and an authorized account. AI assistance is optional.

Prepare your backend and account, then copy `.env.example` to `.env.local`. Fill in your project URL and publishable client key; model credentials stay on the backend.

```sh
pnpm install --frozen-lockfile
node scripts/validate-config.mjs
pnpm dev
```

Open the local address printed by the server and sign in with the account configured for your deployment.

## Deployment and source privacy

The application source, backend code, and maintenance documents stay in a private repository. Pushing `main` runs configuration checks, tests, and a production build, then copies only validated web files to the public distribution repository. Its Pages workflow publishes the website at the existing address.

Source maps, environment files, and project source directories are blocked before publication. Browser JavaScript remains downloadable; student records and model credentials are not included in the build. See the [deployment guide](docs/deployment.md) for repository permissions, the scoped deployment key, and release verification.
