import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input, Button, Switch, Select, Tag, Empty } from 'antd';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { handleIpcError } from '../../utils/ipcError';
import {
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ExportOutlined,
  ImportOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { ipcClient } from '../../services/ipcClient';
import type { ClassificationRule, Category } from '@shared/types/sample.types';

const RuleTypeColors: Record<string, string> = {
  keyword: '#6366F1',
  regex: '#F59E0B',
  folder: '#34D399',
};

const ClassificationRuleEditor: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<{ rule: ClassificationRule; matched: boolean }[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPattern, setEditPattern] = useState('');
  const [editRuleType, setEditRuleType] = useState<string>('keyword');
  const [editTargetCategoryId, setEditTargetCategoryId] = useState<number | null>(null);
  const [editPriority, setEditPriority] = useState(100);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['classification-rules'],
    queryFn: () => ipcClient.getRules(),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => ipcClient.getCategories(),
  });

  const categoryMap = useMemo(() =>
    new Map((categories || []).map((c: Category) => [c.id, c.name])),
    [categories]
  );

  const categoryOptions = useMemo(() =>
    (categories || []).map((c: Category) => ({ value: c.id, label: c.name })),
    [categories]
  );

  const ruleTypeOptions = useMemo(() => [
    { value: 'keyword', label: t('rules.keyword') },
    { value: 'regex', label: t('rules.regex') },
    { value: 'folder', label: t('rules.folder') },
  ], [t]);

  const processedRules = useMemo(() => {
    return (rules || []).map(rule => ({
      ...rule,
      typeColor: RuleTypeColors[rule.ruleType] || '#6B7280',
      typeLabel: t(`rules.${rule.ruleType}`),
    }));
  }, [rules, t]);

  const handleCreate = useCallback(async () => {
    try {
      await ipcClient.createRule({
        name: t('rules.newRule'),
        pattern: '',
        ruleType: 'keyword',
        targetCategoryId: 19, // Uncategorized
        priority: 100,
      });
      queryClient.invalidateQueries({ queryKey: ['classification-rules'] });
      toast.success(t('rules.ruleCreated'));
    } catch (err) {
      handleIpcError(err, t('rules.createFailed'));
    }
  }, [queryClient, t]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await ipcClient.deleteRule(id);
      queryClient.invalidateQueries({ queryKey: ['classification-rules'] });
      toast.success(t('rules.ruleDeleted'));
    } catch (err) {
      handleIpcError(err, t('rules.deleteFailed'));
    }
  }, [queryClient, t]);

  const handleToggleActive = useCallback(async (id: number, isActive: boolean) => {
    try {
      await ipcClient.updateRule(id, { isActive: !isActive });
      queryClient.invalidateQueries({ queryKey: ['classification-rules'] });
    } catch (err) {
      handleIpcError(err, t('rules.updateFailed'));
    }
  }, [queryClient, t]);

  const handleStartEdit = useCallback((rule: ClassificationRule) => {
    setEditingId(rule.id);
    setEditName(rule.name);
    setEditPattern(rule.pattern);
    setEditRuleType(rule.ruleType);
    setEditTargetCategoryId(rule.targetCategoryId);
    setEditPriority(rule.priority);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editTargetCategoryId) return;
    try {
      await ipcClient.updateRule(editingId, {
        name: editName,
        pattern: editPattern,
        ruleType: editRuleType,
        targetCategoryId: editTargetCategoryId,
        priority: editPriority,
      });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['classification-rules'] });
      toast.success(t('rules.ruleUpdated'));
    } catch (err) {
      handleIpcError(err, t('rules.updateFailed'));
    }
  }, [editingId, editName, editPattern, editRuleType, editTargetCategoryId, editPriority, queryClient, t]);

  const handleTest = useCallback(() => {
    if (!testInput.trim() || !rules) return;
    const results = rules
      .filter(r => r.isActive)
      .sort((a, b) => b.priority - a.priority)
      .map(rule => {
        let matched = false;
        const lowerName = testInput.toLowerCase();
        switch (rule.ruleType) {
          case 'keyword': {
            const keywords = rule.pattern.split('|').map(k => k.trim());
            matched = keywords.some(kw => lowerName.includes(kw));
            break;
          }
          case 'regex': {
            try {
              matched = new RegExp(rule.pattern, 'i').test(testInput);
            } catch { matched = false; }
            break;
          }
          case 'folder': {
            const folders = rule.pattern.split('|').map(f => f.trim().toLowerCase());
            matched = folders.some(fp => lowerName.includes(fp));
            break;
          }
        }
        return { rule, matched };
      });
    setTestResult(results);
  }, [testInput, rules]);

  const handleClassifyAll = useCallback(async () => {
    try {
      const count = await ipcClient.classifyAll();
      toast.success(t('rules.classified', { count }));
      queryClient.invalidateQueries({ queryKey: ['samples'] });
    } catch (err) {
      handleIpcError(err, t('rules.classifyFailed'));
    }
  }, [queryClient, t]);

  const handleExport = useCallback(() => {
    if (!rules) return;
    const json = JSON.stringify(rules, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classification-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [rules]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as ClassificationRule[];
        for (const rule of imported) {
          await ipcClient.createRule({
            name: rule.name,
            pattern: rule.pattern,
            ruleType: rule.ruleType,
            targetCategoryId: rule.targetCategoryId,
            priority: rule.priority,
          });
        }
        queryClient.invalidateQueries({ queryKey: ['classification-rules'] });
        toast.success(t('rules.imported', { count: imported.length }));
      } catch (err) {
        handleIpcError(err, t('rules.importFailed'));
      }
    };
    input.click();
  }, [queryClient, t]);

  if (isLoading) {
    return (
      <div style={{ padding: 20, maxWidth: 800 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ width: 140, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 80, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
            <div style={{ width: 80, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
            <div style={{ width: 80, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
            <div style={{ width: 80, height: 24, background: 'var(--bg-active)', borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ height: 44, background: 'var(--bg-active)', borderRadius: 8, marginBottom: 16 }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            height: 44,
            background: 'var(--bg-active)',
            borderRadius: 8,
            marginBottom: 8,
            animation: `pulse 1.5s ease-in-out ${i * 0.1}s infinite`,
          }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          {t('rules.title')}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" icon={<ImportOutlined />} onClick={handleImport}>{t('rules.import')}</Button>
          <Button size="small" icon={<ExportOutlined />} onClick={handleExport}>{t('rules.export')}</Button>
          <Button size="small" icon={<PlayCircleOutlined />} onClick={handleClassifyAll}>{t('rules.reclassify')}</Button>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>{t('rules.createRule')}</Button>
        </div>
      </div>

      {/* Test area */}
      <div style={{
        background: 'var(--bg-base)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}>
        <Input
          placeholder={t('rules.testPlaceholder')}
          value={testInput}
          onChange={e => setTestInput(e.target.value)}
          onPressEnter={handleTest}
          size="small"
          style={{ flex: 1 }}
        />
        <Button size="small" type="primary" onClick={handleTest}>{t('rules.test')}</Button>
      </div>

      {/* Test results */}
      {testResult && (
        <div style={{
          background: 'var(--bg-base)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          maxHeight: 150,
          overflowY: 'auto',
        }}>
          {testResult.map(({ rule, matched }, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 0', fontSize: 12,
              color: matched ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}>
              {matched ? <CheckCircleOutlined style={{ color: '#34D399' }} /> : <CloseCircleOutlined style={{ color: 'var(--text-tertiary)' }} />}
              <span>{rule.name}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              <span>{categoryMap.get(rule.targetCategoryId) || `ID:${rule.targetCategoryId}`}</span>
            </div>
          ))}
        </div>
      )}

      {/* Rules list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {processedRules.length === 0 && <Empty description={t('rules.noRules')} />}
        {processedRules.map(rule => {
          const isEditing = editingId === rule.id;

          return (
            <div key={rule.id} style={{
              background: 'var(--bg-base)',
              borderRadius: 8,
              padding: 12,
              border: isEditing ? '1px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
              opacity: rule.isActive ? 1 : 0.5,
            }}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input size="small" value={editName} onChange={e => setEditName(e.target.value)} placeholder={t('rules.ruleName')} style={{ flex: 1 }} />
                    <Select size="small" value={editRuleType} onChange={setEditRuleType} style={{ width: 100 }}
                      options={ruleTypeOptions}
                    />
                    <Input size="small" type="number" value={editPriority} onChange={e => setEditPriority(Number(e.target.value))} style={{ width: 70 }} placeholder={t('rules.priority')} />
                  </div>
                  <Input size="small" value={editPattern} onChange={e => setEditPattern(e.target.value)} placeholder={t('rules.matchPattern')} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Select size="small" value={editTargetCategoryId} onChange={setEditTargetCategoryId} style={{ flex: 1 }}
                      options={categoryOptions}
                      placeholder={t('rules.targetCategory')}
                    />
                    <Button size="small" type="primary" onClick={handleSaveEdit}>{t('rules.save')}</Button>
                    <Button size="small" onClick={() => setEditingId(null)}>{t('rules.cancel')}</Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Switch size="small" checked={rule.isActive} onChange={() => handleToggleActive(rule.id, rule.isActive)} />
                  <Tag color={rule.typeColor} style={{ margin: 0, fontSize: 10 }}>{rule.typeLabel}</Tag>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>
                    {rule.name}
                  </span>
                  <code style={{
                    fontSize: 11, color: 'var(--text-secondary)',
                    background: 'var(--bg-active)', padding: '2px 6px',
                    borderRadius: 4, maxWidth: 200, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {rule.pattern}
                  </code>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    → {categoryMap.get(rule.targetCategoryId) || `ID:${rule.targetCategoryId}`}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', width: 30, textAlign: 'right' }}>
                    P{rule.priority}
                  </span>
                  <Button size="small" type="text" onClick={() => handleStartEdit(rule)} style={{ fontSize: 11 }}>{t('rules.edit')}</Button>
                  <Button size="small" type="text" danger onClick={() => handleDelete(rule.id)} icon={<DeleteOutlined />} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(ClassificationRuleEditor);
