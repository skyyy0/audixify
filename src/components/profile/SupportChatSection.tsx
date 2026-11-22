import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Inbox,
  LogIn,
  MessageSquareText,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePlayer } from '../../context/PlayerContext';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  PROFILE_CONSTRAINTS,
  type SupportCategory,
  type SupportMessage,
  type SupportThread,
} from '../../types/account';
import { compressImageFile } from '../../utils/imageCompress';
import { DeveloperBadge } from '../DeveloperBadge';

const CATEGORY_OPTIONS: Array<{ id: SupportCategory; label: string }> = [
  { id: 'bug', label: 'Bug Report' },
  { id: 'stream', label: 'Audio / MV Issue' },
  { id: 'feature', label: 'Feature Request' },
  { id: 'general', label: 'General' },
];

interface SupportChatSectionProps {
  fullScreen?: boolean;
}

function formatFriendlySendError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('permission-denied') || raw.includes('Missing or insufficient permissions')) {
    return 'Permission check blocked this request. Ensure you are signed in with a verified Google account and try refreshing once.';
  }
  if (raw.includes('unavailable') || raw.includes('offline')) {
    return 'Network unavailable. Please check your internet connection and try again.';
  }
  return 'Failed to send message. Please try again.';
}

export function SupportChatSection({ fullScreen = false }: SupportChatSectionProps) {
  const { user, profile, isDeveloper, preferences, signInWithGoogle, signingIn } = useAuth();
  const { currentTrack, showToast } = usePlayer();

  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [category, setCategory] = useState<SupportCategory>('bug');
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [includeDeviceSnapshot, setIncludeDeviceSnapshot] = useState(true);
  const [sending, setSending] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeThreadId = isDeveloper ? selectedThreadId : user?.uid || null;
  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  // Subscribe to threads when authenticated
  useEffect(() => {
    if (!user) {
      setThreads([]);
      setMessages([]);
      return;
    }

    if (isDeveloper) {
      const path = 'supportThreads';
      const q = query(collection(db, path), orderBy('updatedAt', 'desc'), limit(40));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: SupportThread[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SupportThread, 'id'>),
          }));
          setThreads(list);
          setSelectedThreadId((prev) => prev || list[0]?.id || null);
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, path);
          } catch {
            setErrorMsg('Unable to sync support inbox right now.');
          }
        },
      );
      return () => unsub();
    }

    const threadDocPath = `supportThreads/${user.uid}`;
    const docRef = doc(db, 'supportThreads', user.uid);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const item: SupportThread = {
            id: snap.id,
            ...(snap.data() as Omit<SupportThread, 'id'>),
          };
          setThreads([item]);
          if (item.category) setCategory(item.category);
        } else {
          setThreads([]);
        }
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, threadDocPath);
        } catch {
          setErrorMsg('Unable to load your support conversation.');
        }
      },
    );

    return () => unsub();
  }, [user, isDeveloper]);

  // Subscribe to messages for the active thread
  useEffect(() => {
    if (!user || !activeThreadId || !activeThread) {
      setMessages([]);
      return;
    }

    const msgPath = `supportThreads/${activeThreadId}/messages`;
    const q = query(collection(db, msgPath), orderBy('createdAt', 'asc'), limit(60));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: SupportMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SupportMessage, 'id'>),
        }));
        setMessages(items);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, msgPath);
        } catch {
          setErrorMsg('Unable to load support messages.');
        }
      },
    );

    return () => unsub();
  }, [user, activeThreadId, Boolean(activeThread)]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    try {
      const compressed = await compressImageFile(file, {
        maxDim: 960,
        maxDataUrlChars: 380000,
      });
      setImageDataUrl(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to attach image.');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeThreadId) return;
    const trimmed = text.trim().slice(0, PROFILE_CONSTRAINTS.supportTextMax);
    if (!trimmed && !imageDataUrl) return;

    setSending(true);
    setErrorMsg(null);
    const threadDocPath = `supportThreads/${activeThreadId}`;
    const threadRef = doc(db, 'supportThreads', activeThreadId);
    const preview = (trimmed || 'Photo attachment').slice(0, 180);

    try {
      const existingSnap = await getDoc(threadRef);
      if (existingSnap.exists() && existingSnap.data()?.status === 'resolved' && !isDeveloper) {
        setErrorMsg('This thread is marked resolved by the developer.');
        setSending(false);
        return;
      }

      if (!existingSnap.exists() && isDeveloper) {
        setErrorMsg('Select a user support thread first.');
        setSending(false);
        return;
      }

      const senderName = (
        profile?.displayName ||
        user.displayName ||
        user.email?.split('@')[0] ||
        'Listener'
      ).slice(0, 60);
      const senderUsername = (profile?.username || '').slice(0, 24);
      const rawAvatar = profile?.avatarDataUrl || user.photoURL || '';
      const senderAvatar = rawAvatar.slice(0, 120000);

      const batch = writeBatch(db);

      if (!existingSnap.exists()) {
        batch.set(threadRef, {
          ownerUid: user.uid,
          senderName,
          senderUsername,
          senderAvatar,
          category,
          status: 'open',
          lastMessagePreview: preview,
          unreadByAdmin: true,
          unreadByUser: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(threadRef, {
          ...(isDeveloper
            ? {}
            : {
                senderName,
                senderUsername,
                senderAvatar,
                category,
              }),
          lastMessagePreview: preview,
          unreadByAdmin: !isDeveloper,
          unreadByUser: isDeveloper,
          updatedAt: serverTimestamp(),
        });
      }

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const msgRef = doc(db, 'supportThreads', activeThreadId, 'messages', messageId);
      const deviceInfo =
        includeDeviceSnapshot && !isDeveloper
          ? `Viewport ${window.innerWidth}x${window.innerHeight} · Perf ${preferences.perfMode}${
              currentTrack ? ` · Track: ${currentTrack.title.slice(0, 48)}` : ''
            }`.slice(0, PROFILE_CONSTRAINTS.supportDeviceMax)
          : '';

      batch.set(msgRef, {
        threadOwnerUid: activeThreadId,
        senderUid: user.uid,
        senderName: isDeveloper ? 'sky' : senderName,
        senderUsername: isDeveloper ? 'sekaynotdev' : senderUsername,
        senderAvatar,
        senderRole: isDeveloper ? 'developer' : 'user',
        text: trimmed,
        ...(imageDataUrl ? { imageDataUrl } : {}),
        ...(deviceInfo ? { deviceInfo } : {}),
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      setText('');
      setImageDataUrl(null);
      showToast(isDeveloper ? 'Reply sent' : 'Sent to Audixify support');
    } catch (err) {
      setErrorMsg(formatFriendlySendError(err));
      try {
        handleFirestoreError(err, OperationType.WRITE, threadDocPath);
      } catch {
        // Error surfaced cleanly via errorMsg banner
      }
    } finally {
      setSending(false);
    }
  };

  const handleToggleResolve = async () => {
    if (!isDeveloper || !activeThread) return;
    const nextStatus = activeThread.status === 'resolved' ? 'open' : 'resolved';
    try {
      await updateDoc(doc(db, 'supportThreads', activeThread.id), {
        status: nextStatus,
        unreadByAdmin: false,
        updatedAt: serverTimestamp(),
      });
      showToast(`Thread marked ${nextStatus}`);
    } catch (err) {
      setErrorMsg(formatFriendlySendError(err));
      try {
        handleFirestoreError(err, OperationType.UPDATE, `supportThreads/${activeThread.id}`);
      } catch {}
    }
  };

  if (!user) {
    return (
      <div className="rounded-[28px] ios-glass p-8 sm:p-10 text-center space-y-5 max-w-xl mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-[#FF4D2E]/15 text-[#FF4D2E] flex items-center justify-center mx-auto">
          <MessageSquareText className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-950 dark:text-white">
            Chat with Developer Support
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            Sign in with Google to submit bug reports, upload screenshot evidence, and receive
            real-time replies directly from <strong>sky</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#FF4D2E] text-white text-xs sm:text-sm font-semibold hover:bg-[#E63E21] active:scale-95 transition-all shadow-md disabled:opacity-60"
          >
            <LogIn className="w-4 h-4" />
            <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>
          <a
            href="https://t.me/sekaynotdev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-full ios-glass-pill text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200"
          >
            <span>Telegram @sekaynotdev</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  const panelHeightClass = fullScreen
    ? 'min-h-[68vh] h-[calc(100vh-9.5rem)]'
    : 'min-h-[420px] max-h-[600px]';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Developer Support Inbox List */}
        {isDeveloper && (
          <div
            className={`lg:col-span-4 rounded-[26px] ios-glass p-3.5 space-y-2.5 overflow-y-auto ${
              fullScreen ? 'max-h-[34vh] lg:h-[calc(100vh-9.5rem)] lg:max-h-none' : 'max-h-[520px]'
            }`}
          >
            <div className="flex items-center justify-between px-1.5 pt-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <Inbox className="w-4 h-4 text-[#FF4D2E]" />
                <span>Support Inbox ({threads.length})</span>
              </span>
              <DeveloperBadge />
            </div>

            {threads.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-6 text-center">
                No user support threads yet.
              </p>
            ) : (
              threads.map((t) => {
                const selected = t.id === activeThreadId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedThreadId(t.id)}
                    className={`w-full text-left p-3 rounded-2xl transition-colors flex items-start gap-2.5 ${
                      selected
                        ? 'bg-white/85 dark:bg-white/[0.12] shadow-xs'
                        : 'hover:bg-white/50 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold">
                      {t.senderAvatar ? (
                        <img
                          src={t.senderAvatar}
                          alt={t.senderName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        t.senderName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {t.senderName}
                        </span>
                        {t.unreadByAdmin && (
                          <span className="w-2 h-2 rounded-full bg-[#FF4D2E] shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {t.lastMessagePreview || 'Open conversation'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded-full ios-glass-pill uppercase">
                          {t.category}
                        </span>
                        <span
                          className={
                            t.status === 'resolved' ? 'text-emerald-500' : 'text-[#FF4D2E]'
                          }
                        >
                          {t.status}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Active Conversation Panel */}
        <div
          className={`${
            isDeveloper ? 'lg:col-span-8' : 'lg:col-span-12'
          } rounded-[28px] ios-glass p-4 sm:p-6 flex flex-col ${panelHeightClass}`}
        >
          {/* Conversation Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base sm:text-lg font-bold text-zinc-950 dark:text-white">
                  {isDeveloper
                    ? activeThread
                      ? `${activeThread.senderName} (@${activeThread.senderUsername || 'user'})`
                      : 'Select a ticket'
                    : 'Direct Support · sky'}
                </h3>
                {!isDeveloper && <DeveloperBadge />}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Report bugs, broken streams, or send photo screenshots directly.
              </p>
            </div>

            {isDeveloper && activeThread ? (
              <button
                type="button"
                onClick={handleToggleResolve}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ios-glass-pill text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-white/80 dark:hover:bg-white/[0.12]"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  {activeThread.status === 'resolved' ? 'Reopen Thread' : 'Mark Resolved'}
                </span>
              </button>
            ) : !isDeveloper ? (
              <div className="flex items-center gap-1 flex-wrap">
                {CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCategory(opt.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      category === opt.id
                        ? 'bg-[#FF4D2E] text-white'
                        : 'ios-glass-pill text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Messages Scroll Region */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-10 space-y-2 text-zinc-500 dark:text-zinc-400">
                <MessageSquareText className="w-8 h-8 opacity-60" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {isDeveloper
                    ? 'Select a user conversation or wait for incoming reports.'
                    : 'No messages yet — describe your bug or attach a screenshot below.'}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.senderUid === user.uid;
                const fromDev = msg.senderRole === 'developer';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {msg.senderName}
                      </span>
                      {fromDev && <DeveloperBadge />}
                      {msg.senderUsername && <span>@{msg.senderUsername}</span>}
                    </div>
                    <div
                      className={`max-w-[85%] sm:max-w-[72%] rounded-[20px] px-3.5 py-2.5 text-xs sm:text-sm space-y-2 ${
                        isOwn
                          ? 'bg-[#FF4D2E] text-white rounded-br-md'
                          : 'ios-glass-card text-zinc-900 dark:text-zinc-100 rounded-bl-md'
                      }`}
                    >
                      {msg.imageDataUrl && (
                        <button
                          type="button"
                          onClick={() => setLightboxImage(msg.imageDataUrl || null)}
                          className="block rounded-xl overflow-hidden border border-white/20 max-w-[260px]"
                          aria-label="Inspect attached screenshot"
                        >
                          <img
                            src={msg.imageDataUrl}
                            alt="Bug evidence attachment"
                            className="w-full max-h-56 object-cover"
                          />
                        </button>
                      )}
                      {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                      {msg.deviceInfo && (
                        <div
                          className={`text-[10px] font-mono pt-1 border-t ${
                            isOwn
                              ? 'border-white/20 text-white/80'
                              : 'border-black/10 dark:border-white/10 text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          {msg.deviceInfo}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {errorMsg && (
            <div className="mb-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeThread?.status === 'resolved' && !isDeveloper ? (
            <div className="px-3.5 py-2.5 rounded-2xl ios-glass-pill text-xs text-zinc-600 dark:text-zinc-300 text-center">
              Marked as resolved by developer sky. Need urgent follow-up? Reach{' '}
              <a
                href="https://t.me/sekaynotdev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#FF4D2E] font-semibold hover:underline"
              >
                @sekaynotdev
              </a>
              .
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
              {imageDataUrl && (
                <div className="relative inline-block">
                  <img
                    src={imageDataUrl}
                    alt="Bug report preview"
                    className="h-20 rounded-xl object-cover border border-black/10 dark:border-white/15"
                  />
                  <button
                    type="button"
                    onClick={() => setImageDataUrl(null)}
                    aria-label="Remove attached photo"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-950 text-white flex items-center justify-center shadow-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {!isDeveloper && (
                <label className="inline-flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeDeviceSnapshot}
                    onChange={(e) => setIncludeDeviceSnapshot(e.target.checked)}
                    className="accent-[#FF4D2E] rounded"
                  />
                  <span>Include screen size, performance tier, and active track info</span>
                </label>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImagePick}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach photo evidence"
                  title="Attach screenshot or photo"
                  className="w-10 h-10 rounded-full ios-glass-pill flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-white/80 dark:hover:bg-white/[0.12] active:scale-90 transition-all shrink-0"
                >
                  <ImagePlus className="w-4 h-4 text-[#FF4D2E]" />
                </button>

                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={PROFILE_CONSTRAINTS.supportTextMax}
                  disabled={isDeveloper && !activeThread}
                  placeholder={
                    isDeveloper
                      ? activeThread
                        ? 'Reply as developer sky...'
                        : 'Select a thread first...'
                      : 'Describe a bug, feature idea, or question...'
                  }
                  className="flex-1 h-10 px-4 rounded-full text-xs sm:text-sm bg-black/[0.045] dark:bg-white/[0.065] border border-black/[0.05] dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-[#FF4D2E]"
                />

                <button
                  type="submit"
                  disabled={sending || (!text.trim() && !imageDataUrl) || (isDeveloper && !activeThread)}
                  aria-label="Send message"
                  className="h-10 px-4 rounded-full bg-[#FF4D2E] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#E63E21] active:scale-95 transition-all disabled:opacity-45 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox for Photo Evidence */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            aria-label="Close image preview"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImage}
            alt="Full bug screenshot"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[88vh] rounded-2xl shadow-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
