import type {CeruCloudSong, CeruCloudSongQuality, CeruFavoriteEntityType, CeruMusicSource} from '@ceru/shared-contract';

import type {NormalizedSong, UnknownRecord} from './types.ts';

const asString = (value: unknown, fallback = '') => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
};

const asOptionalString = (value: unknown) => {
  const text = asString(value).trim();
  return text || undefined;
};

const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeQualities = (value: unknown): CeruCloudSongQuality[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const qualities: CeruCloudSongQuality[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as UnknownRecord;
    const type = asOptionalString(record.type);
    if (!type) continue;

    const size = asOptionalString(record.size);
    qualities.push(size ? {type, size} : {type});
  }

  return qualities;
};

const stableTrackKey = (song: UnknownRecord) => {
  const source = asOptionalString(song.source) || 'local';
  const id =
    asOptionalString(song.id) ||
    asOptionalString(song.songmid) ||
    asOptionalString(song.hash) ||
    asOptionalString(song.mid) ||
    asOptionalString(song.name) ||
    asOptionalString(song.title);

  return `${source}:${id || JSON.stringify(song)}`;
};

export const normalizeSong = (song: UnknownRecord): NormalizedSong => {
  const source = (asOptionalString(song.source) || 'local') as CeruMusicSource;
  const id =
    asOptionalString(song.id) || asOptionalString(song.songmid) || asOptionalString(song.hash) || stableTrackKey(song);

  return {
    id,
    source,
    title: asOptionalString(song.title) || asOptionalString(song.name) || '未知歌曲',
    artist: asOptionalString(song.artist) || asOptionalString(song.singer) || '未知歌手',
    album: asOptionalString(song.album) || asOptionalString(song.albumName),
    albumId: asOptionalString(song.albumId),
    durationText: asOptionalString(song.durationText) || asOptionalString(song.interval),
    artworkUrl: asOptionalString(song.artworkUrl) || asOptionalString(song.img),
    qualities: normalizeQualities(song.qualities || song.types),
    position: asNumber(song.position ?? song.pos),
    trackKey: stableTrackKey(song),
    raw: song,
  };
};

export const encodeSongForLegacyClient = (song: CeruCloudSong) => ({
  id: song.id,
  songmid: song.id,
  source: song.source,
  name: song.title,
  title: song.title,
  singer: song.artist,
  artist: song.artist,
  albumName: song.album || '',
  album: song.album || '',
  albumId: song.albumId || '',
  interval: song.durationText || '',
  durationText: song.durationText || '',
  img: song.artworkUrl || '',
  artworkUrl: song.artworkUrl || '',
  types: song.qualities || [],
  qualities: song.qualities || [],
  pos: song.position,
  position: song.position,
});

export const parseJsonArray = (value: unknown): UnknownRecord[] => {
  if (Array.isArray(value)) return value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object');
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object');
  } catch {
    return [];
  }
};

export const normalizeFavoriteEntityType = (value: unknown): CeruFavoriteEntityType => {
  const text = asOptionalString(value);
  if (text === 'song' || text === 'playlist' || text === 'album' || text === 'artist' || text === 'rank') return text;
  return 'playlist';
};

export const getText = asOptionalString;