import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  StepBackwardOutlined,
  StepForwardOutlined,
  CaretRightOutlined,
  PauseOutlined,
  SoundOutlined,
  RetweetOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { handleIpcError } from '../../utils/ipcError';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { ipcClient } from '../../services/ipcClient';
import { getCachedWaveformByPath, setCachedWaveformByPath, drawWaveformToCanvas } from '../../utils/waveformCache';
import s from '../../styles/components/player-bar.module.css';

// 使用 Web Audio API 解码音频获取真实波形
async function decodeWithWebAudio(filePath: string): Promise<number[] | null> {
  let audioCtx: AudioContext | null = null;
  try {
    const result = await window.electronAPI.invoke('audio:getBuffer', { filePath });
    if (!result?.success || !result.data) return null;

    const binaryString = atob(result.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);

    const rawData = audioBuffer.getChannelData(0);
    const SAMPLES = 200;
    const blockSize = Math.floor(rawData.length / SAMPLES);
    const waveform: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[i * blockSize + j]);
      }
      waveform.push(sum / blockSize);
    }

    const max = Math.max(...waveform);
    if (max > 0) {
      for (let i = 0; i < waveform.length; i++) {
        waveform[i] = waveform[i] / max;
      }
    }

    return waveform;
  } catch {
    return null;
  } finally {
    audioCtx?.close();
  }
}

const PlayerBar: React.FC = () => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformDataRef = useRef<number[] | null>(null);
  const [waveformLoaded, setWaveformLoaded] = useState(false);
  const [loopMenuOpen, setLoopMenuOpen] = useState(false);
  const loopMenuRef = useRef<HTMLDivElement>(null);
  const {
    currentSampleName,
    currentSamplePath,
    isPlaying,
    duration,
    currentTime,
    progress,
    volume,
    isLooping,
    playbackRate,
    loopStart,
    loopEnd,
    isABLooping,
    pause,
    resume,
    seek,
    setVolume,
    toggleLoop,
    setPlaybackRate,
    playNext,
    playPrev,
    setLoopA,
    setLoopB,
    clearABLoop,
    formatTime,
    PLAYBACK_RATES,
  } = useAudioPlayer();

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  // 点击外部关闭循环下拉菜单
  useEffect(() => {
    if (!loopMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (loopMenuRef.current && !loopMenuRef.current.contains(e.target as Node)) {
        setLoopMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [loopMenuOpen]);

  // 通过 IPC 从主进程获取真实波形数据（带 LRU 缓存）
  useEffect(() => {
    if (!currentSamplePath) {
      waveformDataRef.current = null;
      setWaveformLoaded(false);
      return;
    }

    const cached = getCachedWaveformByPath(currentSamplePath);
    if (cached) {
      waveformDataRef.current = cached;
      setWaveformLoaded(true);
      return;
    }

    let cancelled = false;

    const loadWaveform = async () => {
      try {
        const data = await ipcClient.getWaveform(currentSamplePath);
        if (cancelled) return;

        if (data && data.length > 0) {
          const isPseudo = !currentSamplePath.toLowerCase().endsWith('.wav');
          if (isPseudo) {
            try {
              const realWaveform = await decodeWithWebAudio(currentSamplePath);
              if (!cancelled && realWaveform) {
                setCachedWaveformByPath(currentSamplePath, realWaveform);
                waveformDataRef.current = realWaveform;
                setWaveformLoaded(true);
                return;
              }
            } catch {
              // Web Audio 解码失败，使用 IPC 返回的伪随机波形
            }
          }
          setCachedWaveformByPath(currentSamplePath, data);
          waveformDataRef.current = data;
          setWaveformLoaded(true);
        }
      } catch {
        if (!cancelled) setWaveformLoaded(false);
      }
    };

    loadWaveform();
    return () => { cancelled = true; };
  }, [currentSamplePath]);

  // Draw waveform（使用统一绘制函数 + 峰值包络）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const waveform = waveformDataRef.current;
    if (waveform && waveformLoaded) {
      const w = canvas.getBoundingClientRect().width;
      const progressX = progress * w;

      drawWaveformToCanvas(canvas, waveform, {
        accentColor: '#22D3EE',
        isPlaying,
        progressX,
        hoverX: hoverTime !== null ? (hoverTime / duration) * w : null,
      });

      // A-B 循环标记叠加绘制
      const ctx = canvas.getContext('2d');
      if (ctx && (loopStart !== null || loopEnd !== null) && duration > 0) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(1 / dpr, 1 / dpr); // reset scale to draw in CSS pixels
        ctx.scale(dpr, dpr);
        const cw = rect.width;
        const ch = rect.height;

        if (loopStart !== null && loopEnd !== null) {
          const aX = (loopStart / duration) * cw;
          const bX = (loopEnd / duration) * cw;
          ctx.fillStyle = isABLooping ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)';
          ctx.fillRect(aX, 0, bX - aX, ch);
          ctx.fillStyle = '#6366F1';
          ctx.fillRect(aX - 1, 0, 2, ch);
          ctx.fillRect(bX - 1, 0, 2, ch);
        } else if (loopStart !== null) {
          const aX = (loopStart / duration) * cw;
          ctx.fillStyle = 'rgba(99, 102, 241, 0.5)';
          ctx.fillRect(aX - 1, 0, 2, ch);
        }
        ctx.restore();
      }
    }
  }, [progress, waveformLoaded, isPlaying, loopStart, loopEnd, isABLooping, duration, hoverTime]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newProgress = x / rect.width;
    seek(newProgress * duration);
  }, [duration, seek]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value) / 100);
  }, [setVolume]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    setHoverTime(ratio * duration);
    setHoverX(x);
  }, [duration]);

  const handleCanvasMouseLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  return (
    <div className={s.playerBar} role="region" aria-label={t('player.play')}>
      {/* Left: Transport Controls */}
      <div className={s.transport}>
        <button onClick={playPrev} className={`${s.controlBtn} ${s.controlSmall}`} aria-label={t('player.prev')}>
          <StepBackwardOutlined />
        </button>

        <button
          onClick={() => isPlaying ? pause() : resume()}
          className={s.playBtn}
          aria-label={isPlaying ? t('player.pause') : t('player.play')}
          aria-pressed={isPlaying}
        >
          {isPlaying ? <PauseOutlined /> : <CaretRightOutlined style={{ marginLeft: 2 }} />}
        </button>

        <button onClick={playNext} className={`${s.controlBtn} ${s.controlSmall}`} aria-label={t('player.next')}>
          <StepForwardOutlined />
        </button>
      </div>

      {/* Center: Waveform + Time */}
      <div className={s.waveformArea}>
        {currentSampleName && (
          <div className={s.sampleName}>{currentSampleName}</div>
        )}
        <div className={s.waveformContainer}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
            className={s.waveformCanvas}
            role="slider"
            aria-label={t('player.progress')}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
          />
          {hoverTime !== null && (
            <div
              className={s.hoverTooltip}
              style={{ left: Math.min(Math.max(hoverX - 20, 0), 200) }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>
        <div className={s.timeDisplay}>
          <span className={s.timeLabel}>{formatTime(currentTime)}</span>
          <span className={s.timeLabel}>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: Volume + Controls */}
      <div className={s.rightControls}>
        {/* 循环按钮 + A-B 循环下拉菜单 */}
        <div className={s.loopMenu} ref={loopMenuRef}>
          <button
            onClick={() => {
              if (!loopMenuOpen) {
                setLoopMenuOpen(true);
              } else {
                setLoopMenuOpen(false);
                toggleLoop();
              }
            }}
            className={`${s.controlBtn} ${s.controlSmall} ${s.loopBtn} ${isLooping ? s.loopBtnActive : ''}`}
            title={t('player.loop')}
            aria-label={t('player.loop')}
            aria-pressed={isLooping}
            aria-expanded={loopMenuOpen}
            aria-haspopup="true"
          >
            <RetweetOutlined />
          </button>

          {/* A-B 循环下拉面板 */}
          <div className={`${s.loopDropdown} ${loopMenuOpen ? s.loopDropdownOpen : ''}`}>
            <div className={s.loopDropdownItem}>
              <button
                onClick={() => { toggleLoop(); setLoopMenuOpen(false); }}
                className={`${s.loopDropdownBtn} ${isLooping ? s.loopDropdownBtnActive : ''}`}
              >
                <RetweetOutlined style={{ fontSize: 13 }} />
                <span>{t('player.loop')}</span>
              </button>
            </div>
            <div className={s.loopDropdownDivider} />
            <div className={s.loopDropdownItem}>
              <button
                onClick={() => { if (isABLooping) { clearABLoop(); } else { setLoopA(); } setLoopMenuOpen(false); }}
                className={`${s.loopDropdownBtn} ${loopStart !== null ? s.loopDropdownBtnActive : ''}`}
              >
                A
              </button>
              <button
                onClick={() => { setLoopB(); setLoopMenuOpen(false); }}
                className={`${s.loopDropdownBtn} ${loopEnd !== null ? s.loopDropdownBtnActive : ''}`}
              >
                B
              </button>
              {isABLooping && currentSamplePath && (
                <button
                  onClick={async () => {
                    try {
                      const outputPath = await ipcClient.exportSelection(currentSamplePath, loopStart!, loopEnd!);
                      toast.success(t('player.exportSuccess', { path: outputPath }));
                    } catch (err) { handleIpcError(err); }
                    setLoopMenuOpen(false);
                  }}
                  className={s.loopDropdownBtn}
                  title={t('player.exportSelection')}
                >
                  <ExportOutlined style={{ fontSize: 11 }} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* A-B 循环（独立显示，>1024px 时可见） */}
        <div className={s.abLoop}>
          <button
            onClick={isABLooping ? clearABLoop : setLoopA}
            className={`${s.controlBtn} ${s.abBtn} ${loopStart !== null ? s.abBtnActive : ''}`}
            title={isABLooping ? t('player.clearABLoop') : t('player.setLoopA')}
          >
            A
          </button>
          <button
            onClick={setLoopB}
            className={`${s.controlBtn} ${s.abBtn} ${loopEnd !== null ? s.abBtnActive : ''}`}
            title={t('player.setLoopB')}
          >
            B
          </button>
          {isABLooping && currentSamplePath && (
            <button
              onClick={async () => {
                try {
                  const outputPath = await ipcClient.exportSelection(currentSamplePath, loopStart!, loopEnd!);
                  toast.success(t('player.exportSuccess', { path: outputPath }));
                } catch (err) { handleIpcError(err); }
              }}
              className={`${s.controlBtn} ${s.abBtn}`}
              title={t('player.exportSelection')}
            >
              <ExportOutlined style={{ fontSize: 11 }} />
            </button>
          )}
        </div>

        {/* 变速播放 */}
        <select
          value={playbackRate}
          onChange={(e) => setPlaybackRate(Number(e.target.value) as any)}
          className={`${s.rateSelect} ${playbackRate !== 1 ? s.rateSelectActive : ''}`}
          title={t('player.speed')}
        >
          {PLAYBACK_RATES.map(r => (
            <option key={r} value={r}>{r}x</option>
          ))}
        </select>

        <div className={s.volumeControl}>
          <SoundOutlined className={s.volumeIcon} />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={handleVolumeChange}
            className={s.volumeSlider}
            aria-label={t('player.volume')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volume * 100)}
          />
        </div>
      </div>
    </div>
  );
};

export default PlayerBar;
