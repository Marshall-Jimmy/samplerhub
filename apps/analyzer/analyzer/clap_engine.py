"""
CLAP 语义嵌入引擎
基于 laion-clap 的音频/文本语义嵌入生成
"""

import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import numpy as np


class ClapEngine:
    """CLAP 模型推理引擎（单例模式）"""

    _instance: Optional['ClapEngine'] = None
    _model = None
    _model_name: str = 'HTSAT-base'  # 或 'HTSAT-tiny' 用于更快推理

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self, enable_fusion: bool = False, use_cuda: bool = False) -> None:
        """
        加载 CLAP 模型（lazy-load，首次调用时加载）

        Args:
            enable_fusion: 是否使用 fusion 模型（精度更高但更大）
            use_cuda: 是否使用 GPU（需要 CUDA 环境）
        """
        if self._model is not None:
            return

        try:
            from laion_clap import CLAP_Module

            print('[CLAP] 正在加载模型...', flush=True)
            start = time.time()

            model_name = 'HTSAT-base' if not enable_fusion else 'HTSAT-fused'
            self._model = CLAP_Module(
                enable_fusion=enable_fusion,
                amodel=model_name,
            )

            # 自动下载或加载本地权重
            self._model.load_ckpt()

            if use_cuda and self._is_cuda_available():
                self._model.model = self._model.model.cuda()
                print('[CLAP] 已切换到 CUDA', flush=True)

            elapsed = time.time() - start
            print(f'[CLAP] 模型加载完成，耗时 {elapsed:.1f}s', flush=True)

        except Exception as e:
            print(f'[CLAP] 模型加载失败: {e}', flush=True, file=sys.stderr)
            raise

    def get_audio_embedding(self, file_path: str) -> np.ndarray:
        """
        从音频文件生成 512 维语义嵌入向量

        Args:
            file_path: 音频文件路径

        Returns:
            512 维 float32 numpy 数组
        """
        if self._model is None:
            raise RuntimeError('CLAP 模型未加载，请先调用 load()')

        from .audio_utils import load_audio

        # 加载音频（CLAP 使用 48000Hz，最多 10 秒）
        audio, sr = load_audio(file_path, target_sr=48000, max_duration=10.0)

        # 生成 embedding
        embedding = self._model.get_audio_embedding_from_data(
            [audio],
            use_tensor=False,
        )

        # 返回 1D 数组
        return np.array(embedding[0], dtype=np.float32)

    def get_text_embedding(self, text: str) -> np.ndarray:
        """
        从文本生成 512 维语义嵌入向量

        Args:
            text: 搜索文本（如 "kick drum bright"）

        Returns:
            512 维 float32 numpy 数组
        """
        if self._model is None:
            raise RuntimeError('CLAP 模型未加载，请先调用 load()')

        embedding = self._model.get_text_embedding([text], use_tensor=False)
        return np.array(embedding[0], dtype=np.float32)

    def batch_audio_embeddings(self, file_paths: list[str]) -> list[np.ndarray]:
        """批量生成音频 embedding（效率更高）"""
        if self._model is None:
            raise RuntimeError('CLAP 模型未加载')

        from .audio_utils import load_audio

        audios = []
        for fp in file_paths:
            audio, _ = load_audio(fp, target_sr=48000, max_duration=10.0)
            audios.append(audio)

        embeddings = self._model.get_audio_embedding_from_data(audios, use_tensor=False)
        return [np.array(e, dtype=np.float32) for e in embeddings]

    @staticmethod
    def _is_cuda_available() -> bool:
        try:
            import torch
            return torch.cuda.is_available()
        except Exception:
            return False


# ── 工具函数 ──────────────────────────────────────────────────────────

def embedding_to_base64(embedding: np.ndarray) -> str:
    """将 float32 numpy 数组编码为 base64 字符串"""
    bytes_data = embedding.astype(np.float32).tobytes()
    return base64.b64encode(bytes_data).decode('utf-8')


def base64_to_embedding(b64_str: str) -> np.ndarray:
    """从 base64 字符串解码为 float32 numpy 数组"""
    bytes_data = base64.b64decode(b64_str)
    return np.frombuffer(bytes_data, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """计算两个向量的余弦相似度"""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))
