import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { Send, ThumbsUp, Reply, SmilePlus, MoreVertical, Smile, Image as ImageIcon, AtSign, X, Trash2, Copy, Ban } from 'lucide-react';
import Modal from '../common/Modal';
import StoredImage from '../common/StoredImage';
import { Avatar, panelClass } from './shared';
import { useGroups } from '../../context/GroupContext';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../context/ApiContext';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const EMOJIS = ['😀', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😮', '😢', '😭', '😡', '🥳', '😅', '😬', '🤯', '😴', '🤗', '👍', '👎', '👏', '🙌', '🙏', '💪', '👌', '✌️', '🔥', '❤️', '🎉', '✅', '💯', '⭐', '🚀', '👀', '🤝', '☕', '🙈', '😇', '🥹', '😤'];

const GROUP_GAP = 5 * 60 * 1000; // same sender within 5 min → one cluster
const TIME_GAP = 30 * 60 * 1000; // pause longer than 30 min → centered timestamp
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}[\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]*)+$/u;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function separatorLabel(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

/** Message text with @Member mentions highlighted. */
function MentionText({ text, names, mine }) {
  if (names.length === 0) return <>{text}</>;
  const re = new RegExp(`(@(?:${names.map(escapeRe).join('|')}))`, 'gi');
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={`font-semibold rounded px-1 ${mine ? 'bg-white/20' : 'text-brand-700 dark:text-brand-300 bg-brand-500/15'}`}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

const iconBtn = 'p-2 rounded-full text-brand-700 dark:text-brand-300 hover:bg-brand-500/10 transition-colors';

/**
 * Messenger-style team chat: your messages on the right, everyone else's
 * on the left with their avatar, centered time stamps, quoted replies,
 * emoji reactions, and a bottom composer with photo/GIF, emoji and @mention.
 * Photos and GIFs are the only attachments — there is no general file upload.
 */
export default function ChatTab({ group, members, isAdmin }) {
  const { messages, sendMessage, reactToMessage, deleteMessage, loadEarlierMessages } = useGroups();
  const { accounts, currentUser } = useAuth();
  const { api } = useApi();
  const [hasEarlier, setHasEarlier] = useState(true);

  // The half-typed message, the message being replied to and an open photo survive a refresh (kept per team).
  const [draft, setDraft] = usePersistedState(`team.${group.id}.chat.draft`, '');
  const [image, setImage] = useState(null);
  const [replyId, setReplyId] = usePersistedState(`team.${group.id}.chat.replyId`, null);
  const [activeId, setActiveId] = useState(null);
  const [reactFor, setReactFor] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [lightbox, setLightbox] = usePersistedState(`team.${group.id}.chat.lightbox`, null);
  const [attachError, setAttachError] = useState('');
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const msgRefs = useRef({});

  const names = members.map((m) => m.name);
  const byId = useMemo(() => Object.fromEntries(messages.map((m) => [m.id, m])), [messages]);
  const list = useMemo(
    () => messages.filter((m) => m.groupId === group.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages, group.id]
  );
  const nameOf = (id) => (id === currentUser.id ? 'You' : accounts.find((a) => a.id === id)?.name || 'Former member');
  const fullName = (id) => accounts.find((a) => a.id === id)?.name || 'Former member';
  const snippet = (m) => (m ? (m.deleted ? 'Message deleted' : m.text || (m.image ? 'Photo' : '')) : '');
  const replyMsg = replyId ? byId[replyId] : null;

  // Keep the newest message in view (inside the chat box only — never scrolls the page). New messages arrive on
  // their own now, so don't yank someone who scrolled up to read earlier ones: follow only when they were already
  // at the bottom, or when the new message is their own.
  const stickToBottom = useRef(true);
  const onChatScroll = (e) => {
    const el = e.currentTarget;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom.current || list[list.length - 1]?.authorId === currentUser.id) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the number of messages changes
  }, [list.length]);

  const closePopovers = () => { setReactFor(null); setMenuFor(null); };

  /** Ids of the teammates tagged with @Name; the server sends each of them a notification. */
  const mentionedIds = (text) =>
    members.filter((m) => m.id !== currentUser.id && text.toLowerCase().includes(`@${m.name.toLowerCase()}`)).map((m) => m.id);

  const resetComposer = () => {
    setDraft('');
    setImage(null);
    setReplyId(null);
    setEmojiOpen(false);
    setMentionOpen(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const send = async () => {
    if (!draft.trim() && !image) return;
    // A photo is uploaded first; the message then refers to it by file id.
    const stored = image ? await api.files.uploadFile(image.file) : null;
    if (image) URL.revokeObjectURL(image.url);
    const payload = { text: draft, image: stored ? { fileId: stored.id } : null, replyTo: replyId, mentionIds: mentionedIds(draft) };
    resetComposer();
    await sendMessage(group.id, payload);
  };

  const sendThumbsUp = () => {
    const payload = { text: '👍', replyTo: replyId };
    resetComposer();
    sendMessage(group.id, payload);
  };

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAttachError('Only photos and GIFs can be sent in chat.');
      return;
    }
    setAttachError('');
    setImage({ url: URL.createObjectURL(file), name: file.name, file });
  };

  const onType = (e) => {
    setDraft(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const startReply = (id) => {
    setReplyId(id);
    closePopovers();
    setActiveId(null);
    inputRef.current?.focus();
  };

  const jumpTo = (id) => msgRefs.current[id]?.scrollIntoView({ block: 'center', behavior: 'smooth' });

  const hasContent = draft.trim() !== '' || Boolean(image);

  return (
    <div className="space-y-3">
      <div className={`${panelClass} flex flex-col h-[68vh] min-h-[460px] overflow-hidden`}>
        <div
          ref={scrollRef}
          onScroll={onChatScroll}
          role="log"
          aria-live="polite"
          aria-label={`Messages in ${group.name}`}
          onClick={() => { closePopovers(); setActiveId(null); }}
          className="flex-1 overflow-y-auto px-3 sm:px-5 py-4"
        >
          {hasEarlier && list.length >= 100 && (
            <div className="flex justify-center pb-3">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const loaded = await loadEarlierMessages(group.id);
                  if (loaded === 0) setHasEarlier(false);
                }}
                className="text-fluid-xs font-medium text-brand-700 dark:text-brand-300 bg-brand-500/10 hover:bg-brand-500/15 rounded-full px-3.5 py-1.5 transition-colors"
              >
                Load earlier messages
              </button>
            </div>
          )}
          {list.length === 0 && (
            <p className="text-fluid-sm text-ink-500 text-center py-16">No messages yet. Say hi 👋</p>
          )}

          {list.map((m, i) => {
            const prev = list[i - 1];
            const next = list[i + 1];
            const mine = m.authorId === currentUser.id;
            const gapPrev = prev ? new Date(m.createdAt) - new Date(prev.createdAt) : Infinity;
            const gapNext = next ? new Date(next.createdAt) - new Date(m.createdAt) : Infinity;
            const showTime = gapPrev > TIME_GAP;
            const first = !prev || showTime || prev.authorId !== m.authorId || gapPrev > GROUP_GAP || Boolean(m.replyTo);
            const last = !next || next.authorId !== m.authorId || gapNext > GROUP_GAP || Boolean(next.replyTo);
            const original = m.replyTo ? byId[m.replyTo] : null;
            const emojiOnly = !m.deleted && !m.image && m.text.length <= 12 && EMOJI_ONLY.test(m.text);
            const reactionEntries = Object.entries(m.reactions || {});
            const distinct = [...new Set(reactionEntries.map(([, e]) => e))];
            const canDelete = (mine || isAdmin) && !m.deleted;
            const shown = activeId === m.id;

            const radius = mine
              ? `rounded-2xl ${first ? '' : 'rounded-tr-md'} ${last ? '' : 'rounded-br-md'}`
              : `rounded-2xl ${first ? '' : 'rounded-tl-md'} ${last ? '' : 'rounded-bl-md'}`;

            return (
              <Fragment key={m.id}>
                {showTime && <p className="text-center text-fluid-xs text-ink-500 pt-4 pb-1">{separatorLabel(m.createdAt)}</p>}
                <div
                  ref={(el) => { msgRefs.current[m.id] = el; }}
                  className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-3' : 'mt-0.5'} ${reactionEntries.length ? 'mb-3' : ''}`}
                >
                  {!mine && <div className="w-7 shrink-0">{last && <Avatar id={m.authorId} name={fullName(m.authorId)} size="sm" />}</div>}

                  <div className={`flex flex-col min-w-0 max-w-[80%] sm:max-w-[65%] ${mine ? 'items-end' : 'items-start'}`}>
                    {first && !mine && <span className="text-fluid-xs text-ink-500 ml-3 mb-0.5">{fullName(m.authorId)}</span>}

                    {m.replyTo && (
                      <div className={`flex flex-col mb-0.5 ${mine ? 'items-end' : 'items-start'} max-w-full`}>
                        <span className="flex items-center gap-1 text-fluid-xs text-ink-500 px-1">
                          <Reply size={12} />
                          {nameOf(m.authorId)} replied to {m.authorId === original?.authorId ? (mine ? 'yourself' : 'themselves') : original ? nameOf(original.authorId) : 'a message'}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (original) jumpTo(original.id); }}
                          className="max-w-full rounded-2xl bg-ink-500/10 dark:bg-white/10 px-3 py-1.5 text-fluid-xs text-ink-500 text-left line-clamp-2 hover:bg-ink-500/15 transition-colors"
                        >
                          {original ? snippet(original) : 'Original message was removed'}
                        </button>
                      </div>
                    )}

                    {reactFor === m.id && (
                      <div className="flex items-center gap-1 rounded-full bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-elevated px-2 py-1 mb-1" onClick={(e) => e.stopPropagation()}>
                        {REACTIONS.map((e) => (
                          <button
                            key={e}
                            onClick={() => { reactToMessage(m.id, e); setReactFor(null); }}
                            aria-label={`React ${e}`}
                            className={`text-lg leading-none p-1 rounded-full hover:scale-125 transition-transform ${m.reactions?.[currentUser.id] === e ? 'bg-brand-500/20' : ''}`}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}

                    {m.deleted ? (
                      <div className={`inline-flex items-center gap-1.5 rounded-2xl border border-dashed border-ink-500/30 dark:border-white/20 px-3.5 py-2 text-fluid-xs italic text-ink-500 select-none`}>
                        <Ban size={13} aria-hidden="true" /> Message deleted
                      </div>
                    ) : (
                      <div className={`relative flex items-center gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
                        <div
                          onClick={(e) => { e.stopPropagation(); setActiveId(shown ? null : m.id); setMenuFor(null); }}
                          title={new Date(m.createdAt).toLocaleString()}
                          className={
                            emojiOnly
                              ? 'text-4xl leading-tight cursor-pointer'
                              : `${radius} ${mine ? 'bg-brand-700 text-white' : 'bg-ink-500/10 dark:bg-white/10 text-ink-900 dark:text-white'} ${m.image ? 'p-1' : 'px-3.5 py-2'} cursor-pointer`
                          }
                        >
                          {m.image && (
                            <StoredImage
                              url={m.image.url}
                              placeholderClassName="w-40 h-28"
                              alt={m.image.name || 'Shared photo'}
                              onClick={(e) => { e.stopPropagation(); setLightbox(m.image); }}
                              className="max-w-[240px] max-h-[260px] rounded-xl object-cover"
                            />
                          )}
                          {m.text && !emojiOnly && (
                            <p className={`text-fluid-sm whitespace-pre-wrap break-words ${m.image ? 'px-2.5 py-1.5' : ''}`}>
                              <MentionText text={m.text} names={names} mine={mine} />
                            </p>
                          )}
                          {emojiOnly && m.text}

                          {distinct.length > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setReactFor(m.id); }}
                              title={reactionEntries.map(([id, e]) => `${fullName(id)}: ${e}`).join('\n')}
                              aria-label="Reactions"
                              className={`absolute -bottom-3 ${mine ? 'right-2' : 'left-2'} flex items-center gap-0.5 rounded-full bg-surface-card dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/15 shadow-soft px-1.5 py-0.5 text-xs text-ink-900 dark:text-white`}
                            >
                              {distinct.join('')}{reactionEntries.length > 1 && <span className="text-[10px] text-ink-500 ml-0.5">{reactionEntries.length}</span>}
                            </button>
                          )}
                        </div>

                        <div className={`flex items-center transition-opacity ${shown ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => { setReactFor(reactFor === m.id ? null : m.id); setMenuFor(null); }} aria-label="Add reaction" className="p-1.5 rounded-full text-ink-500 hover:bg-ink-500/10 transition-colors"><SmilePlus size={16} /></button>
                          <button onClick={() => startReply(m.id)} aria-label="Reply" className="p-1.5 rounded-full text-ink-500 hover:bg-ink-500/10 transition-colors"><Reply size={16} /></button>
                          <span className="relative">
                            <button onClick={() => { setMenuFor(menuFor === m.id ? null : m.id); setReactFor(null); }} aria-label="More" className="p-1.5 rounded-full text-ink-500 hover:bg-ink-500/10 transition-colors"><MoreVertical size={16} /></button>
                            {menuFor === m.id && (
                              <div role="menu" className={`absolute z-10 bottom-full mb-1 ${mine ? 'right-0' : 'left-0'} w-40 rounded-xl bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-elevated py-1`}>
                                {m.text && (
                                  <button role="menuitem" onClick={() => { navigator.clipboard?.writeText(m.text); closePopovers(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-fluid-xs text-ink-700 dark:text-ink-300 hover:bg-ink-500/8">
                                    <Copy size={13} /> Copy text
                                  </button>
                                )}
                                {canDelete && (
                                  <button role="menuitem" onClick={() => { deleteMessage(m.id); closePopovers(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-fluid-xs text-coral-600 hover:bg-coral-500/10">
                                    <Trash2 size={13} /> Delete message
                                  </button>
                                )}
                              </div>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>

        {/* Composer */}
        <div className="border-t border-ink-500/10 dark:border-white/10 px-3 py-3 space-y-2">
          {replyMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-ink-500/8 dark:bg-white/8 px-3 py-2">
              <Reply size={14} className="text-brand-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-fluid-xs font-medium text-ink-900 dark:text-white">Replying to {nameOf(replyMsg.authorId) === 'You' ? 'yourself' : nameOf(replyMsg.authorId)}</p>
                <p className="text-fluid-xs text-ink-500 truncate">{snippet(replyMsg)}</p>
              </div>
              <button onClick={() => setReplyId(null)} aria-label="Cancel reply" className="p-1 text-ink-500 hover:text-ink-900 dark:hover:text-white"><X size={15} /></button>
            </div>
          )}

          {attachError && <p role="alert" className="text-fluid-xs text-coral-600 px-1">{attachError}</p>}

          {image && (
            <div className="relative inline-block">
              <img src={image.url} alt="Selected to send" className="h-24 rounded-xl object-cover" />
              <button onClick={() => setImage(null)} aria-label="Remove photo" className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-ink-900 text-white flex items-center justify-center"><X size={13} /></button>
            </div>
          )}

          {mentionOpen && (
            <div className="flex flex-wrap gap-1.5">
              {members.filter((m) => m.id !== currentUser.id).map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setDraft((d) => `${d}${d && !d.endsWith(' ') ? ' ' : ''}@${m.name} `); setMentionOpen(false); inputRef.current?.focus(); }}
                  className="text-fluid-xs rounded-full border border-ink-500/15 dark:border-white/10 px-2.5 py-1 text-ink-700 dark:text-ink-300 hover:bg-brand-500/10 transition-colors"
                >
                  @{m.name}
                </button>
              ))}
            </div>
          )}

          {emojiOpen && (
            <div className="grid grid-cols-10 gap-0.5 rounded-xl bg-ink-500/5 dark:bg-white/5 p-2 max-w-md">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => { setDraft((d) => d + e); inputRef.current?.focus(); }} aria-label={`Insert ${e}`} className="text-xl leading-none p-1 rounded-md hover:bg-ink-500/10 hover:scale-110 transition-transform">{e}</button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <button onClick={() => { setMentionOpen((v) => !v); setEmojiOpen(false); }} aria-label="Mention someone" title="Mention" className={iconBtn}><AtSign size={20} /></button>
            <button onClick={() => fileRef.current?.click()} aria-label="Add a photo or GIF" title="Photo or GIF" className={iconBtn}><ImageIcon size={20} /></button>
            <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} className="hidden" aria-label="Choose a photo or GIF" />

            <div className="flex-1 min-w-0 flex items-end rounded-3xl bg-ink-500/10 dark:bg-white/10 pl-4 pr-1.5 py-1">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={onType}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder="Aa"
                aria-label="Message the team"
                className="flex-1 min-w-0 resize-none bg-transparent !border-0 !shadow-none !outline-none !h-auto !min-h-0 py-2 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500"
              />
              <button onClick={() => { setEmojiOpen((v) => !v); setMentionOpen(false); }} aria-label="Emoji" title="Emoji" className={`${iconBtn} mb-0.5`}><Smile size={20} /></button>
            </div>

            {hasContent ? (
              <button onClick={send} aria-label="Send message" className={`${iconBtn} mb-0.5`}><Send size={20} /></button>
            ) : (
              <button onClick={sendThumbsUp} aria-label="Send a like" title="Send a like" className={`${iconBtn} mb-0.5`}><ThumbsUp size={20} /></button>
            )}
          </div>
        </div>
      </div>

      <Modal open={Boolean(lightbox)} onClose={() => setLightbox(null)} title="Photo" size="lg">
        {lightbox && <StoredImage url={lightbox.url} alt={lightbox.name || 'Shared photo'} className="w-full max-h-[60vh] object-contain rounded-xl" placeholderClassName="w-full h-40" />}
      </Modal>
    </div>
  );
}
