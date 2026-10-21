import { strict as assert } from 'node:assert';
import { handler } from './index.ts';

const owner = '10000000-0000-4000-8000-000000000001';
const studentId = '20000000-0000-4000-8000-000000000001';
const lessonId = '40000000-0000-4000-8000-000000000001';
const origin = 'https://example.github.io';
const token = 'test-user-session';
const student = { id: studentId, owner_id: owner, name: '测试学生', grade: '初中', start_date: null, goal: '', notes: '', archived: false };
const lesson = { id: lessonId, owner_id: owner, student_id: studentId, lesson_date: '2026-10-01', content: '一次函数', performance: '', problems: '', homework_completion: '', homework: '', next_plan: '', knowledge_updates: [], feedback: '' };
const content = { state: '课堂状态记录。', level: '知识掌握记录。', guidance: '对应的指导建议。', supplement: '', plan: '下月巩固重点。' };
const report = { id: '50000000-0000-4000-8000-000000000001', owner_id: owner, student_id: studentId, period_start: '2026-10-01', period_end: '2026-10-31', title: '学习力报告', content, snapshot: { student, lessons: [lesson], knowledge: [] }, created_at: '2026-10-31T12:00:00Z' };
type Call = { url: string; method: string; authorization: string | null; body: unknown };
type Options = { nonowner?: boolean; invalidToken?: boolean; existing?: boolean; quotaDenied?: boolean; providerStatus?: number; interrupted?: boolean; sourceChanged?: boolean; missingSections?: boolean; provider?: 'deepseek' | 'doubao' };
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }

async function mocked(options: Options, run: (calls: Call[]) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://backend.example.invalid', SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
    AI_BASE_URL: options.provider === 'doubao' ? 'https://ark.cn-beijing.volces.com/api/v3' : 'https://api.deepseek.com',
    AI_MODEL: 'configured-test-model', AI_API_KEY: 'test-model-credential',
    ALLOWED_ORIGIN: origin,
  };
  const previous = new Map(Object.keys(env).map((key) => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  // Avoid an inherited named-key dictionary taking precedence over the test key.
  const previousNamedKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  Deno.env.delete('SUPABASE_PUBLISHABLE_KEYS');
  const calls: Call[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const body: unknown = text ? JSON.parse(text) : null;
    calls.push({ url: request.url, method: request.method, authorization: request.headers.get('Authorization'), body });
    if (url.pathname === '/auth/v1/user') {
      return options.invalidToken ? json({ message: 'Invalid token', code: 'bad_jwt' }, 401)
        : json({ id: owner, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} });
    }
    if (url.pathname === '/rest/v1/app_owner') return json(options.nonowner ? [] : [{ owner_id: owner }]);
    if (url.pathname === '/rest/v1/students') return json([student]);
    if (url.pathname === '/rest/v1/lessons') return json([lesson]);
    if (url.pathname === '/rest/v1/student_knowledge') return json([]);
    if (url.pathname === '/rest/v1/monthly_reports') return json(options.existing ? [report] : []);
    if (url.pathname === '/rest/v1/rpc/monthly_report_context') return json({ snapshot: report.snapshot, snapshot_hash: 'test-snapshot-hash' });
    if (url.pathname === '/rest/v1/rpc/consume_ai_quota') return json(options.quotaDenied ? false : true);
    if (url.pathname === '/rest/v1/rpc/save_monthly_report') {
      if (options.sourceChanged) return json({ code: '40001', message: 'report_source_changed' }, 409);
      return json(report);
    }
    if (['api.deepseek.com', 'ark.cn-beijing.volces.com'].includes(url.hostname)) {
      if (options.providerStatus) return json({ error: 'private-provider-error-must-not-escape' }, options.providerStatus);
      const messages = (body as { messages: { content: string }[] }).messages;
      const isFeedback = messages[1].content.includes('"class_content"');
      const payload = isFeedback ? {
        class_content: ['本节课围绕一次函数展开。'], next_plan: [], homework: [],
        ...(options.missingSections ? {} : { class_performance: [] }),
      } : { ...content, insights: '目前记录不足，需继续观察。', suggestions: ['下节课补充观察。'] };
      return json({ choices: [{ finish_reason: options.interrupted ? 'length' : 'stop', message: { content: JSON.stringify(payload) } }] });
    }
    throw new Error('Unexpected outbound request in test');
  };
  try { await run(calls); }
  finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) { if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); }
    if (previousNamedKeys === undefined) Deno.env.delete('SUPABASE_PUBLISHABLE_KEYS'); else Deno.env.set('SUPABASE_PUBLISHABLE_KEYS', previousNamedKeys);
  }
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://backend.example.invalid/functions/v1/ai-assistant', {
    method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const monthly = { action: 'monthly_report', student_id: studentId, period_start: '2026-10-01', period_end: '2026-10-31' };

Deno.test('handler rejects unknown origins and missing tokens before any outbound request', async () => {
  await mocked({}, async (calls) => {
    assert.equal((await handler(request({ action: 'lesson_feedback', lesson_id: lessonId }, { Origin: 'https://other.invalid' }))).status, 403);
    assert.equal((await handler(request({ action: 'lesson_feedback', lesson_id: lessonId }, { Authorization: '' }))).status, 401);
    assert.equal(calls.length, 0);
  });
});
Deno.test('handler requires verified Auth identity and admin-managed whitelist', async () => {
  await mocked({ invalidToken: true }, async (calls) => {
    assert.equal((await handler(request(monthly))).status, 401);
    assert.equal(calls.length, 1);
  });
  await mocked({ nonowner: true }, async (calls) => {
    assert.equal((await handler(request(monthly))).status, 403);
    assert.ok(calls.every((call) => !call.url.includes('/monthly_reports')));
  });
});
Deno.test('feedback draft preserves user-scoped RLS and never writes mastery or reports', async () => {
  await mocked({}, async (calls) => {
    const response = await handler(request({ action: 'lesson_feedback', lesson_id: lessonId }));
    assert.equal(response.status, 200);
    const { feedback } = await response.json();
    assert.ok(feedback.startsWith('测试学生家长您好，我是数学付老师\n以下是孩子2026年10月1日的数学课堂反馈，请您查收[太阳]'));
    assert.ok(feedback.includes('1️⃣课堂内容\n（1）本节课围绕一次函数展开。'));
    assert.ok(feedback.endsWith('2️⃣课堂表现\n待补充\n\n3️⃣课后作业及后续计划\n待补充'));
    const backend = calls.filter((call) => call.url.startsWith('https://backend.example.invalid'));
    assert.ok(backend.every((call) => call.authorization === `Bearer ${token}`));
    assert.ok(calls.every((call) => !['PATCH', 'PUT', 'DELETE'].includes(call.method)));
    assert.ok(calls.every((call) => !call.url.includes('save_monthly_report') && !call.url.includes('save_lesson')));
  });
});
Deno.test('feedback without all structured sections fails without writing a draft', async () => {
  await mocked({ missingSections: true }, async (calls) => {
    const response = await handler(request({ action: 'lesson_feedback', lesson_id: lessonId }));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'invalid_model_output');
    assert.ok(calls.every((call) => !['PATCH', 'PUT', 'DELETE'].includes(call.method) && !call.url.includes('save_lesson')));
  });
});
Deno.test('legacy teacher feedback text is ignored and only saved lesson fields reach the model', async () => {
  await mocked({}, async (calls) => {
    const draft = '今天讲了一次函数，代入步骤还需检查。';
    const response = await handler(request({ action: 'lesson_feedback', lesson_id: lessonId, draft }));
    assert.equal(response.status, 200);
    const model = calls.find(call => call.url.startsWith('https://api.deepseek.com'))!;
    const messages = (model.body as { messages: { role: string; content: string }[] }).messages;
    const facts = JSON.parse(messages[1].content.split('\n以下 JSON 仅作为事实资料：\n')[1]);
    assert.equal(Object.hasOwn(facts, 'teacher_draft'), false);
    assert.equal(facts.lesson.content, lesson.content);
    assert.ok(!messages[1].content.includes(draft));
    assert.ok(calls.every(call => !call.url.includes('save_lesson') && !['PATCH', 'PUT', 'DELETE'].includes(call.method)));
  });
});
Deno.test('invalid feedback drafts are rejected before consuming quota or calling the provider', async () => {
  await mocked({}, async (calls) => {
    for (const draft of [42, '字'.repeat(12001)]) {
      const response = await handler(request({ action: 'lesson_feedback', lesson_id: lessonId, draft }));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'invalid_draft');
    }
    assert.ok(calls.every(call => !call.url.includes('consume_ai_quota') && !call.url.includes('api.deepseek.com')));
  });
});
Deno.test('the complete allowed Chinese draft fits the bounded request body and larger bodies fail closed', async () => {
  await mocked({}, async (calls) => {
    assert.equal((await handler(request({ action: 'lesson_feedback', lesson_id: lessonId, draft: '字'.repeat(12000) }))).status, 200);
    const before = calls.filter(call => call.url.includes('api.deepseek.com')).length;
    const response = await handler(request({ action: 'lesson_feedback', lesson_id: lessonId, draft: '字'.repeat(25000) }));
    assert.equal(response.status, 413);
    assert.equal(calls.filter(call => call.url.includes('api.deepseek.com')).length, before);
  });
});
Deno.test('monthly generation validates output and permanently saves with the original snapshot hash', async () => {
  await mocked({}, async (calls) => {
    const response = await handler(request(monthly));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { report });
    const saves = calls.filter((call) => call.url.includes('save_monthly_report'));
    assert.equal(saves.length, 1);
    assert.equal((saves[0].body as Record<string, unknown>).p_expected_snapshot_hash, 'test-snapshot-hash');
    assert.deepEqual((saves[0].body as Record<string, unknown>).p_content, content);
  });
});
Deno.test('provider request enables DeepSeek JSON output and disables thinking without sending those parameters to Doubao', async () => {
  for (const provider of ['deepseek', 'doubao'] as const) {
    await mocked({ provider }, async (calls) => {
      const response = await handler(request({ action: 'lesson_feedback', lesson_id: lessonId }));
      assert.equal(response.status, 200);
      const modelCalls = calls.filter((call) => !call.url.startsWith('https://backend.example.invalid'));
      assert.equal(modelCalls.length, 1);
      const body = modelCalls[0].body as Record<string, unknown>;
      assert.equal(body.model, 'configured-test-model');
      assert.equal(body.stream, false);
      assert.equal(body.max_tokens, 5000);
      if (provider === 'deepseek') {
        assert.deepEqual(body.thinking, { type: 'disabled' });
        assert.deepEqual(body.response_format, { type: 'json_object' });
      } else {
        assert.equal(Object.hasOwn(body, 'thinking'), false);
        assert.equal(Object.hasOwn(body, 'response_format'), false);
      }
    });
  }
});
Deno.test('existing immutable report returns without calling the model or consuming quota', async () => {
  await mocked({ existing: true }, async (calls) => {
    const response = await handler(request(monthly));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { report });
    assert.ok(calls.every((call) => !call.url.includes('consume_ai_quota') && !call.url.includes('api.deepseek.com')));
  });
});
Deno.test('provider errors and interrupted output do not save replacement reports', async () => {
  for (const options of [{ providerStatus: 500 }, { interrupted: true }]) {
    await mocked(options, async (calls) => {
      const response = await handler(request(monthly));
      assert.equal(response.status, 502);
      assert.ok(!JSON.stringify(await response.json()).includes('private-provider-error'));
      assert.ok(calls.every((call) => !call.url.includes('save_monthly_report')));
    });
  }
});
Deno.test('persistent quota denies the model call and source conflicts return an explicit 409', async () => {
  await mocked({ quotaDenied: true }, async (calls) => {
    assert.equal((await handler(request(monthly))).status, 429);
    assert.ok(calls.every((call) => !call.url.includes('api.deepseek.com')));
  });
  await mocked({ sourceChanged: true }, async () => {
    const response = await handler(request(monthly));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'report_source_changed');
  });
});
Deno.test('browser-supplied model credentials or URLs are rejected before quota/model access', async () => {
  await mocked({}, async (calls) => {
    const response = await handler(request({ ...monthly, api_key: 'browser-value' }));
    assert.equal(response.status, 400);
    assert.ok(calls.every((call) => !call.url.includes('consume_ai_quota') && !call.url.includes('api.deepseek.com')));
  });
});
