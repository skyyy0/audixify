import type { RegionScope, Track } from './music';

export type PerfMode = 'auto' | 'lite' | 'full';
export type AudioQuality = 'auto' | 'high' | 'saver';
export type LyricsSize = 'compact' | 'standard' | 'large';
export type SupportCategory = 'bug' | 'stream' | 'feature' | 'general';
export type SupportStatus = 'open' | 'resolved';

export type BadgeId =
  | 'streak_3'
  | 'streak_7'
  | 'streak_30_crown'
  | 'streak_30_pioneer';

export interface BadgeDefinition {
  id: BadgeId;
  title: string;
  subtitle: string;
  requiredDays: number;
  tier: 'bronze' | 'special' | 'legend';
  accent: string;
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  {
    id: 'streak_3',
    title: '3-Day Rhythm',
    subtitle: 'Login 3 hari berturut-turut di Audixify',
    requiredDays: 3,
    tier: 'bronze',
    accent: '#F59E0B',
  },
  {
    id: 'streak_7',
    title: '7-Day Devotee',
    subtitle: 'Login 7 hari berturut-turut — Spesial Mingguan',
    requiredDays: 7,
    tier: 'special',
    accent: '#8B5CF6',
  },
  {
    id: 'streak_30_crown',
    title: '30-Day Crown',
    subtitle: 'Konsisten 30 hari penuh tanpa putus',
    requiredDays: 30,
    tier: 'legend',
    accent: '#10B981',
  },
  {
    id: 'streak_30_pioneer',
    title: 'Verified Legend',
    subtitle: 'Membuka centang hijau eksklusif di profilmu',
    requiredDays: 30,
    tier: 'legend',
    accent: '#FF4D2E',
  },
];

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
  streakCount: number;
  longestStreak: number;
  lastCheckInDate: string;
  badges: BadgeId[];
  greenBadgeUnlocked: boolean;
  greenBadgeEnabled: boolean;
}

export interface SharedPlaylistMember {
  uid: string;
  displayName: string;
  username: string;
  avatarDataUrl: string;
  isDeveloper: boolean;
  greenBadge: boolean;
}

export interface SharedPlaylist {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  ownerUid: string;
  ownerName: string;
  memberUids: string[];
  members: SharedPlaylistMember[];
  tracks: Track[];
  updatedByUid: string;
  updatedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
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
