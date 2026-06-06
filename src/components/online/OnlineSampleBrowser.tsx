import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input, Spin, Tag, Empty, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  SearchOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
  CloudOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { ipcClient } from '../../services/ipcClient';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePlayerStore } from '../../stores/playerStore';
import s from '../../styles/components/online-sample-browser.module.css';

type SampleSource = 'lotsofsounds' | 'freesound' | 'snddev' | 'pixabay';

interface OnlineSampleItem {
  id: string;
  name: string;
  tags: string[];
  duration: number;
  previewUrl: string;
  downloadUrl?: string;
  source: string;
  license?: string;
  description?: string;
}

const SOURCE_CONFIG: { key: SampleSource; label: string; icon: string; needKey: boolean; keyName?: string }[] = [
  { key: 'lotsofsounds', label: 'Lotsofsounds', icon: '🎵', needKey: false },
  { key: 'pixabay', label: 'Pixabay', icon: '📷', needKey: true, keyName: 'pixabay' },
  { key: 'freesound', label: 'Freesound', icon: '🔊', needKey: true, keyName: 'freesound' },
  { key: 'snddev', label: 'SND.dev', icon: '🔔', needKey: false },
];

const OnlineSampleBrowser: React.FC = () => {
  const { t } = useTranslation();
  const freesoundApiKey = useSettingsStore(s => s.freesoundApiKey);
  const pixabayApiKey = useSettingsStore(s => s.pixabayApiKey);
  const [activeSource, setActiveSource] = useState<SampleSource>('lotsofsounds');
  const [query, setQuery] = useState('');
  const [samples, setSamples] = useState<OnlineSampleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 清理音频
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const doSearch = useCallback(async (searchQuery: string, pageNum: number = 1) => {
    setLoading(true);
    try {
      const result = await ipcClient.onlineSearch({
        source: activeSource,
        query: searchQuery,
        page: pageNum,
        freesoundApiKey: activeSource === 'freesound' ? freesoundApiKey : undefined,
        pixabayApiKey: activeSource === 'pixabay' ? pixabayApiKey : undefined,
        filter: activeSource === 'snddev' ? searchQuery : undefined,
      });

      if (pageNum === 1) {
        setSamples(result.samples);
      } else {
        setSamples(prev => [...prev, ...result.samples]);
      }
      setTotal(result.total);
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch (err: any) {
      toast.error(err.message || '搜索失败');
    } finally {
      setLoading(false);
    }
  }, [activeSource, freesoundApiKey, pixabayApiKey]);

  const handleSearch = useCallback(() => {
    doSearch(query, 1);
  }, [query, doSearch]);

  const handleLoadMore = useCallback(() => {
    doSearch(query, page + 1);
  }, [query, page, doSearch]);

  const handlePreview = useCallback((sample: OnlineSampleItem) => {
    if (playingId === sample.id) {
      // 停止播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingId(null);
      return;
    }

    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(sample.previewUrl);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      toast.error('预览播放失败');
      setPlayingId(null);
    };
    audio.play();
    audioRef.current = audio;
    setPlayingId(sample.id);
  }, [playingId]);

  const handleDownload = useCallback(async (sample: OnlineSampleItem) => {
    if (!sample.downloadUrl) {
      toast.warning('该采样不支持直接下载');
      return;
    }

    setDownloadingIds(prev => new Set(prev).add(sample.id));
    try {
      // 从预览 URL 推断文件名
      const urlFileName = sample.previewUrl.split('/').pop() || 'sample.mp3';
      const ext = urlFileName.includes('.wav') ? '.wav' : urlFileName.includes('.ogg') ? '.ogg' : '.mp3';
      const fileName = `${sample.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_')}${ext}`;

      const headers: Record<string, string> = {};
      if (sample.source === 'freesound' && freesoundApiKey) {
        headers['Authorization'] = `Token ${freesoundApiKey}`;
      }

      await ipcClient.onlineDownload(sample.downloadUrl, fileName, Object.keys(headers).length > 0 ? headers : undefined);
      toast.success(`已下载: ${fileName}`);
    } catch (err: any) {
      toast.error(err.message || '下载失败');
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(sample.id);
        return next;
      });
    }
  }, [freesoundApiKey]);

  const formatDuration = (d: number) => {
    if (!d || d <= 0) return '--';
    if (d < 60) return `${d.toFixed(1)}s`;
    const m = Math.floor(d / 60);
    const s = Math.floor(d % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getSourceBadge = (source: string) => {
    const config = SOURCE_CONFIG.find(s => s.key === source);
    return config?.icon || '🎵';
  };

  return (
    <div className={s.container}>
      {/* Header */}
      <div className={s.header}>
        <CloudOutlined className={s.headerIcon} />
        <span className={s.headerTitle}>{t('onlineSample.title', '在线采样')}</span>
      </div>

      {/* Source Tabs */}
      <div className={s.sourceTabs}>
        {SOURCE_CONFIG.map(src => (
          <button
            key={src.key}
            onClick={() => {
              setActiveSource(src.key);
              setSamples([]);
              setTotal(0);
              setHasMore(false);
            }}
            className={`${s.sourceTab} ${activeSource === src.key ? s.sourceTabActive : ''}`}
          >
            <span>{src.icon}</span>
            <span>{src.label}</span>
            {src.needKey && src.keyName === 'freesound' && !freesoundApiKey && (
              <span className={s.keyBadge}>KEY</span>
            )}
            {src.needKey && src.keyName === 'pixabay' && !pixabayApiKey && (
              <span className={s.keyBadge}>KEY</span>
            )}
          </button>
        ))}
      </div>

      {/* API Key 提示 */}
      {activeSource === 'freesound' && !freesoundApiKey && (
        <div className={s.keyHint}>
          <span>需要 Freesound API Key，请在</span>
          <strong>设置</strong>
          <span>中配置</span>
        </div>
      )}
      {activeSource === 'pixabay' && !pixabayApiKey && (
        <div className={s.keyHint}>
          <span>需要 Pixabay API Key，</span>
          <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener" style={{ color: 'var(--brand-primary)' }}>免费注册获取</a>
          <span>，然后在</span>
          <strong>设置</strong>
          <span>中配置</span>
        </div>
      )}

      {/* Search Bar */}
      {activeSource !== 'snddev' && (
        <div className={s.searchBar}>
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onPressEnter={handleSearch}
            placeholder={t('onlineSample.searchPlaceholder', '搜索在线采样...')}
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
            allowClear
            className={s.searchInput}
          />
          <button onClick={handleSearch} className={s.searchBtn} disabled={loading}>
            {t('onlineSample.search', '搜索')}
          </button>
        </div>
      )}

      {/* SND.dev 分类提示 */}
      {activeSource === 'snddev' && (
        <div className={s.snddevHint}>
          <SoundOutlined style={{ marginRight: 6 }} />
          UI 交互音效库，点击搜索浏览分类音效
        </div>
      )}

      {/* Results */}
      <div className={s.results}>
        {loading && samples.length === 0 ? (
          <div className={s.loading}>
            <Spin />
          </div>
        ) : samples.length === 0 ? (
          <Empty
            description={t('onlineSample.noResults', '暂无结果，试试搜索')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <>
            <div className={s.resultInfo}>
              找到 <strong>{total}</strong> 个采样
            </div>

            <div className={s.sampleList}>
              {samples.map(sample => (
                <div key={sample.id} className={s.sampleItem}>
                  <div className={s.sampleMain}>
                    <button
                      onClick={() => handlePreview(sample)}
                      className={s.playBtn}
                      title={playingId === sample.id ? '停止' : '预览'}
                    >
                      {playingId === sample.id
                        ? <PauseCircleOutlined />
                        : <PlayCircleOutlined />
                      }
                    </button>

                    <div className={s.sampleInfo}>
                      <span className={s.sampleName}>{sample.name}</span>
                      <div className={s.sampleMeta}>
                        <span className={s.sourceBadge}>{getSourceBadge(sample.source)}</span>
                        <span className={s.sampleDuration}>{formatDuration(sample.duration)}</span>
                        {sample.license && (
                          <Tooltip title={sample.license}>
                            <span className={s.licenseTag}>CC</span>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={s.sampleTags}>
                    {sample.tags.slice(0, 4).map(tag => (
                      <Tag key={tag} className={s.tag}>{tag}</Tag>
                    ))}
                    {sample.tags.length > 4 && (
                      <span className={s.moreTags}>+{sample.tags.length - 4}</span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDownload(sample)}
                    className={s.downloadBtn}
                    disabled={!sample.downloadUrl || downloadingIds.has(sample.id)}
                    title="下载到本地库"
                  >
                    {downloadingIds.has(sample.id) ? <Spin size="small" /> : <DownloadOutlined />}
                  </button>
                </div>
              ))}
            </div>

            {hasMore && (
              <button onClick={handleLoadMore} className={s.loadMoreBtn} disabled={loading}>
                {loading ? <Spin size="small" /> : t('onlineSample.loadMore', '加载更多')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OnlineSampleBrowser;
