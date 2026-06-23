import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Input, Button, Tag, Popconfirm, Select, Tooltip } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  VideoCameraOutlined,
  SoundOutlined,
  CustomerServiceOutlined,
  ThunderboltOutlined,
  AudioOutlined,
  BranchesOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { toast } from 'sonner';

/* ──────────────────────────── Types ──────────────────────────── */

interface Scene {
  id: string;
  name: string;
  color: string;
}

interface Character {
  id: string;
  name: string;
  color: string;
}

type AudioCategory = 'Dialogue' | 'BG' | 'SFX' | 'Foley' | 'MX Stem';

interface AudioCategoryConfig {
  key: AudioCategory;
  label: string;
  labelKey: string;
  fallback: string;
  color: string;
  icon: React.ReactNode;
  description: string;
  descriptionKey: string;
  descriptionFallback: string;
}

interface ProjectInfo {
  projectName: string;
  frameRate: string;
  loudnessStandard: string;
  customLoudness: string;
}

/* ──────────────────────────── Constants ──────────────────────────── */

const DEFAULT_SCENE_COLORS = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#06B6D4'];
const DEFAULT_CHAR_COLORS = ['#F97316', '#14B8A6', '#A855F7', '#E11D48', '#0EA5E9', '#84CC16'];

const AUDIO_CATEGORIES: AudioCategoryConfig[] = [
  {
    key: 'Dialogue',
    label: 'Dialogue',
    labelKey: 'post.audioCategory.dialogue',
    fallback: '对话',
    color: '#6366F1',
    icon: <CustomerServiceOutlined />,
    description: 'Dialogue / ADR / Voice-over',
    descriptionKey: 'post.audioCategoryDesc.dialogue',
    descriptionFallback: '对白、自动对白替换、旁白',
  },
  {
    key: 'BG',
    label: 'BG',
    labelKey: 'post.audioCategory.bg',
    fallback: '背景',
    color: '#10B981',
    icon: <SoundOutlined />,
    description: 'Background Music / Ambience',
    descriptionKey: 'post.audioCategoryDesc.bg',
    descriptionFallback: '背景音乐、环境声',
  },
  {
    key: 'SFX',
    label: 'SFX',
    labelKey: 'post.audioCategory.sfx',
    fallback: '音效',
    color: '#F59E0B',
    icon: <ThunderboltOutlined />,
    description: 'Sound Effects / Design',
    descriptionKey: 'post.audioCategoryDesc.sfx',
    descriptionFallback: '音效、声音设计',
  },
  {
    key: 'Foley',
    label: 'Foley',
    labelKey: 'post.audioCategory.foley',
    fallback: '拟音',
    color: '#EC4899',
    icon: <AudioOutlined />,
    description: 'Foley / Footsteps / Props',
    descriptionKey: 'post.audioCategoryDesc.foley',
    descriptionFallback: '拟音、脚步声、道具声',
  },
  {
    key: 'MX Stem',
    label: 'MX Stem',
    labelKey: 'post.audioCategory.mxStem',
    fallback: '混音分轨',
    color: '#8B5CF6',
    icon: <BranchesOutlined />,
    description: 'Mix Stems / Stems for delivery',
    descriptionKey: 'post.audioCategoryDesc.mxStem',
    descriptionFallback: '混音分轨、交付用分轨',
  },
];

const FRAME_RATE_OPTIONS = [
  { value: '23.976', label: '23.976 fps (NTSC Film)' },
  { value: '24', label: '24 fps (Film)' },
  { value: '25', label: '25 fps (PAL)' },
  { value: '29.97', label: '29.97 fps (NTSC Video)' },
  { value: '30', label: '30 fps' },
];

const LOUDNESS_OPTIONS = [
  { value: '-24', label: '-24 LUFS (Netflix / Cinema)' },
  { value: '-27', label: '-27 LUFS (Broadcast / EBU R128)' },
  { value: '-14', label: '-14 LUFS (Streaming / Podcast)' },
  { value: 'custom', label: '自定义' },
];

const STORAGE_KEY_PROJECT_INFO = 'post-project-info';

/* ──────────────────────────── Helpers ──────────────────────────── */

function loadProjectInfo(): ProjectInfo {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PROJECT_INFO);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return {
    projectName: '',
    frameRate: '24',
    loudnessStandard: '-24',
    customLoudness: '-24',
  };
}

function saveProjectInfo(info: ProjectInfo) {
  localStorage.setItem(STORAGE_KEY_PROJECT_INFO, JSON.stringify(info));
}

/* ──────────────────────────── Component ──────────────────────────── */

const PostSceneEditor: React.FC = () => {
  const { t } = useTranslation();

  /* ── Scenes ── */
  const [scenes, setScenes] = useState<Scene[]>(() => {
    try {
      const saved = localStorage.getItem('post-scenes');
      return saved ? JSON.parse(saved) : [
        { id: 'scene-1', name: '开场', color: '#6366F1' },
        { id: 'scene-2', name: '追逐', color: '#EF4444' },
        { id: 'scene-3', name: '对白', color: '#10B981' },
      ];
    } catch { return []; }
  });

  /* ── Characters ── */
  const [characters, setCharacters] = useState<Character[]>(() => {
    try {
      const saved = localStorage.getItem('post-characters');
      return saved ? JSON.parse(saved) : [
        { id: 'char-1', name: '主角', color: '#F97316' },
        { id: 'char-2', name: '反派', color: '#A855F7' },
      ];
    } catch { return []; }
  });

  /* ── Audio Category Filter ── */
  const [activeCategories, setActiveCategories] = useState<AudioCategory[]>([]);

  /* ── Project Info ── */
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(loadProjectInfo);

  /* ── UI State ── */
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [showCharModal, setShowCharModal] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [sceneForm, setSceneForm] = useState({ name: '', color: '#6366F1' });
  const [charForm, setCharForm] = useState({ name: '', color: '#F97316' });

  /* ── Persist project info on change ── */
  useEffect(() => {
    saveProjectInfo(projectInfo);
  }, [projectInfo]);

  /* ── Save helpers ── */
  const saveScenes = useCallback((newScenes: Scene[]) => {
    setScenes(newScenes);
    localStorage.setItem('post-scenes', JSON.stringify(newScenes));
  }, []);

  const saveCharacters = useCallback((newChars: Character[]) => {
    setCharacters(newChars);
    localStorage.setItem('post-characters', JSON.stringify(newChars));
  }, []);

  /* ── Scene CRUD ── */
  const handleAddScene = useCallback(() => {
    if (!sceneForm.name.trim()) return;
    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      name: sceneForm.name.trim(),
      color: sceneForm.color,
    };
    saveScenes([...scenes, newScene]);
    setSceneForm({ name: '', color: DEFAULT_SCENE_COLORS[scenes.length % DEFAULT_SCENE_COLORS.length] });
    setShowSceneModal(false);
    toast.success(t('post.sceneAdded', '场次已添加'));
  }, [sceneForm, scenes, saveScenes, t]);

  const handleDeleteScene = useCallback((id: string) => {
    saveScenes(scenes.filter(s => s.id !== id));
    if (selectedScene === id) setSelectedScene(null);
  }, [scenes, selectedScene, saveScenes]);

  /* ── Character CRUD ── */
  const handleAddChar = useCallback(() => {
    if (!charForm.name.trim()) return;
    const newChar: Character = {
      id: `char-${Date.now()}`,
      name: charForm.name.trim(),
      color: charForm.color,
    };
    saveCharacters([...characters, newChar]);
    setCharForm({ name: '', color: DEFAULT_CHAR_COLORS[characters.length % DEFAULT_CHAR_COLORS.length] });
    setShowCharModal(false);
    toast.success(t('post.characterAdded', '角色已添加'));
  }, [charForm, characters, saveCharacters, t]);

  const handleDeleteChar = useCallback((id: string) => {
    saveCharacters(characters.filter(c => c.id !== id));
    if (selectedChar === id) setSelectedChar(null);
  }, [characters, selectedChar, saveCharacters]);

  /* ── Audio Category toggle ── */
  const toggleCategory = useCallback((key: AudioCategory) => {
    setActiveCategories(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  const clearCategoryFilter = useCallback(() => {
    setActiveCategories([]);
  }, []);

  /* ── Project Info handlers ── */
  const updateProjectInfo = useCallback(<K extends keyof ProjectInfo>(key: K, value: ProjectInfo[K]) => {
    setProjectInfo(prev => ({ ...prev, [key]: value }));
  }, []);

  /* ── Derived: resolved loudness value ── */
  const resolvedLoudness = projectInfo.loudnessStandard === 'custom'
    ? projectInfo.customLoudness
    : projectInfo.loudnessStandard;

  /* ──────────────────────── Render ──────────────────────── */

  return (
    <div style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>
      {/* ═══════════════════ Scenes ═══════════════════ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <VideoCameraOutlined style={{ fontSize: 12, color: 'var(--brand-primary)' }} />
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
              {t('post.scenes', '场次')}
            </span>
          </div>
          <button
            onClick={() => {
              setEditingScene(null);
              setSceneForm({ name: '', color: DEFAULT_SCENE_COLORS[scenes.length % DEFAULT_SCENE_COLORS.length] });
              setShowSceneModal(true);
            }}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
            title={t('post.addScene', '添加场次')}
          >
            <PlusOutlined />
          </button>
        </div>
        {scenes.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-disabled)', padding: '4px 0' }}>
            {t('post.noScenes', '暂无场次')}
          </div>
        ) : (
          scenes.map(scene => (
            <div
              key={scene.id}
              onClick={() => setSelectedScene(scene.id === selectedScene ? null : scene.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                background: selectedScene === scene.id ? 'var(--bg-active, rgba(99,102,241,0.12))' : 'transparent',
                color: selectedScene === scene.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: selectedScene === scene.id ? 600 : 400,
                transition: 'background 0.15s',
                marginBottom: 1,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: scene.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{scene.name}</span>
              <Popconfirm title={t('post.deleteConfirm', '确定删除？')} onConfirm={(e) => { e?.stopPropagation(); handleDeleteScene(scene.id); }} onCancel={(e) => e?.stopPropagation()}>
                <button
                  onClick={e => e.stopPropagation()}
                  style={{ background: 'none', border: 'none', color: 'var(--text-disabled)', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, visibility: selectedScene === scene.id ? 'visible' : 'hidden' }}
                >
                  <DeleteOutlined />
                </button>
              </Popconfirm>
            </div>
          ))
        )}
      </div>

      {/* ═══════════════════ Characters ═══════════════════ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
            {t('post.characters', '角色')}
          </span>
          <button
            onClick={() => {
              setEditingChar(null);
              setCharForm({ name: '', color: DEFAULT_CHAR_COLORS[characters.length % DEFAULT_CHAR_COLORS.length] });
              setShowCharModal(true);
            }}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
            title={t('post.addCharacter', '添加角色')}
          >
            <PlusOutlined />
          </button>
        </div>
        {characters.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-disabled)', padding: '4px 0' }}>
            {t('post.noCharacters', '暂无角色')}
          </div>
        ) : (
          characters.map(char => (
            <div
              key={char.id}
              onClick={() => setSelectedChar(char.id === selectedChar ? null : char.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                color: selectedChar === char.id ? char.color : 'var(--text-tertiary)',
                fontWeight: selectedChar === char.id ? 500 : 400,
                fontSize: 12,
                transition: 'color 0.15s',
                marginBottom: 1,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: char.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{char.name}</span>
              <Popconfirm title={t('post.deleteConfirm', '确定删除？')} onConfirm={(e) => { e?.stopPropagation(); handleDeleteChar(char.id); }} onCancel={(e) => e?.stopPropagation()}>
                <button
                  onClick={e => e.stopPropagation()}
                  style={{ background: 'none', border: 'none', color: 'var(--text-disabled)', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, visibility: selectedChar === char.id ? 'visible' : 'hidden' }}
                >
                  <DeleteOutlined />
                </button>
              </Popconfirm>
            </div>
          ))
        )}
      </div>

      {/* ═══════════════════ Divider ═══════════════════ */}
      <div style={{ height: 1, background: 'var(--border-secondary, rgba(255,255,255,0.06))', margin: '12px 0 16px' }} />

      {/* ═══════════════════ Audio Category Filter ═══════════════════ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SoundOutlined style={{ fontSize: 12, color: 'var(--brand-primary)' }} />
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
              {t('post.audioCategories', '用途分类')}
            </span>
          </div>
          {activeCategories.length > 0 && (
            <button
              onClick={clearCategoryFilter}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
                lineHeight: 1.4,
              }}
              title={t('post.clearFilter', '清除筛选')}
            >
              <DeleteOutlined style={{ fontSize: 10, marginRight: 3 }} />
              {t('post.clearFilter', '清除筛选')}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AUDIO_CATEGORIES.map(cat => {
            const isActive = activeCategories.includes(cat.key);
            return (
              <Tooltip
                key={cat.key}
                title={t(cat.descriptionKey, cat.descriptionFallback)}
                placement="top"
              >
                <div
                  onClick={() => toggleCategory(cat.key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    border: `1px solid ${isActive ? cat.color : 'var(--border-secondary, rgba(255,255,255,0.1))'}`,
                    background: isActive ? `${cat.color}18` : 'transparent',
                    color: isActive ? cat.color : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 12, lineHeight: 1 }}>{cat.icon}</span>
                  <span>{t(cat.labelKey, cat.fallback)}</span>
                  {isActive && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: cat.color,
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}>
                      &#10003;
                    </span>
                  )}
                </div>
              </Tooltip>
            );
          })}
        </div>

        {/* Active filter summary */}
        {activeCategories.length > 0 && (
          <div style={{
            marginTop: 8,
            padding: '6px 10px',
            borderRadius: 6,
            background: 'var(--bg-tertiary, rgba(255,255,255,0.03))',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <InfoCircleOutlined style={{ fontSize: 11 }} />
            <span>
              {t('post.filterActive', '当前筛选')}: {activeCategories.join(' / ')}
              {selectedScene && ` | ${t('post.scenes', '场次')}: ${scenes.find(s => s.id === selectedScene)?.name ?? ''}`}
              {selectedChar && ` | ${t('post.characters', '角色')}: ${characters.find(c => c.id === selectedChar)?.name ?? ''}`}
            </span>
          </div>
        )}
      </div>

      {/* ═══════════════════ Divider ═══════════════════ */}
      <div style={{ height: 1, background: 'var(--border-secondary, rgba(255,255,255,0.06))', margin: '12px 0 16px' }} />

      {/* ═══════════════════ Project Info ═══════════════════ */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <SettingOutlined style={{ fontSize: 12, color: 'var(--brand-primary)' }} />
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
              {t('post.projectInfo', '项目信息')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-disabled)' }}>
            <SaveOutlined style={{ fontSize: 10 }} />
            <span>{t('post.autoSaved', '自动保存')}</span>
          </div>
        </div>

        {/* Project Name */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500 }}>
            {t('post.projectName', '项目名称')}
          </label>
          <Input
            size="small"
            value={projectInfo.projectName}
            onChange={e => updateProjectInfo('projectName', e.target.value)}
            placeholder={t('post.projectNamePlaceholder', '输入项目名称')}
            style={{ fontSize: 12 }}
          />
        </div>

        {/* Frame Rate */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500 }}>
            {t('post.frameRate', '帧率')}
          </label>
          <Select
            size="small"
            value={projectInfo.frameRate}
            onChange={val => updateProjectInfo('frameRate', val)}
            options={FRAME_RATE_OPTIONS}
            style={{ width: '100%', fontSize: 12 }}
            popupMatchSelectWidth={false}
          />
        </div>

        {/* Loudness Standard */}
        <div style={{ marginBottom: 6 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500 }}>
            {t('post.loudnessStandard', '交付响度标准')}
          </label>
          <Select
            size="small"
            value={projectInfo.loudnessStandard}
            onChange={val => updateProjectInfo('loudnessStandard', val)}
            options={LOUDNESS_OPTIONS}
            style={{ width: '100%', fontSize: 12 }}
            popupMatchSelectWidth={false}
          />
        </div>

        {/* Custom Loudness (conditional) */}
        {projectInfo.loudnessStandard === 'custom' && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, fontWeight: 500 }}>
              {t('post.customLoudness', '自定义响度 (LUFS)')}
            </label>
            <Input
              size="small"
              type="number"
              value={projectInfo.customLoudness}
              onChange={e => updateProjectInfo('customLoudness', e.target.value)}
              placeholder="-24"
              style={{ fontSize: 12 }}
              suffix="LUFS"
            />
          </div>
        )}

        {/* Loudness summary badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 6,
          background: 'var(--bg-tertiary, rgba(255,255,255,0.03))',
          border: '1px solid var(--border-secondary, rgba(255,255,255,0.06))',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 6,
            background: 'rgba(99,102,241,0.12)',
            color: '#6366F1',
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
          }}>
            LU
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 1 }}>
              {t('post.targetLoudness', '目标响度')}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 0.5 }}>
              {resolvedLoudness} LUFS
            </div>
          </div>
          {projectInfo.frameRate && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 1 }}>
                {t('post.frameRate', '帧率')}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {projectInfo.frameRate} fps
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════ Add Scene Modal ═══════════════════ */}
      <Modal
        title={editingScene ? t('post.editScene', '编辑场次') : t('post.addScene', '添加场次')}
        open={showSceneModal}
        onOk={handleAddScene}
        onCancel={() => setShowSceneModal(false)}
        okText={t('common.add', '添加')}
        cancelText={t('common.cancel', '取消')}
        width={360}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            value={sceneForm.name}
            onChange={e => setSceneForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('post.sceneNamePlaceholder', '场次名称，如：开场、追逐、高潮')}
            autoFocus
            onPressEnter={handleAddScene}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DEFAULT_SCENE_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setSceneForm(f => ({ ...f, color: c }))}
                style={{
                  width: 24, height: 24, borderRadius: 4, border: sceneForm.color === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                  background: c, cursor: 'pointer', outline: 'none',
                }}
              />
            ))}
          </div>
        </div>
      </Modal>

      {/* ═══════════════════ Add Character Modal ═══════════════════ */}
      <Modal
        title={editingChar ? t('post.editCharacter', '编辑角色') : t('post.addCharacter', '添加角色')}
        open={showCharModal}
        onOk={handleAddChar}
        onCancel={() => setShowCharModal(false)}
        okText={t('common.add', '添加')}
        cancelText={t('common.cancel', '取消')}
        width={360}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            value={charForm.name}
            onChange={e => setCharForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('post.charNamePlaceholder', '角色名称，如：主角、旁白')}
            autoFocus
            onPressEnter={handleAddChar}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DEFAULT_CHAR_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setCharForm(f => ({ ...f, color: c }))}
                style={{
                  width: 24, height: 24, borderRadius: 4, border: charForm.color === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                  background: c, cursor: 'pointer', outline: 'none',
                }}
              />
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PostSceneEditor;
