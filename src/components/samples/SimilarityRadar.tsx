import React, { useRef, useEffect } from 'react';
import s from '../../styles/components/similarity-radar.module.css';

interface RadarDataPoint {
  label: string;
  value: number; // 0-1
}

interface SimilarityRadarProps {
  data: RadarDataPoint[];
  accentColor?: string;
  size?: number;
}

/**
 * 相似度雷达图 — 在 canvas 上绘制多维度对比
 */
const SimilarityRadar: React.FC<SimilarityRadarProps> = ({
  data,
  accentColor = '#6366F1',
  size = 180,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 3) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 28;
    const n = data.length;
    const angleStep = (2 * Math.PI) / n;

    // 绘制背景网格
    const levels = 4;
    for (let l = 1; l <= levels; l++) {
      const r = (maxR / levels) * l;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 绘制轴线
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 绘制数据区域
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const angle = idx * angleStep - Math.PI / 2;
      const r = data[idx].value * maxR;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = accentColor + '25';
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制数据点
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const r = data[i].value * maxR;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }

    // 绘制标签
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const labelR = maxR + 16;
      const x = cx + labelR * Math.cos(angle);
      const y = cy + labelR * Math.sin(angle);
      ctx.fillText(data[i].label, x, y);
    }
  }, [data, accentColor, size]);

  if (data.length < 3) return null;

  return (
    <div className={s.container}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </div>
  );
};

export default SimilarityRadar;

/**
 * 从两个采样计算相似度雷达数据
 */
export function computeSimilarityRadar(
  source: { bpm?: number | null; key?: string | null; duration?: number | null; category?: { name: string } | null },
  target: { bpm?: number | null; key?: string | null; duration?: number | null; category?: { name: string } | null }
): { label: string; value: number }[] {
  // BPM 相似度 (0-200 范围内)
  const bpmSim = (source.bpm != null && target.bpm != null)
    ? 1 - Math.min(Math.abs(source.bpm - target.bpm) / 80, 1)
    : 0;

  // Key 相似度
  const keySim = (source.key && target.key)
    ? source.key === target.key ? 1 : source.key.replace(/m$/i, '') === target.key.replace(/m$/i, '') ? 0.7 : 0.2
    : 0;

  // 时长相似度
  const durSim = (source.duration != null && target.duration != null)
    ? 1 - Math.min(Math.abs(source.duration - target.duration) / Math.max(source.duration, target.duration, 1), 1)
    : 0;

  // 分类相似度
  const catSim = (source.category?.name && target.category?.name)
    ? source.category.name === target.category.name ? 1 : 0.3
    : 0;

  return [
    { label: 'BPM', value: Math.max(0, bpmSim) },
    { label: 'Key', value: keySim },
    { label: 'Duration', value: Math.max(0, durSim) },
    { label: 'Category', value: catSim },
  ];
}
