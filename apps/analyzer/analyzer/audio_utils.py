"""
音频文件处理工具
支持多种格式读取、重采样、时长限制
"""

import os
import tempfile
import subprocess
import numpy as np
from pathlib import Path


def load_audio(file_path: str, target_sr: int = 48000, max_duration: float = 10.0) -> tuple[np.ndarray, int]:
    """
    加载音频文件为单声道 numpy 数组

    Args:
        file_path: 音频文件路径
        target_sr: 目标采样率
        max_duration: 最大读取时长（秒），CLAP 模型通常限制 10 秒

    Returns:
        (audio_array, sample_rate)
    """
    try:
        # 优先使用 librosa
        import librosa
        audio, sr = librosa.load(file_path, sr=target_sr, mono=True, duration=max_duration)
        return audio.astype(np.float32), sr
    except Exception:
        # fallback: 使用 ffmpeg 转码为临时 WAV 再读取
        return _load_with_ffmpeg(file_path, target_sr, max_duration)


def _load_with_ffmpeg(file_path: str, target_sr: int, max_duration: float) -> tuple[np.ndarray, int]:
    """使用 ffmpeg 读取任意格式音频"""
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp_path = tmp.name

    try:
        # ffmpeg: 转码为单声道 WAV，限制时长
        cmd = [
            'ffmpeg', '-y',
            '-i', file_path,
            '-ar', str(target_sr),
            '-ac', '1',
            '-t', str(max_duration),
            '-f', 'wav',
            tmp_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)

        # 读取临时 WAV
        import soundfile as sf
        audio, sr = sf.read(tmp_path, dtype='float32')
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        return audio, sr
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def get_audio_duration(file_path: str) -> float:
    """获取音频文件时长（秒）"""
    try:
        import soundfile as sf
        info = sf.info(file_path)
        return info.duration
    except Exception:
        try:
            import librosa
            return librosa.get_duration(path=file_path)
        except Exception:
            return 0.0
