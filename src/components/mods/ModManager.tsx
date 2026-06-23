import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, CodeOutlined, BookOutlined } from '@ant-design/icons';
import { ModLoader } from '../../mods/ModLoader';
import { ModInstance, isApiCompatible, CURRENT_API_VERSION } from '../../mods/types';
import s from '../../styles/components/mods/mod-manager.module.css';

interface ModManagerProps {
  modLoader: ModLoader;
  onOpenDocs?: (tab?: string) => void;
}

export const ModManager: React.FC<ModManagerProps> = ({ modLoader, onOpenDocs }) => {
  const { t } = useTranslation();
  const [mods, setMods] = useState<ModInstance[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 组件挂载时同步当前已加载的模组列表（启动时已由全局单例加载）
  useEffect(() => {
    setMods([...modLoader.getMods()]);
  }, [modLoader]);

  const refreshMods = useCallback(() => {
    setMods([...modLoader.getMods()]);
  }, [modLoader]);

  const handleInstall = useCallback(async (file: File) => {
    if (installing) return;
    setInstalling(true);
    setError(null);
    try {
      if (file.name.endsWith('.zip')) {
        await modLoader.loadModFromZip(file);
      } else {
        await modLoader.loadModFromFile(file);
      }
      refreshMods();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInstalling(false);
    }
  }, [modLoader, refreshMods, installing]);

  const handleToggle = useCallback(async (id: string) => {
    const mod = modLoader.getMod(id);
    if (!mod) return;

    try {
      if (mod.enabled) {
        await modLoader.disableMod(id);
      } else {
        await modLoader.enableMod(id);
      }
      refreshMods();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [modLoader, refreshMods]);

  const handleUninstall = useCallback(async (id: string) => {
    try {
      await modLoader.unloadMod(id);
      refreshMods();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [modLoader, refreshMods]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.name.endsWith('.js') || file.name.endsWith('.zip')) {
        handleInstall(file);
      }
    }
  }, [handleInstall]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      await handleInstall(file);
    }
    e.target.value = '';
  }, [handleInstall]);

  return (
    <div className={s.modManager}>
      <div className={s.header}>
        <h2 className={s.title}>{t('mods.title')}</h2>
        {onOpenDocs && (
          <button className={s.docsLink} onClick={() => onOpenDocs('mod-api')}>
            <BookOutlined />
            <span>{t('mods.viewDocs')}</span>
          </button>
        )}
      </div>

      {/* Install area */}
      <div
        className={`${s.dropZone} ${dragOver ? s.dragOver : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <UploadOutlined className={s.dropIcon} />
        <p>{t('mods.dropToInstall')}</p>
        <span>{t('mods.or')}</span>
        <button
          className={s.browseBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={installing}
          style={{ opacity: installing ? 0.5 : 1, cursor: installing ? 'not-allowed' : 'pointer' }}
        >
          {installing ? '...' : t('mods.browse')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".js,.zip"
          multiple
          className={s.fileInput}
          onChange={handleFileSelect}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className={s.error}>
          <CloseCircleOutlined /> {error}
        </div>
      )}

      {/* Mod list */}
      <div className={s.modList}>
        {mods.length === 0 ? (
          <div className={s.empty}>{t('mods.noMods')}</div>
        ) : (
          mods.map((mod) => (
            <div key={mod.manifest.id} className={`${s.modItem} ${mod.enabled ? s.enabled : s.disabled}`}>
              <div className={s.modInfo}>
                <div className={s.modHeader}>
                  <h3 className={s.modName}>{mod.manifest.name}</h3>
                  <span className={s.modVersion}>v{mod.manifest.version}</span>
                  {(() => {
                    const compat = isApiCompatible(mod.manifest.apiVersion);
                    if (!compat.compatible) {
                      return <span className={s.apiBadge} style={{ background: '#ef4444', color: '#fff' }} title={compat.reason}>API 不兼容</span>;
                    }
                    if (mod.manifest.apiVersion) {
                      return <span className={s.apiBadge} style={{ background: '#6366f1', color: '#fff' }} title={`API v${mod.manifest.apiVersion}`}>API {mod.manifest.apiVersion}</span>;
                    }
                    return <span className={s.apiBadge} style={{ background: '#71717a', color: '#fff' }} title="Legacy mod (no apiVersion declared)">Legacy</span>;
                  })()}
                </div>
                <p className={s.modDescription}>{mod.manifest.description}</p>
                <div className={s.modMeta}>
                  <span>{t('mods.author')}: {mod.manifest.author}</span>
                  <span className={s.modId}>ID: {mod.manifest.id}</span>
                </div>
                <div className={s.modPermissions}>
                  {mod.manifest.permissions.map((perm) => (
                    <span key={perm} className={s.permissionTag}>{perm}</span>
                  ))}
                </div>
              </div>

              <div className={s.modActions}>
                <button
                  className={`${s.actionBtn} ${mod.enabled ? s.disableBtn : s.enableBtn}`}
                  onClick={() => handleToggle(mod.manifest.id)}
                  title={mod.enabled ? t('mods.disable') : t('mods.enable')}
                >
                  {mod.enabled ? <CloseCircleOutlined /> : <CheckCircleOutlined />}
                  <span>{mod.enabled ? t('mods.disable') : t('mods.enable')}</span>
                </button>

                <button
                  className={`${s.actionBtn} ${s.uninstallBtn}`}
                  onClick={() => handleUninstall(mod.manifest.id)}
                  title={t('mods.uninstall')}
                >
                  <DeleteOutlined />
                  <span>{t('mods.uninstall')}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Developer mode hint */}
      <div className={s.devHint}>
        <CodeOutlined />
        <span>{t('mods.devHint')}</span>
      </div>
    </div>
  );
};
