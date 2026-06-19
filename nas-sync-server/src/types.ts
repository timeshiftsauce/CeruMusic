import type {CeruCloudSong, CeruFavoriteEntityType, CeruMusicSource} from '@ceru/shared-contract';

export type AuthUser = {
  id: string;
  username: string;
  email?: string | null;
  nickname?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionPayload = {
  accessToken: string;
  expiresAt: number;
  user: AuthUser;
};

export type RequestContext = {
  user: AuthUser;
  tokenHash: string;
};

export type PlaylistInput = {
  localId?: string;
  title?: string;
  name?: string;
  description?: string;
  describe?: string;
  coverUrl?: string;
  cover?: string;
  filePath?: string;
  semanticType?: string;
  source?: string;
  sourcePlaylistId?: string;
  songs?: UnknownRecord[];
  songlist?: UnknownRecord[] | string;
};

export type PlaylistPatchInput = PlaylistInput & {
  id?: string;
  listId?: string;
  playlistId?: string;
};

export type PlaylistSongMutationInput = {
  id?: string;
  listId?: string;
  playlistId?: string;
  songs?: UnknownRecord[];
  songlist?: UnknownRecord[] | string;
  songIds?: string[];
  songmids?: string[];
  trackKeys?: string[];
};

export type FavoriteInput = {
  entityType?: CeruFavoriteEntityType;
  entityId?: string;
  playlistId?: string;
  sourcePlaylistId?: string;
  source?: CeruMusicSource;
  title?: string;
  name?: string;
  description?: string;
  describe?: string;
  coverUrl?: string;
  cover?: string;
  filePath?: string;
  ownerName?: string;
  metadata?: UnknownRecord;
};

export type UnknownRecord = Record<string, unknown>;

export type SyncEvent = {
  revision: number;
  entityType: string;
  entityId: string;
  action: string;
  payload: unknown;
  deletedAt: string | null;
  createdAt: string;
};

export type NormalizedSong = CeruCloudSong & {
  trackKey: string;
  raw: UnknownRecord;
};