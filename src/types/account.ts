import type { RegionScope } from './music';

export type PerfMode = 'auto' | 'lite' | 'full';
export type AudioQuality = 'auto' | 'high' | 'saver';
export type LyricsSize = 'compact' | 'standard' | 'large';
export type SupportCategory = 'bug' | 'stream' | 'feature' | 'general';
export type SupportStatus = 'open' | 'resolved';

export interface AppPreferences {
  perfMode: PerfMode;
  audioQuality: AudioQuality;
  lyricsSize: LyricsSize;
  defaultRegion: RegionScope;
  autoplay: boolean;
}

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  bio: string;
  avatarDataUrl: string;
  isDeveloper: boolean;
  perfMode: PerfMode;
  audioQuality: AudioQuality;
  lyricsSize: LyricsSize;
  defaultRegion: RegionScope;
  autoplay: boolean;
  theme: 'dark' | 'light';
}

export interface SupportThread {
  id: string;
  ownerUid: string;
  senderName: string;
  senderUsername?: string;
  senderAvatar?: string;
  category: SupportCategory;
  status: SupportStatus;
  lastMessagePreview?: string;
  unreadByAdmin: boolean;
  unreadByUser: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SupportMessage {
  id: string;
  threadOwnerUid: string;
  senderUid: string;
  senderName: string;
  senderUsername?: string;
  senderAvatar?: string;
  senderRole: 'user' | 'developer';
  text: string;
  imageDataUrl?: string;
  deviceInfo?: string;
  createdAt?: unknown;
}

export const PROFILE_CONSTRAINTS = {
  usernameMin: 3,
  usernameMax: 24,
  usernameRegex: /^[a-z0-9_.]{3,24}$/,
  displayNameMax: 60,
  bioMax: 240,
  avatarMax: 120000,
  supportTextMax: 1500,
  supportImageMax: 420000,
  supportDeviceMax: 220,
} as const;
