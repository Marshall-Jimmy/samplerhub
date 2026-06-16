/** Shared IPC context - passed to all module registration functions */
export interface IpcContext {
  db: any; // Drizzle Database instance
  sqlite: any; // BetterSQLite3 raw instance
  sampleListFields: {
    id: any; filePath: any; fileName: any; fileSize: any; fileHash: any; fileType: any;
    createdAt: any; modifiedAt: any; duration: any; sampleRate: any; bitRate: any;
    channels: any; bpm: any; key: any; categoryId: any; isFavorite: any;
    isCorrupted: any; playCount: any; lastPlayedAt: any; indexedAt: any;
    midiTrackCount: any; midiNoteCount: any; midiInstruments: any; midiTimeSignature: any;
  };
}
