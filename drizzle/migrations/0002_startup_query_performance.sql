-- Library/startup indexes. All statements are idempotent.

CREATE INDEX IF NOT EXISTS idx_samples_file_name_id
  ON samples(file_name, id);
CREATE INDEX IF NOT EXISTS idx_samples_created_id
  ON samples(created_at, id);
CREATE INDEX IF NOT EXISTS idx_samples_modified_id
  ON samples(modified_at, id);
CREATE INDEX IF NOT EXISTS idx_samples_duration_id
  ON samples(duration, id);
CREATE INDEX IF NOT EXISTS idx_samples_bpm_id
  ON samples(bpm, id);
CREATE INDEX IF NOT EXISTS idx_samples_key_id
  ON samples("key", id);
CREATE INDEX IF NOT EXISTS idx_samples_play_count_id
  ON samples(play_count, id);
CREATE INDEX IF NOT EXISTS idx_samples_file_size_id
  ON samples(file_size, id);

-- Composite indexes match the default file-name ordering used after filters.
CREATE INDEX IF NOT EXISTS idx_samples_category_name
  ON samples(category_id, file_name, id);
CREATE INDEX IF NOT EXISTS idx_samples_favorite_name
  ON samples(is_favorite, file_name, id);
CREATE INDEX IF NOT EXISTS idx_samples_file_type_name
  ON samples(file_type, file_name, id);
CREATE INDEX IF NOT EXISTS idx_samples_last_played_id
  ON samples(last_played_at, id);
CREATE INDEX IF NOT EXISTS idx_samples_file_hash
  ON samples(file_hash);

CREATE INDEX IF NOT EXISTS idx_sample_tags_tag_sample
  ON sample_tags(tag_id, sample_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_order
  ON playlist_items(playlist_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_sample
  ON playlist_items(sample_id);
CREATE INDEX IF NOT EXISTS idx_recent_samples_played
  ON recent_samples(played_at, id);
CREATE INDEX IF NOT EXISTS idx_recent_samples_sample
  ON recent_samples(sample_id);
CREATE INDEX IF NOT EXISTS idx_watched_folders_active_scan
  ON watched_folders(is_active, last_scan_at);
CREATE INDEX IF NOT EXISTS idx_categories_parent_sort
  ON categories(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_classification_rules_active_priority
  ON classification_rules(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_smart_folders_sort
  ON smart_folders(sort_order, id);
CREATE INDEX IF NOT EXISTS idx_usage_stats_play_count
  ON usage_stats(play_count, sample_id);
CREATE INDEX IF NOT EXISTS idx_usage_stats_last_played
  ON usage_stats(last_played_at, sample_id);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_status
  ON analysis_sessions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_queue_session_status
  ON analysis_queue(session_id, status, id);
CREATE INDEX IF NOT EXISTS idx_analysis_queue_status
  ON analysis_queue(status, id);
CREATE INDEX IF NOT EXISTS idx_analysis_queue_sample
  ON analysis_queue(sample_id);
CREATE INDEX IF NOT EXISTS idx_audio_segments_sample_time
  ON audio_segments(sample_id, start_time);

-- Raw-SQL users can query this view to guarantee that large waveform/vector
-- fields are not read or serialized for library lists.
DROP VIEW IF EXISTS sample_list_view;
CREATE VIEW sample_list_view AS
SELECT
  id,
  file_path,
  file_name,
  file_size,
  file_hash,
  file_type,
  created_at,
  modified_at,
  duration,
  sample_rate,
  bit_rate,
  channels,
  bpm,
  "key",
  category_id,
  is_corrupted,
  is_favorite,
  play_count,
  last_played_at,
  indexed_at,
  tags AS inferred_tags,
  rating,
  midi_track_count,
  midi_note_count,
  midi_instruments,
  midi_time_signature
FROM samples;
