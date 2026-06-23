"""
SamplerHub Analyzer Sidecar
FastAPI 服务，提供 CLAP 音频/文本语义嵌入 + PANNs 声音事件检测

启动方式:
    python main.py [--port 7890] [--host 127.0.0.1]

接口:
    POST /analyze/clap     - 音频文件 → 512维 embedding
    POST /analyze/text     - 文本 → 512维 embedding
    POST /analyze/panns    - 音频文件 → 事件时间段列表
    GET  /health           - 健康检查
    POST /shutdown         - 优雅关闭
"""

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# 将当前目录加入路径，确保能 import analyzer
sys.path.insert(0, str(Path(__file__).parent))

from analyzer.clap_engine import ClapEngine, embedding_to_base64
from analyzer.audio_utils import get_audio_duration
from analyzer.panns_engine import get_panns_engine, detect_sound_events, detect_clip_tags

app = FastAPI(title='SamplerHub Analyzer', version='1.1.0')
clap_engine = ClapEngine()
panns_engine = get_panns_engine()


# ── 请求/响应模型 ─────────────────────────────────────────────────────

class ClapAudioRequest(BaseModel):
    file_path: str


class ClapTextRequest(BaseModel):
    text: str


class EmbeddingResponse(BaseModel):
    success: bool
    embedding_b64: str
    dimension: int
    duration_ms: float
    error: str | None = None


class HealthResponse(BaseModel):
    status: str
    clap_loaded: bool
    panns_loaded: bool
    version: str


class PannsRequest(BaseModel):
    file_path: str
    threshold: float = 0.3
    min_duration: float = 0.25
    max_segments: int = 20


class PannsSegment(BaseModel):
    label: str
    display_label: str
    start_time: float
    end_time: float
    peak_prob: float


class PannsResponse(BaseModel):
    success: bool
    segments: list[PannsSegment] = []
    duration_ms: float
    error: str | None = None


# ── 接口 ──────────────────────────────────────────────────────────────

@app.post('/analyze/clap', response_model=EmbeddingResponse)
async def analyze_clap(req: ClapAudioRequest):
    """从音频文件生成 CLAP embedding"""
    start = time.time()

    if not clap_engine.is_loaded:
        return EmbeddingResponse(
            success=False,
            embedding_b64='',
            dimension=0,
            duration_ms=0,
            error='CLAP 模型未加载',
        )

    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail=f'文件不存在: {req.file_path}')

    try:
        embedding = clap_engine.get_audio_embedding(req.file_path)
        b64 = embedding_to_base64(embedding)
        duration_ms = (time.time() - start) * 1000

        return EmbeddingResponse(
            success=True,
            embedding_b64=b64,
            dimension=len(embedding),
            duration_ms=duration_ms,
            error=None,
        )
    except Exception as e:
        return EmbeddingResponse(
            success=False,
            embedding_b64='',
            dimension=0,
            duration_ms=(time.time() - start) * 1000,
            error=str(e),
        )


@app.post('/analyze/text', response_model=EmbeddingResponse)
async def analyze_text(req: ClapTextRequest):
    """从文本生成 CLAP embedding（用于语义搜索）"""
    start = time.time()

    if not clap_engine.is_loaded:
        return EmbeddingResponse(
            success=False,
            embedding_b64='',
            dimension=0,
            duration_ms=0,
            error='CLAP 模型未加载',
        )

    try:
        embedding = clap_engine.get_text_embedding(req.text)
        b64 = embedding_to_base64(embedding)
        duration_ms = (time.time() - start) * 1000

        return EmbeddingResponse(
            success=True,
            embedding_b64=b64,
            dimension=len(embedding),
            duration_ms=duration_ms,
            error=None,
        )
    except Exception as e:
        return EmbeddingResponse(
            success=False,
            embedding_b64='',
            dimension=0,
            duration_ms=(time.time() - start) * 1000,
            error=str(e),
        )


@app.post('/analyze/panns', response_model=PannsResponse)
async def analyze_panns(req: PannsRequest):
    """从音频文件检测声音事件时间段（PANNs SED）"""
    start = time.time()

    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail=f'文件不存在: {req.file_path}')

    try:
        segments = detect_sound_events(
            file_path=req.file_path,
            threshold=req.threshold,
            min_duration=req.min_duration,
            max_segments=req.max_segments,
        )
        duration_ms = (time.time() - start) * 1000

        return PannsResponse(
            success=True,
            segments=[PannsSegment(**s) for s in segments],
            duration_ms=duration_ms,
            error=None,
        )
    except Exception as e:
        return PannsResponse(
            success=False,
            segments=[],
            duration_ms=(time.time() - start) * 1000,
            error=str(e),
        )


@app.get('/health', response_model=HealthResponse)
async def health():
    """健康检查"""
    return HealthResponse(
        status='ok',
        clap_loaded=clap_engine.is_loaded,
        panns_loaded=panns_engine._model_loaded,
        version='1.1.0',
    )


@app.post('/shutdown')
async def shutdown():
    """优雅关闭"""
    import asyncio
    asyncio.get_event_loop().call_later(0.5, lambda: sys.exit(0))
    return {'status': 'shutting_down'}


# ── 启动时加载模型 ────────────────────────────────────────────────────

@app.on_event('startup')
async def startup_event():
    """启动时自动加载 CLAP 模型（PANNs 懒加载）"""
    try:
        # 从环境变量读取配置
        use_fusion = os.environ.get('CLAP_FUSION', 'false').lower() == 'true'
        use_cuda = os.environ.get('CLAP_CUDA', 'false').lower() == 'true'
        clap_engine.load(enable_fusion=use_fusion, use_cuda=use_cuda)
        print('[Sidecar] CLAP 模型加载完成', flush=True)
    except Exception as e:
        print(f'[Sidecar] CLAP 模型加载失败，服务将继续运行但分析功能不可用: {e}', flush=True, file=sys.stderr)
    # PANNs 懒加载：不在启动时加载，第一次请求时加载


# ── 主入口 ────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SamplerHub Analyzer Sidecar')
    parser.add_argument('--port', type=int, default=7890, help='服务端口')
    parser.add_argument('--host', type=str, default='127.0.0.1', help='绑定地址')
    args = parser.parse_args()

    print(f'[Sidecar] 启动于 http://{args.host}:{args.port}', flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level='warning')
