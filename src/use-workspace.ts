import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db, loadData } from './api';
import { EMPTY_DATA } from './types';
import { errorMessage } from './lib';

export function useWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!db);
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState(EMPTY_DATA);
  const [error, setError] = useState('');
  const [sync, setSync] = useState<'loading' | 'online' | 'offline'>('loading');
  const revision = useRef(0);
  useEffect(() => {
    if (!db) return;
    let mounted = true;
    db.auth.getSession().then(({ data, error }) => { if (mounted) { setSession(data.session); setAuthReady(true); if (error) setError(errorMessage(error)); } });
    const { data: listener } = db.auth.onAuthStateChange((_event, next) => { if (mounted) { setSession(next); setAuthReady(true); } });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const current = ++revision.current;
    setAuthorized(false); setData(EMPTY_DATA); setError('');
    if (!session || !db) return;
    setSync('loading');
    (async () => {
      const verified = await db!.auth.getUser();
      if (verified.error) throw verified.error;
      const owner = await db!.from('app_owner').select('owner_id').eq('owner_id', verified.data.user!.id).maybeSingle();
      if (owner.error) throw owner.error;
      if (!owner.data) throw new Error('此账户没有工作台访问权限');
      const next = await loadData();
      if (revision.current === current) { setData(next); setAuthorized(true); setSync('online'); }
    })().catch(e => { if (revision.current === current) { setError(errorMessage(e)); setSync('offline'); } });
    return () => { revision.current++; };
  }, [session?.user.id]);
  const refresh = useCallback(async () => {
    const current = revision.current;
    if (!authorized) return;
    setSync('loading');
    try { const next = await loadData(); if (revision.current === current) { setData(next); setError(''); setSync('online'); } }
    catch (e) { if (revision.current === current) { setError(errorMessage(e)); setSync('offline'); } throw e; }
  }, [authorized]);
  useEffect(() => {
    if (!db || !authorized || !session) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = db.channel(`workspace-${session.user.id}`);
    for (const table of ['students', 'knowledge_points', 'student_knowledge', 'lessons', 'monthly_reports']) {
      // Postgres DELETE events cannot be row-filtered. Notifications only trigger
      // a fresh read, which still verifies every row through owner RLS policies.
      const filter = table === 'lessons' ? {} : { filter: `owner_id=eq.${session.user.id}` };
      channel.on('postgres_changes', { event: '*', schema: 'public', table, ...filter }, () => { clearTimeout(timer); timer = setTimeout(() => { void refresh().catch(() => {}); }, 180); });
    }
    channel.subscribe(status => { if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { setSync('offline'); setError('实时同步暂时中断，请刷新以获取最新记录。'); } else if (status === 'SUBSCRIBED') { void refresh().catch(() => {}); } });
    const onOnline = () => { void refresh().catch(() => {}); };
    const onOffline = () => { setSync('offline'); setError('网络已断开，重新连接后可继续保存。'); };
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { clearTimeout(timer); void db!.removeChannel(channel); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [authorized, session?.user.id, refresh]);
  const signOut = async () => {
    revision.current++; setAuthorized(false); setData(EMPTY_DATA);
    if (db) { const { error } = await db.auth.signOut(); if (error) await db.auth.signOut({ scope: 'local' }); }
    setSession(null); setError('');
  };
  return { session, authReady, authorized, data, error, sync, refresh, signOut };
}
