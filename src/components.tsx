import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpRight, LoaderCircle, X } from 'lucide-react';
import { STATUS_OPTIONS } from './types';
import type { MasteryStatus } from './types';

export function StatusBadge({ status }: { status: MasteryStatus }) { return <span className={`status status-${status}`}><i />{STATUS_OPTIONS.find(x => x.value === status)?.label}</span>; }
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <div className="empty"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) { return <label className={`field ${wide ? 'field-wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Button({ children, busy, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) { return <button {...props} disabled={props.disabled || busy}>{busy && <LoaderCircle size={16} className="spin" />}{children}</button>; }
export function Dialog({ title, subtitle, children, close, wide }: { title: string; subtitle?: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const first = element.current?.querySelector<HTMLElement>('input,select,textarea,button');
    first?.focus();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const items = Array.from(element.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),[tabindex="0"]') ?? []);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', key); old?.focus(); };
  }, [close]);
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={element}><header className="dialog-header"><div><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="icon-button" aria-label="关闭" onClick={close}><X size={20} /></button></header>{children}</div></div>;
}
export function SectionTitle({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) { return <div className="section-title"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>; }
export function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-button" onClick={onClick}>{children}<ArrowUpRight size={15} /></button>; }
