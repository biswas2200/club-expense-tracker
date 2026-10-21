import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { BotMessageDTO, MemberDTO, SimChatDTO } from '@nocap/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { Dialog } from '../components/Dialog';
import { initials, ROLE_LABEL } from '../format';
import { SAMPLES, sampleFile, type Sample } from '../sim/sampleShots';
import { useResource } from '../useResource';

const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

/** WhatsApp formatting the bot uses: *bold*. Line breaks are kept by CSS. */
function chatText(text: string): ReactNode[] {
  return text
    .split(/(\*[^*\n]+\*)/g)
    .map((part, i) =>
      /^\*[^*\n]+\*$/.test(part) ? <strong key={i}>{part.slice(1, -1)}</strong> : part,
    );
}

/** The same text without the formatting marks, for one-line previews. */
const plainText = (text: string) => text.replace(/\*([^*\n]+)\*/g, '$1');

function subtitle(chat: SimChatDTO) {
  if (chat.kind === 'group') return 'Class group · NoCap only answers when someone tags @NoCap';
  if (chat.person?.role === 'admin') {
    return 'Private chat · admin mode: send a screenshot or a cash entry to record it';
  }
  return `Private chat · ${ROLE_LABEL[chat.person!.role]}: questions and payment checks`;
}

function suggestions(chat: SimChatDTO) {
  if (chat.kind === 'group') {
    return [
      '@NoCap who hasn’t paid for freshers?',
      '@NoCap how much is left for freshers?',
      '@NoCap my status',
    ];
  }
  if (chat.person?.role === 'admin') {
    return ['cash in 500 from Arjun Rao for freshers', 'how much was spent on freshers?', 'help'];
  }
  return ['my status', 'YES', 'NO'];
}

function GroupIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="sim-group-icon">
      <circle cx="7" cy="7" r="3" />
      <circle cx="14" cy="8" r="2.4" />
      <path d="M1.8 16.5c.6-3 2.6-4.6 5.2-4.6s4.6 1.6 5.2 4.6M12.2 12.3c2.6-.4 4.7.9 5.5 3.7" />
    </svg>
  );
}

function Avatar({ chat }: { chat: SimChatDTO }) {
  return (
    <span className={`avatar sim-avatar sim-avatar-${chat.kind}`} aria-hidden="true">
      {chat.kind === 'group' ? <GroupIcon /> : initials(chat.title)}
    </span>
  );
}

function AttachDialog({ onPick, onClose }: { onPick: (file: File) => void; onClose: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);

  async function pickSample(sample: Sample) {
    try {
      onPick(await sampleFile(sample));
    } catch (err) {
      setProblem((err as Error).message);
    }
  }

  return (
    <Dialog title="Attach a screenshot" onClose={onClose}>
      <div className="form">
        <p className="muted">
          Pick a sample UPI screenshot. Until the AI reader arrives in v0.5, the bot reads the
          payment stored inside each sample; any other image counts as unreadable.
        </p>
        {problem && (
          <p role="alert" className="alert">
            {problem}
          </p>
        )}
        <ul className="sim-samples">
          {SAMPLES.map((s) => (
            <li key={s.id}>
              <button type="button" className="sim-sample" onClick={() => pickSample(s)}>
                <span className="sim-sample-label">{s.label}</span>
                <span className="muted small">{s.note}</span>
              </button>
            </li>
          ))}
        </ul>
        <label className="field">
          <span className="field-label">Or upload your own image</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPick(file);
            }}
          />
        </label>
      </div>
    </Dialog>
  );
}

function Bubble({
  message,
  group,
  onImageLoad,
}: {
  message: BotMessageDTO;
  group: boolean;
  onImageLoad: () => void;
}) {
  const who = message.from === 'bot' ? 'NoCap' : (message.sender?.name ?? 'Unknown number');
  return (
    <li className={`bubble bubble-${message.from}`}>
      <p className={group ? 'bubble-who' : 'bubble-who sr-only'}>{who}</p>
      {message.imageUrl && (
        <a href={message.imageUrl} target="_blank" rel="noreferrer" className="bubble-image">
          <img src={message.imageUrl} alt="Screenshot" onLoad={onImageLoad} />
        </a>
      )}
      {message.text && <p className="bubble-text">{chatText(message.text)}</p>}
      <time className="bubble-time" dateTime={message.createdAt}>
        {clock.format(new Date(message.createdAt))}
      </time>
    </li>
  );
}

function ChatThread({
  chat,
  people,
  onSent,
}: {
  chat: SimChatDTO;
  people: MemberDTO[];
  onSent: () => void;
}) {
  const { member } = useAuth();
  const [messages, setMessages] = useState<BotMessageDTO[] | undefined>(undefined);
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [senderId, setSenderId] = useState(member?.id ?? '');
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  const group = chat.kind === 'group';

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  useEffect(() => {
    api
      .simThread(chat.id)
      .then(setMessages)
      .catch((err: Error) => setProblem(err.message));
  }, [chat.id]);

  // Keep the newest message in view, again once screenshots have loaded and grown the thread.
  const scrollToEnd = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  };
  useEffect(scrollToEnd, [messages]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !image) return;
    const form = new FormData();
    form.set('text', text);
    if (group) form.set('senderId', senderId);
    if (image) form.set('image', image);
    // Clear the box straight away, like a chat app, so the next message can be typed while
    // this one is on its way. It comes back only if sending fails.
    const [sentText, sentImage] = [text, image];
    setText('');
    setImage(null);
    setSending(true);
    try {
      setMessages(await api.simSend(chat.id, form));
      setProblem(null);
      onSent();
    } catch (err) {
      setText(sentText);
      setImage(sentImage);
      setProblem((err as Error).message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <section className="sim-thread" aria-label={`Chat: ${chat.title}`}>
      <header className="sim-thread-head">
        <Link to="/simulator" className="sim-back">
          <span aria-hidden="true">‹</span> Chats
        </Link>
        <Avatar chat={chat} />
        <div>
          <h2>{chat.title}</h2>
          <p className="muted small">{subtitle(chat)}</p>
        </div>
      </header>

      <ol className="sim-messages" aria-label="Messages" ref={listRef}>
        {messages?.length === 0 && (
          <li className="sim-note">
            {group
              ? 'No messages yet. Ask something and tag @NoCap.'
              : 'No messages yet. Say hi, or type help.'}
          </li>
        )}
        {messages?.map((m) => (
          <Bubble key={m.id} message={m} group={group} onImageLoad={scrollToEnd} />
        ))}
      </ol>

      <form className="sim-composer" onSubmit={submit}>
        {problem && (
          <p role="alert" className="alert">
            {problem}
          </p>
        )}
        {group && (
          <label className="sim-sender">
            <span>Send as</span>
            <select value={senderId} onChange={(e) => setSenderId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {image && preview && (
          <div className="sim-attachment">
            <img src={preview} alt="Screenshot to send" />
            <span className="small">{image.name}. Add the event name as the caption.</span>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={() => setImage(null)}
            >
              Remove attachment
            </button>
          </div>
        )}
        <div className="sim-compose-row">
          <button
            type="button"
            className="icon-button sim-attach"
            aria-label="Attach screenshot"
            onClick={() => setPicking(true)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M13.5 6.5l-6 6a1.8 1.8 0 0 0 2.5 2.5l6.2-6.2a3.3 3.3 0 0 0-4.7-4.7L5.3 10.3a4.8 4.8 0 0 0 6.8 6.8l4.4-4.4" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            aria-label="Message"
            placeholder={group ? 'Type @NoCap and a question' : 'Message'}
            value={text}
            maxLength={1000}
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn" disabled={sending}>
            Send
          </button>
        </div>
        <div className="sim-suggestions">
          <span className="muted small">Try:</span>
          {suggestions(chat).map((s) => (
            <button
              key={s}
              type="button"
              className="chip sim-chip"
              onClick={() => {
                setText(s);
                inputRef.current?.focus();
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      {picking && (
        <AttachDialog
          onClose={() => setPicking(false)}
          onPick={(file) => {
            setImage(file);
            setPicking(false);
            inputRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}

/**
 * Dev-only test bench for the bot: the class group and a private chat with each person, in a
 * WhatsApp-style thread. Messages go through the same bot engine WhatsApp will use in v0.6.
 */
export function SimulatorPage() {
  const [params] = useSearchParams();
  const chatId = params.get('chat');
  const [version, setVersion] = useState(0);
  const { data: chats, error } = useResource(`sim-chats-${version}`, api.simChats);
  const chat = chats?.find((c) => c.id === chatId);
  const people = useMemo(
    () =>
      (chats ?? [])
        .flatMap((c) => (c.person ? [c.person] : []))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [chats],
  );

  return (
    <>
      <div className="page-head page-head-stack">
        <h1>Chat simulator</h1>
        <p className="muted">
          Try the NoCap bot the way it will work on WhatsApp: ask questions in the class group, send
          screenshots as an admin, and answer the bot’s payment checks as a member. Nothing leaves
          this computer, but payments you save are real entries in this local database.
        </p>
      </div>
      {error && (
        <p role="alert" className="alert">
          Could not load the chats: {error}
        </p>
      )}
      <div className={chat ? 'sim sim-open' : 'sim'}>
        <nav className="sim-chats" aria-label="Chats">
          <ul>
            {chats?.map((c) => {
              const describedBy = `sim-chat-${c.id}`;
              return (
                <li key={c.id}>
                  <Link
                    to={`/simulator?chat=${encodeURIComponent(c.id)}`}
                    className="sim-chat"
                    aria-current={c.id === chatId ? 'page' : undefined}
                    aria-label={c.title}
                    aria-describedby={describedBy}
                  >
                    <Avatar chat={c} />
                    <span className="sim-chat-main">
                      <span className="sim-chat-title">{c.title}</span>
                      <span className="sim-chat-preview" id={describedBy}>
                        {c.awaitingReply && (
                          <span className="sim-waiting">Waiting for a reply</span>
                        )}
                        {c.lastMessage
                          ? `${c.lastMessage.from === 'bot' ? 'NoCap: ' : ''}${plainText(c.lastMessage.text ?? '')}`
                          : c.kind === 'group'
                            ? 'Everyone in the class'
                            : c.person && ROLE_LABEL[c.person.role]}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {chat ? (
          <ChatThread
            key={chat.id}
            chat={chat}
            people={people}
            onSent={() => setVersion((v) => v + 1)}
          />
        ) : (
          <div className="sim-pick">
            <p className="empty-title">Pick a chat</p>
            <p className="muted">
              Start with the class group, or open an admin’s private chat to record a payment.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
