export const AUDIO_EXTENSIONS = new Set([
  '.wav', '.mp3', '.flac', '.aiff', '.ogg', 
  '.m4a', '.wma', '.aac', '.opus'
]);

export const MIDI_EXTENSIONS = new Set([
  '.mid', '.midi'
]);

export const ALL_SUPPORTED_EXTENSIONS = new Set([
  ...AUDIO_EXTENSIONS,
  ...MIDI_EXTENSIONS,
]);

export const AUDIO_MIME_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.aiff': 'audio/aiff',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
};

export const SYSTEM_CATEGORIES = [
  { id: 1, name: 'Kick', isSystem: true, sortOrder: 1 },
  { id: 2, name: 'Snare', isSystem: true, sortOrder: 2 },
  { id: 3, name: 'Clap', isSystem: true, sortOrder: 3 },
  { id: 4, name: 'Hi-Hat', isSystem: true, sortOrder: 4 },
  { id: 5, name: 'Open Hat', isSystem: true, sortOrder: 5 },
  { id: 6, name: '808 Bass', isSystem: true, sortOrder: 6 },
  { id: 7, name: 'Percussion', isSystem: true, sortOrder: 7 },
  { id: 8, name: 'Rim', isSystem: true, sortOrder: 8 },
  { id: 9, name: 'Bass', isSystem: true, sortOrder: 9 },
  { id: 10, name: 'Synth', isSystem: true, sortOrder: 10 },
  { id: 11, name: 'Vocal', isSystem: true, sortOrder: 11 },
  { id: 12, name: 'FX', isSystem: true, sortOrder: 12 },
  { id: 13, name: 'Drum Loop', isSystem: true, sortOrder: 13 },
  { id: 14, name: 'Top Loop', isSystem: true, sortOrder: 14 },
  { id: 15, name: 'Shaker', isSystem: true, sortOrder: 15 },
  { id: 16, name: 'Pad', isSystem: true, sortOrder: 16 },
  { id: 17, name: 'Loop', isSystem: true, sortOrder: 17 },
  { id: 18, name: 'One Shot', isSystem: true, sortOrder: 18 },
  { id: 19, name: 'Uncategorized', isSystem: true, sortOrder: 99 },
];
