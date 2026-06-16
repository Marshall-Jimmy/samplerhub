import zlib from 'node:zlib';

/** CRC-32 计算 */
export function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 创建简易 ZIP 文件缓冲区
 * 支持 Store（不压缩）和 Deflate 压缩
 */
export function createZipBuffer(entries: { name: string; data: Buffer; compressed: boolean }[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    let fileData = entry.data;
    let compressionMethod = 0; // Store
    let compressedSize = fileData.length;
    const crc = crc32(fileData);

    if (entry.compressed) {
      const deflated = zlib.deflateRawSync(fileData);
      if (deflated.length < fileData.length) {
        fileData = deflated;
        compressionMethod = 8; // Deflate
        compressedSize = fileData.length;
      }
    }

    // Local File Header (30 + name length + data)
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0);   // Signature
    localHeader.writeUInt16LE(20, 4);             // Version needed
    localHeader.writeUInt16LE(0, 6);              // Flags
    localHeader.writeUInt16LE(compressionMethod, 8); // Compression
    localHeader.writeUInt16LE(0, 10);             // Mod time
    localHeader.writeUInt16LE(0, 12);             // Mod date
    localHeader.writeUInt32LE(crc, 14);           // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(entry.data.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26); // Name length
    localHeader.writeUInt16LE(0, 28);             // Extra length
    nameBytes.copy(localHeader, 30);

    localHeaders.push(localHeader);
    localHeaders.push(fileData);

    // Central Directory Header
    const centralHeader = Buffer.alloc(46 + nameBytes.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);  // Signature
    centralHeader.writeUInt16LE(20, 4);            // Version made by
    centralHeader.writeUInt16LE(20, 6);            // Version needed
    centralHeader.writeUInt16LE(0, 8);             // Flags
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(0, 12);            // Mod time
    centralHeader.writeUInt16LE(0, 14);            // Mod date
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);            // Extra length
    centralHeader.writeUInt16LE(0, 32);            // Comment length
    centralHeader.writeUInt16LE(0, 34);            // Disk number
    centralHeader.writeUInt16LE(0, 36);            // Internal attrs
    centralHeader.writeUInt32LE(0, 38);            // External attrs
    centralHeader.writeUInt32LE(offset, 42);       // Local header offset
    nameBytes.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + fileData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  // End of Central Directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);   // Signature
  eocd.writeUInt16LE(0, 4);             // Disk number
  eocd.writeUInt16LE(0, 6);             // Central dir disk
  eocd.writeUInt16LE(entries.length, 8); // Entries on disk
  eocd.writeUInt16LE(entries.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12); // Central dir size
  eocd.writeUInt32LE(centralDirOffset, 16); // Central dir offset
  eocd.writeUInt16LE(0, 20);            // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/** 从 WAV Buffer 提取波形数据 */
export function extractWavWaveform(buffer: Buffer): number[] | null {
  const SAMPLES = 200;

  try {
    const riff = buffer.toString('ascii', 0, 4);
    if (riff !== 'RIFF') return null;

    // 找到 data chunk
    let offset = 12;
    while (offset < buffer.length - 8) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const dataStart = offset + 8;
        const pcmData = buffer.subarray(dataStart, Math.min(dataStart + chunkSize, buffer.length));

        // 16-bit PCM
        const sampleCount = Math.floor(pcmData.length / 2);
        const blockSize = Math.floor(sampleCount / SAMPLES);
        if (blockSize === 0) return null;

        const waveform: number[] = [];
        for (let i = 0; i < SAMPLES; i++) {
          let sum = 0;
          const start = i * blockSize * 2;
          for (let j = 0; j < blockSize && (start + j * 2 + 1) < pcmData.length; j++) {
            const sample = pcmData.readInt16LE(start + j * 2);
            sum += Math.abs(sample);
          }
          waveform.push(sum / blockSize / 32768);
        }

        // 归一化
        const max = Math.max(...waveform);
        if (max > 0) {
          for (let i = 0; i < waveform.length; i++) {
            waveform[i] = waveform[i] / max;
          }
        }

        return waveform;
      }
      offset += 8 + chunkSize;
    }
  } catch {
    // 解析失败
  }

  return null;
}

/** 伪随机波形（非 WAV 文件回退） */
export function generatePseudoWaveform(filePath: string): number[] {
  const SAMPLES = 200;
  const seed = filePath.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const waveform: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const x = Math.sin(seed * 9301 + i * 49297 + 233280) * 49297;
    const v = x - Math.floor(x);
    waveform.push(v * 0.6 + 0.2);
  }
  return waveform;
}
