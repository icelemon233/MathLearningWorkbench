import { useRef, useState } from 'react';
import { Button, Empty, Input, Modal, Popconfirm, Select, Table, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { normalizeKnowledgeTitle } from './lib';
import type { KnowledgePoint } from './types';

export type KnowledgeOptionActions = {
  createPoint: (title: string) => Promise<KnowledgePoint | null>;
  deletePoint: (point: KnowledgePoint) => Promise<KnowledgePoint | null>;
};
type Props = KnowledgeOptionActions & {
  value?: string;
  onChange?: (id: string | undefined) => void;
  points: KnowledgePoint[];
  grade: string;
  disabled?: boolean;
  id?: string;
};
const CREATE = '__save_knowledge_option__';

export function KnowledgePicker({ value, onChange, points, grade, disabled, id, createPoint, deletePoint }: Props) {
  const [search, setSearch] = useState('');
  const [localPoints, setLocalPoints] = useState<KnowledgePoint[]>([]);
  const [pending, setPending] = useState(false);
  const operation = useRef(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSearch, setManageSearch] = useState('');
  // Keep confirmed server results visible if the following workspace refresh
  // fails. A newer cloud version always wins over this temporary local view.
  const merged = new Map(points.map(point => [point.id, point]));
  for (const point of localPoints) {
    const remote = merged.get(point.id);
    if (!remote || Date.parse(point.updated_at) > Date.parse(remote.updated_at)) merged.set(point.id, point);
  }
  const active = [...merged.values()].filter(point => !point.archived);
  const name = normalizeKnowledgeTitle(search);
  const sameGrade = grade.trim() || '通用';
  const exact = active.find(point => point.grade === sameGrade && normalizeKnowledgeTitle(point.title) === name);
  const deleted = [...merged.values()].find(point => point.archived && point.grade === sameGrade && normalizeKnowledgeTitle(point.title) === name);
  const remember = (point: KnowledgePoint) => setLocalPoints(previous => [...previous.filter(item => item.id !== point.id), point]);
  const choose = (id: string) => { onChange?.(id); setSearch(''); };
  const create = async () => {
    if (!name || disabled || operation.current) return;
    if (exact) { choose(exact.id); return; }
    operation.current = true; setPending(true);
    try {
      const point = await createPoint(name);
      if (point) { remember(point); choose(point.id); }
      else setSearch(name);
    } finally { operation.current = false; setPending(false); }
  };
  const remove = async (point: KnowledgePoint) => {
    if (disabled || operation.current) return;
    operation.current = true; setPending(true);
    try {
      const removed = await deletePoint(point);
      if (removed) {
        remember(removed);
        if (value === point.id) { onChange?.(undefined); setSearch(''); }
      }
    } finally { operation.current = false; setPending(false); }
  };
  const options = active.map(point => ({ value: point.id, label: `${point.title} · ${point.grade} · ${point.chapter}`, searchText: `${point.title} ${point.grade} ${point.chapter}`.toLowerCase() }));
  const canCreate = !!name && !exact;
  const managerRows = active.filter(point => `${point.title} ${point.grade} ${point.chapter}`.toLowerCase().includes(manageSearch.trim().toLowerCase()));

  return <div className="knowledge-picker">
    <Select id={id} aria-label="知识点" value={value} onChange={id => { if (id === CREATE) void create(); else choose(id); }}
      showSearch searchValue={search} onSearch={next => { if (!operation.current) setSearch(next); }} disabled={disabled || pending} loading={pending}
      placeholder="输入新知识点，或搜索已保存的选项" style={{ width: '100%' }}
      filterOption={(input, option) => option?.value === CREATE || String(option?.searchText ?? '').includes(input.trim().toLowerCase())}
      options={[...options, ...(canCreate ? [{ value: CREATE, label: <span><PlusOutlined /> {deleted ? '恢复并选择' : '保存并选择'}“{name}”</span>, searchText: name }] : [])]}
      labelRender={selected => merged.get(String(selected.value))?.title ?? selected.label}
      notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="输入名称后按回车，即可保存并选择" />}
      onInputKeyDown={event => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault(); event.stopPropagation();
        if (name) void create();
      }} />
    <div className="knowledge-picker-tools">
      <Typography.Text type="secondary">输入名称后按回车，保存为以后可选的知识点。</Typography.Text>
      <Button type="link" size="small" disabled={disabled || pending} onClick={() => setManageOpen(true)}>管理选项</Button>
    </div>
    <Modal title="管理知识点选项" open={manageOpen} onCancel={() => setManageOpen(false)}
      closable={!pending} keyboard={!pending} mask={{ closable: !pending }} width={560}
      footer={<Button disabled={pending} onClick={() => setManageOpen(false)}>完成</Button>}>
      <Input.Search aria-label="搜索已保存的知识点选项" placeholder="搜索知识点、年级或章节" value={manageSearch} onChange={event => setManageSearch(event.target.value)} allowClear style={{ marginBottom: 16 }} />
      <Table<KnowledgePoint> rowKey="id" dataSource={managerRows} size="small" pagination={{ pageSize: 6, showSizeChanger: false, hideOnSinglePage: true }}
        locale={{ emptyText: '暂无匹配的知识点选项' }} columns={[
          { title: '知识点', render: (_, point) => <div className="knowledge-option-name"><div>{point.title}</div><Typography.Text type="secondary">{point.grade} · {point.chapter}</Typography.Text></div> },
          { title: '操作', width: 84, render: (_, point) => <Popconfirm title="删除这个知识点选项？" description="将从可选列表中移除，已有课堂和月报保留。" okText="删除" cancelText="取消" disabled={disabled || pending} onConfirm={() => remove(point)}>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={disabled || pending} aria-label={`删除知识点选项${point.title}`}>删除</Button>
          </Popconfirm> },
        ]} />
    </Modal>
  </div>;
}
