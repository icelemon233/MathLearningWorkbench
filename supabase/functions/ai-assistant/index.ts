import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.117.3/cors';
import {
  ApiError, allowedOrigin, databaseError, feedbackOutput, insightsOutput, messagesFor, modelEndpoint,
  parseModelJson, readBoundedText, record, reportOutput, validateAction,
  type Action,
} from './logic.ts';

const MAX_BODY_BYTES = 16384;
const MODEL_TIMEOUT_MS = 55000;

function publishableKey(): string {
  const named = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (named) {
    try {
      const values: unknown = JSON.parse(named);
      if (record(values) && typeof values.default === 'string' && values.default) return values.default;
    } catch { /* A legacy public key may be present in older projects. */ }
  }
  const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
  if (!key) throw new ApiError(503, 'backend_not_configured', 'AI 服务尚未完成数据库配置。');
  return key;
}

async function callModel(action: Action, source: Record<string, unknown>): Promise<Record<string, unknown>> {
  const endpoint = modelEndpoint(Deno.env.get('AI_BASE_URL'));
  const model = Deno.env.get('AI_MODEL')?.trim();
  const key = Deno.env.get('AI_API_KEY')?.trim();
  if (!model || !key) throw new ApiError(503, 'model_not_configured', 'AI 服务尚未配置模型和密钥。');
  const messages = messagesFor(action, source);
  // These tasks draft summaries from supplied records; reserve output for the draft.
  // This provider-specific parameter must not be sent to other compatible APIs.
  const providerOptions = new URL(endpoint).hostname === 'api.deepseek.com'
    ? { thinking: { type: 'disabled' } } : {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, max_tokens: 5000, ...providerOptions }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const status = response.status;
      if (status === 401 || status === 403) throw new ApiError(502, 'provider_auth_failed', '模型服务认证失败，请检查服务端密钥和模型权限。');
      if (status === 429) throw new ApiError(429, 'provider_rate_limited', '模型服务请求过于频繁或额度不足，请稍后重试。');
      if (status === 400 || status === 404) throw new ApiError(502, 'provider_config_error', '模型或接口配置不兼容，请检查服务端配置。');
      throw new ApiError(502, 'provider_unavailable', '模型服务暂时不可用，请稍后重试。');
    }
    let responseValue: unknown;
    try { responseValue = JSON.parse(await readBoundedText(response.body, 262144)); }
    catch (error) {
      if (error instanceof ApiError) throw new ApiError(502, 'invalid_model_output', '模型返回内容过长，尚未保存，请重试。');
      throw new ApiError(502, 'invalid_model_output', '模型返回内容格式无效，尚未保存，请重试。');
    }
    const choice = record(responseValue) && Array.isArray(responseValue.choices) ? responseValue.choices[0] : undefined;
    if (!record(choice) || !record(choice.message) || typeof choice.message.content !== 'string') {
      throw new ApiError(502, 'invalid_model_output', '模型没有返回有效内容，尚未保存，请重试。');
    }
    if (choice.finish_reason !== 'stop') throw new ApiError(502, 'incomplete_model_output', '模型输出未完整结束，尚未保存，请重试。');
    return parseModelJson(choice.message.content);
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError(504, 'model_timeout', '模型响应超时，本次内容未保存，请稍后重试。');
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'provider_network_error', '无法连接模型服务，本次内容未保存，请稍后重试。');
  } finally { clearTimeout(timeout); }
}

export async function handler(request: Request): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin' });
  try {
    const origin = allowedOrigin(request.headers.get('Origin'), Deno.env.get('ALLOWED_ORIGIN'));
    for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') throw new ApiError(405, 'method_not_allowed', '仅支持 POST 请求。');
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
      throw new ApiError(415, 'json_required', '请求内容必须为 JSON。');
    }
    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large', '请求内容过长。');
    const authorization = request.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    if (!match) throw new ApiError(401, 'authentication_required', '请先登录。');
    const url = Deno.env.get('SUPABASE_URL');
    if (!url) throw new ApiError(503, 'backend_not_configured', 'AI 服务尚未完成数据库配置。');
    // This client uses the user's JWT for every database operation; no service key.
    const client = createClient(url, publishableKey(), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: auth, error: authError } = await client.auth.getUser(match[1]);
    if (authError || !auth.user) throw new ApiError(401, 'invalid_session', '登录已失效，请重新登录。');
    const { data: owner, error: ownerError } = await client.from('app_owner').select('owner_id').eq('owner_id', auth.user.id).maybeSingle();
    if (ownerError) throw new ApiError(503, 'owner_check_failed', '账户权限检查失败，请稍后重试。');
    if (!owner) throw new ApiError(403, 'owner_required', '该账户没有访问权限。');
    let payload: unknown;
    try { payload = JSON.parse(await readBoundedText(request.body, MAX_BODY_BYTES)); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, 'invalid_json', '请求格式无效。');
    }
    const action = validateAction(payload);
    let source: Record<string, unknown>;
    let sourceHash: string | undefined;
    if (action.action === 'monthly_report') {
      const { data: existing, error } = await client.from('monthly_reports').select('*')
        .eq('student_id', action.student_id).eq('period_start', action.period_start).eq('period_end', action.period_end).maybeSingle();
      if (error) throw databaseError(error);
      if (existing) return new Response(JSON.stringify({ report: existing }), { headers });
      const { data: context, error: contextError } = await client.rpc('monthly_report_context', {
        p_student_id: action.student_id, p_period_start: action.period_start, p_period_end: action.period_end,
      });
      if (contextError) throw databaseError(contextError);
      if (!record(context) || !record(context.snapshot) || typeof context.snapshot_hash !== 'string') throw new ApiError(500, 'invalid_source', '月度记录读取失败。');
      source = context.snapshot;
      sourceHash = context.snapshot_hash;
    } else if (action.action === 'lesson_feedback') {
      const { data: lesson, error } = await client.from('lessons').select('*').eq('id', action.lesson_id).maybeSingle();
      if (error) throw databaseError(error);
      if (!lesson) throw new ApiError(404, 'lesson_missing', '未找到课堂记录。');
      const { data: student, error: studentError } = await client.from('students').select('*').eq('id', lesson.student_id).maybeSingle();
      if (studentError) throw databaseError(studentError);
      if (!student) throw new ApiError(404, 'student_missing', '未找到学生记录。');
      source = { student, lesson };
    } else {
      const [studentResult, lessonsResult, knowledgeResult] = await Promise.all([
        client.from('students').select('*').eq('id', action.student_id).maybeSingle(),
        client.from('lessons').select('*').eq('student_id', action.student_id).order('lesson_date', { ascending: false }).order('created_at', { ascending: false }).limit(24),
        client.from('student_knowledge').select('*, knowledge_point:knowledge_points(*)').eq('student_id', action.student_id),
      ]);
      for (const result of [studentResult, lessonsResult, knowledgeResult]) if (result.error) throw databaseError(result.error);
      if (!studentResult.data) throw new ApiError(404, 'student_missing', '未找到学生记录。');
      if (!lessonsResult.data?.length && !knowledgeResult.data?.length) throw new ApiError(422, 'no_evidence', '请先记录课堂情况或知识掌握情况。');
      source = { student: studentResult.data, lessons: lessonsResult.data ?? [], knowledge: knowledgeResult.data ?? [] };
    }
    // Validate configuration/source before consuming the persistent request quota.
    modelEndpoint(Deno.env.get('AI_BASE_URL'));
    if (!Deno.env.get('AI_MODEL')?.trim() || !Deno.env.get('AI_API_KEY')?.trim()) throw new ApiError(503, 'model_not_configured', 'AI 服务尚未配置模型和密钥。');
    messagesFor(action, source);
    const { data: allowed, error: quotaError } = await client.rpc('consume_ai_quota');
    if (quotaError) throw databaseError(quotaError);
    if (allowed !== true) throw new ApiError(429, 'rate_limited', 'AI 请求频率达到限制，请稍后再试。');
    const generated = await callModel(action, source);
    if (action.action === 'lesson_feedback') {
      // A feedback draft is returned for the teacher to review/edit/save.
      return new Response(JSON.stringify({ feedback: feedbackOutput(generated) }), { headers });
    }
    if (action.action === 'student_insights') return new Response(JSON.stringify(insightsOutput(generated)), { headers });
    const content = reportOutput(generated);
    const { data: report, error: saveError } = await client.rpc('save_monthly_report', {
      p_student_id: action.student_id, p_period_start: action.period_start, p_period_end: action.period_end,
      p_content: content, p_expected_snapshot_hash: sourceHash,
    });
    if (saveError) throw databaseError(saveError);
    if (!report || !record(report)) throw new ApiError(500, 'report_not_saved', '报告未保存成功，请刷新后确认。');
    return new Response(JSON.stringify({ report }), { headers });
  } catch (error) {
    // Never log request bodies, student records, authorization headers, model errors,
    // or credentials. Client errors are bounded and do not include provider details.
    const safe = error instanceof ApiError ? error : new ApiError(500, 'internal_error', '服务处理失败，请稍后重试。');
    return new Response(JSON.stringify({ error: { code: safe.code, message: safe.message } }), { status: safe.status, headers });
  }
}

if (import.meta.main) Deno.serve(handler);
