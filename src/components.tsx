import type { ReactNode } from 'react';
import { Modal, Typography } from 'antd';

export function Dialog({ title, subtitle, children, close, wide, busy = false }: {
  title: string; subtitle?: string; children: ReactNode; close: () => void; wide?: boolean; busy?: boolean;
}) {
  return <Modal open title={<div>{title}{subtitle && <Typography.Paragraph type="secondary" className="modal-subtitle">{subtitle}</Typography.Paragraph>}</div>}
    onCancel={close} footer={null} width={wide ? 960 : 640} centered destroyOnHidden
    keyboard={!busy} closable={!busy} mask={{ closable: !busy }} className="workspace-modal"
    styles={{ body: { maxHeight: 'calc(100dvh - 168px)', overflowY: 'auto', overflowX: 'hidden', paddingTop: 16 } }}>
    {children}
  </Modal>;
}
