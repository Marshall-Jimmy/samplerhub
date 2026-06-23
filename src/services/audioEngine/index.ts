/**
 * audioEngine — 原生 Web Audio 播放引擎
 *
 * 统一导出入口
 */

export { PlaybackEngine, getPlaybackEngine, destroyPlaybackEngine } from './playbackEngine';
export type { EngineState, PlayOptions, EngineEvent, EngineEventCallback } from './playbackEngine';

export { BufferCache, getBufferCache, destroyBufferCache } from './bufferCache';

export { DecoderPool, getDecoderPool, destroyDecoderPool, estimateAudioBufferSize } from './decoderPool';

export { SourceManager } from './sourceManager';
export type { ActiveSource } from './sourceManager';