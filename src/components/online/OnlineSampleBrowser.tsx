import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input, Tag, Empty, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import InlineLoader from '../common/InlineLoader';
import {
  SearchOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
  CloudOutlined,
  SoundOutlined,
  LoadingOutlined,
  HeartOutlined,
  EyeOutlined,
  DownloadOutlined as DownloadCountIcon,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { ipcClient } from '../../services/ipcClient';
import { useSettingsStore } from '../../stores/settingsStore';
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
  extras?: Record<string, string>;
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
  const onlineDownloadFolder = useSettingsStore(s => s.onlineDownloadFolder);
  const setOnlineDownloadFolder = useSettingsStore(s => s.setOnlineDownloadFolder);
  const [activeSource, setActiveSource] = useState<SampleSource>('pixabay');
  const [query, setQuery] = useState('');
  const [samples, setSamples] = useState<OnlineSampleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [playProgress, setPlayProgress] = useState<Record<string, number>>({});
  const [playDuration, setPlayDuration] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清理音频和定时器
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
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
      toast.error(err.message || t('onlineSample.searchFailed'));
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

  const startProgressTimer = useCallback((audio: HTMLAudioElement, sampleId: string) => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    progressTimerRef.current = setInterval(() => {
      if (audio.duration && isFinite(audio.duration)) {
        setPlayProgress(prev => ({ ...prev, [sampleId]: audio.currentTime }));
        setPlayDuration(prev => ({ ...prev, [sampleId]: audio.duration }));
      }
    }, 100);
  }, []);

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const handlePreview = useCallback(async (sample: OnlineSampleItem) => {
    if (playingId === sample.id) {
      // 停止播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      stopProgressTimer();
      setPlayingId(null);
      return;
    }

    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopProgressTimer();
    setPlayingId(null);

    setLoadingPreviewId(sample.id);

    try {
      // 通过主进程代理预缓存音频，绕过 CORS
      const { previewUrl } = await ipcClient.onlineCachePreview(sample.previewUrl);

      const audio = new Audio(previewUrl);
      let hasStarted = false;

      // 音频可以播放时自动开始
      const onCanPlay = () => {
        if (hasStarted) return;
        hasStarted = true;
        audio.play().catch((err) => {
          console.error('[Preview] Play failed:', err);
          toast.error(t('onlineSample.previewFailed'));
          setPlayingId(null);
          setLoadingPreviewId(null);
        });
      };

      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('canplaythrough', onCanPlay);

      audio.addEventListener('ended', () => {
        stopProgressTimer();
        setPlayingId(null);
        setPlayProgress(prev => ({ ...prev, [sample.id]: 0 }));
      });

      audio.addEventListener('error', (e) => {
        console.error('[Preview] Audio error:', e);
        toast.error(t('onlineSample.previewFailed'));
        setPlayingId(null);
        setLoadingPreviewId(null);
      });

      audio.addEventListener('playing', () => {
        setLoadingPreviewId(null);
        startProgressTimer(audio, sample.id);
      });

      // 如果音频已经缓存（快速返回），canplay 可能已触发
      // 手动检查 readyState
      if (audio.readyState >= 3) {
        onCanPlay();
      }

      audioRef.current = audio;
      setPlayingId(sample.id);
    } catch (err: any) {
      console.error('[Preview] Cache failed:', err);
      toast.error(err.message || t('onlineSample.previewFailed'));
      setLoadingPreviewId(null);
    }
  }, [playingId, t, startProgressTimer, stopProgressTimer]);

  const handleSeek = useCallback((sampleId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || playingId !== sampleId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = playDuration[sampleId] || 0;
    audioRef.current.currentTime = ratio * dur;
    setPlayProgress(prev => ({ ...prev, [sampleId]: ratio * dur }));
  }, [playingId, playDuration]);

  const handleDownload = useCallback(async (sample: OnlineSampleItem) => {
    if (!sample.downloadUrl) {
      toast.warning(t('onlineSample.noDownload'));
      return;
    }

    setDownloadingIds(prev => new Set(prev).add(sample.id));
    try {
      const urlFileName = sample.extras?.filename
        || sample.previewUrl.split('/').pop() || 'sample.mp3';
      const ext = urlFileName.includes('.wav') ? '.wav' : urlFileName.includes('.ogg') ? '.ogg' : '.mp3';
      const fileName = `${sample.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_')}${ext}`;

      const headers: Record<string, string> = {};
      if (sample.source === 'freesound' && freesoundApiKey) {
        headers['Authorization'] = `Token ${freesoundApiKey}`;
      }

      const result = await ipcClient.onlineDownload(
        sample.downloadUrl,
        fileName,
        Object.keys(headers).length > 0 ? headers : undefined,
        onlineDownloadFolder || undefined
      );

      toast.success(
        <div>
          <div>{t('onlineSample.downloadSuccess', { file: fileName })}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
            保存到: {result.saveDir}
          </div>
        </div>
      );
    } catch (err: any) {
      toast.error(err.message || t('onlineSample.downloadFailed'));
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(sample.id);
        return next;
      });
    }
  }, [freesoundApiKey, onlineDownloadFolder]);

  const formatDuration = (d: number) => {
    if (!d || d <= 0) return '--';
    if (d < 60) return `${d.toFixed(1)}s`;
    const m = Math.floor(d / 60);
    const s = Math.floor(d % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatCount = (count?: string) => {
    if (!count) return '';
    const n = parseInt(count, 10);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  const getSourceBadge = (source: string) => {
    const config = SOURCE_CONFIG.find(s => s.key === source);
    return config?.icon || '🎵';
  };

  const getProgressPercent = (sampleId: string) => {
    const current = playProgress[sampleId] || 0;
    const dur = playDuration[sampleId] || 0;
    return dur > 0 ? (current / dur) * 100 : 0;
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
              setPlayingId(null);
              stopProgressTimer();
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
          <span>{t('onlineSample.freesoundKeyHint')}</span>
        </div>
      )}
      {activeSource === 'pixabay' && !pixabayApiKey && (
        <div className={s.keyHint}>
          <span>{t('onlineSample.pixabayKeyHint')}</span>
        </div>
      )}

      {/* 下载路径配置 */}
      <div className={s.downloadPathBar}>
        <span className={s.downloadPathLabel}>
          <FolderOpenOutlined /> 下载目录:
        </span>
        <span className={s.downloadPathValue} title={onlineDownloadFolder || '默认（第一个监视文件夹）'}>
          {onlineDownloadFolder || '默认（第一个监视文件夹）'}
        </span>
        <button
          className={s.downloadPathBtn}
          onClick={async () => {
            try {
              const result = await ipcClient.selectOnlineDownloadFolder();
              setOnlineDownloadFolder(result.folder);
              toast.success('下载目录已设置: ' + result.folder);
            } catch {
              // 用户取消
            }
          }}
        >
          更改
        </button>
        {onlineDownloadFolder && (
          <button
            className={s.downloadPathBtn}
            onClick={() => {
              setOnlineDownloadFolder('');
              toast.success('已恢复默认下载目录');
            }}
          >
            恢复默认
          </button>
        )}
      </div>

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
            {loading ? <LoadingOutlined /> : t('onlineSample.search', '搜索')}
          </button>
        </div>
      )}

      {/* SND.dev 分类提示 */}
      {activeSource === 'snddev' && (
        <div className={s.snddevHint}>
          <SoundOutlined style={{ marginRight: 6 }} />
          {t('onlineSample.snddevHint')}
        </div>
      )}

      {/* Results */}
      <div className={s.results}>
        {loading && samples.length === 0 ? (
          <div className={s.loading}>
            <InlineLoader size="large" />
          </div>
        ) : samples.length === 0 ? (
          <Empty
            description={t('onlineSample.noResults', '暂无结果，试试搜索')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <>
            <div className={s.resultInfo}>
              {t('onlineSample.resultCount', { count: total })}
            </div>

            <div className={s.sampleList}>
              {samples.map(sample => {
                const isPlaying = playingId === sample.id;
                const isLoadingPreview = loadingPreviewId === sample.id;
                const progressPct = getProgressPercent(sample.id);

                return (
                  <div key={sample.id} className={`${s.sampleItem} ${isPlaying ? s.sampleItemPlaying : ''}`}>
                    {/* 缩略图 */}
                    <div className={s.thumbnail}>
                      {sample.extras?.thumbnailUrl ? (
                        <img
                          src={sample.extras.thumbnailUrl}
                          alt={sample.name}
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove(s.thumbnailFallbackHidden);
                          }}
                        />
                      ) : null}
                      <div className={`${s.thumbnailFallback} ${sample.extras?.thumbnailUrl ? s.thumbnailFallbackHidden : ''}`}>
                        <SoundOutlined />
                      </div>
                      {/* 播放覆盖层 */}
                      <button
                        onClick={() => handlePreview(sample)}
                        className={s.playOverlay}
                        title={isPlaying ? t('onlineSample.stop') : t('onlineSample.preview')}
                      >
                        {isLoadingPreview
                          ? <LoadingOutlined spin />
                          : isPlaying
                            ? <PauseCircleOutlined />
                            : <PlayCircleOutlined />
                        }
                      </button>
                    </div>

                    {/* 音效信息 */}
                    <div className={s.sampleInfo}>
                      <span className={s.sampleName} title={sample.name}>{sample.name}</span>
                      <div className={s.sampleMeta}>
                        <span className={s.sourceBadge}>{getSourceBadge(sample.source)}</span>
                        <span className={s.sampleDuration}>{formatDuration(sample.duration)}</span>
                        {sample.extras?.viewCount && (
                          <Tooltip title={`${sample.extras.viewCount} 次播放`}>
                            <span className={s.statBadge}><EyeOutlined /> {formatCount(sample.extras.viewCount)}</span>
                          </Tooltip>
                        )}
                        {sample.extras?.downloadCount && (
                          <Tooltip title={`${sample.extras.downloadCount} 次下载`}>
                            <span className={s.statBadge}><DownloadCountIcon /> {formatCount(sample.extras.downloadCount)}</span>
                          </Tooltip>
                        )}
                        {sample.extras?.likeCount && (
                          <Tooltip title={`${sample.extras.likeCount} 次收藏`}>
                            <span className={s.statBadge}><HeartOutlined /> {formatCount(sample.extras.likeCount)}</span>
                          </Tooltip>
                        )}
                        {sample.license && (
                          <Tooltip title={sample.license}>
                            <span className={s.licenseTag}>CC</span>
                          </Tooltip>
                        )}
                      </div>
                      {/* 播放进度条 */}
                      {isPlaying && (
                        <div className={s.progressContainer} onClick={(e) => handleSeek(sample.id, e)}>
                          <div className={s.progressTrack}>
                            <div className={s.progressFill} style={{ width: `${progressPct}%` }} />
                          </div>
                          <span className={s.progressTime}>
                            {formatDuration(playProgress[sample.id] || 0)} / {formatDuration(playDuration[sample.id] || sample.duration)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 标签 */}
                    <div className={s.sampleTags}>
                      {sample.tags.slice(0, 4).map(tag => (
                        <Tag key={tag} className={s.tag}>{tag}</Tag>
                      ))}
                      {sample.tags.length > 4 && (
                        <span className={s.moreTags}>+{sample.tags.length - 4}</span>
                      )}
                    </div>

                    {/* 下载按钮 */}
                    <button
                      onClick={() => handleDownload(sample)}
                      className={s.downloadBtn}
                      disabled={!sample.downloadUrl || downloadingIds.has(sample.id)}
                      title={t('onlineSample.download')}
                    >
                      {downloadingIds.has(sample.id) ? <InlineLoader size="small" /> : <DownloadOutlined />}
                    </button>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <button onClick={handleLoadMore} className={s.loadMoreBtn} disabled={loading}>
                {loading ? <InlineLoader size="small" /> : t('onlineSample.loadMore', '加载更多')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OnlineSampleBrowser;
