
import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  Send,
  Mic,
  Volume2,
  VolumeX,
  Sparkles,
  Sun,
  Moon,
  Flower2,
  MessageCircle,
  Trash2,
  X
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const CHAT_KEY = 'bawra-amu-chat-v2';
const SESSION_KEY = 'bawra-amu-session-v1';

function getDaypart(date = new Date()) {
  const h = date.getHours();

  if (h >= 5 && h < 12) {
    return {
      label: 'Good morning',
      icon: Sun,
      line: 'May today bring you a little peace, a little joy, and a reason to smile.'
    };
  }

  if (h >= 12 && h < 17) {
    return {
      label: 'Good afternoon',
      icon: Sun,
      line: 'Pause for a moment, take a breath, and remember to care for yourself.'
    };
  }

  if (h >= 17 && h < 21) {
    return {
      label: 'Good evening',
      icon: Flower2,
      line: 'The day is slowing down. How has your day been, Amu?'
    };
  }

  return {
    label: 'Good night',
    icon: Moon,
    line: 'Let the day rest. You deserve a calm and peaceful night.'
  };
}

function load(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function joinSpeech(...parts) {
  return parts
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function App() {
  const [messages, setMessages] = useState(() =>
    load(CHAT_KEY, [
      {
        id: makeId(),
        role: 'assistant',
        content:
          'Hello, Amu. 🌹 I’m BAWRA. This is your little corner to talk, reflect, plan your dreams, or simply be yourself. What’s on your mind?'
      }
    ])
  );

  const [sessionId] = useState(() => {
    let id = localStorage.getItem(SESSION_KEY);

    if (!id) {
      id = makeId();
      localStorage.setItem(SESSION_KEY, id);
    }

    return id;
  });

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [daypart, setDaypart] = useState(() => getDaypart());
  const [error, setError] = useState('');
  const [interimText, setInterimText] = useState('');

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const sendLock = useRef(false);

  // Microphone references
  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef(null);
  const committedSpeechRef = useRef('');
  const currentSessionSpeechRef = useRef('');
  const typedPrefixRef = useRef('');

  // Keep chat history saved in this browser.
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-100)));
    } catch (err) {
      console.error('Could not save chat history:', err);
    }
  }, [messages]);

  // Update greeting according to the current time.
  useEffect(() => {
    const update = () => setDaypart(getDaypart());

    update();

    const onVisible = () => {
      if (!document.hidden) update();
    };

    document.addEventListener('visibilitychange', onVisible);

    const timer = setInterval(update, 60_000);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);

      shouldListenRef.current = false;
      clearTimeout(restartTimerRef.current);

      recognitionRef.current?.abort?.();
      recognitionRef.current = null;

      window.speechSynthesis?.cancel();
    };
  }, []);

  // Automatically scroll to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  function speak(text) {
    if (!voiceOn || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = 0.94;
    utterance.pitch = 1.08;
    utterance.volume = 0.9;

    const voices = window.speechSynthesis.getVoices();

    const preferred =
      voices.find(v => /^en-IN/i.test(v.lang)) ||
      voices.find(v => /^en/i.test(v.lang));

    if (preferred) {
      utterance.voice = preferred;
    }

    window.speechSynthesis.speak(utterance);
  }

  // Build the complete text from typed text and microphone results.
  function getCompleteSpeechText(sessionText = '', temporaryText = '') {
    return joinSpeech(
      typedPrefixRef.current,
      committedSpeechRef.current,
      sessionText,
      temporaryText
    );
  }

  function stopListening() {
    shouldListenRef.current = false;

    clearTimeout(restartTimerRef.current);

    // Preserve the final words already recognized.
    const completeText = getCompleteSpeechText(
      currentSessionSpeechRef.current
    );

    if (completeText) {
      setInput(completeText);
    }

    setInterimText('');
    setListening(false);

    const recognition = recognitionRef.current;
    recognitionRef.current = null;

    try {
      recognition?.stop?.();
    } catch {
      // The recognition service may already have stopped.
    }
  }

  function startListening() {
    if (shouldListenRef.current || listening || busy) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        'Voice input is not supported in this browser. Please try the latest version of Google Chrome or Microsoft Edge.'
      );
      return;
    }

    setError('');
    setInterimText('');

    // Preserve anything already typed before starting the microphone.
    typedPrefixRef.current = input.trim();
    committedSpeechRef.current = '';
    currentSessionSpeechRef.current = '';

    shouldListenRef.current = true;

    createRecognition(SpeechRecognition);
  }

  function createRecognition(SpeechRecognition) {
    if (!shouldListenRef.current) return;

    const recognition = new SpeechRecognition();

    recognitionRef.current = recognition;

    // Important microphone improvements:
    recognition.lang = 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // This stores the final transcript for this recognition session.
    let sessionFinalText = '';

    recognition.onstart = () => {
      setListening(true);
      setError('');
    };

    recognition.onresult = event => {
      let finalParts = [];
      let temporaryParts = [];

      // Read every result returned by this recognition session.
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript?.trim();

        if (!transcript) continue;

        if (result.isFinal) {
          finalParts.push(transcript);
        } else {
          temporaryParts.push(transcript);
        }
      }

      // Rebuild instead of blindly appending, preventing duplicate words.
      sessionFinalText = joinSpeech(...finalParts);

      currentSessionSpeechRef.current = sessionFinalText;

      const temporaryText = joinSpeech(...temporaryParts);

      const completeText = getCompleteSpeechText(
        sessionFinalText,
        temporaryText
      );

      setInput(completeText);
      setInterimText(temporaryText);
    };

    recognition.onerror = event => {
      const errorCode = event?.error;

      if (
        errorCode === 'not-allowed' ||
        errorCode === 'service-not-allowed'
      ) {
        shouldListenRef.current = false;
        setListening(false);
        setError(
          'Microphone permission is blocked. Please allow microphone access in your browser settings.'
        );
        return;
      }

      if (errorCode === 'audio-capture') {
        shouldListenRef.current = false;
        setListening(false);
        setError(
          'No microphone was detected. Please check your microphone connection.'
        );
        return;
      }

      if (errorCode === 'no-speech' || errorCode === 'aborted') {
        // These can happen when the browser ends a listening session.
        // onend will handle restarting when appropriate.
        return;
      }

      if (shouldListenRef.current) {
        setError(
          'There was a problem with voice recognition. Please try speaking again.'
        );
      }
    };

    recognition.onend = () => {
      // Keep the final words from this session before restarting.
      committedSpeechRef.current = joinSpeech(
        committedSpeechRef.current,
        sessionFinalText
      );

      currentSessionSpeechRef.current = '';

      setInput(
        joinSpeech(
          typedPrefixRef.current,
          committedSpeechRef.current
        )
      );

      setInterimText('');

      // Ignore an old recognition instance if a newer one has started.
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }

      if (!shouldListenRef.current) {
        setListening(false);
        return;
      }

      // Some browsers automatically stop recognition after a short pause.
      // Restart it while keeping the previously recognized words.
      clearTimeout(restartTimerRef.current);

      restartTimerRef.current = setTimeout(() => {
        if (!shouldListenRef.current) return;

        try {
          createRecognition(SpeechRecognition);
        } catch {
          setListening(false);
          setError(
            'The microphone could not restart. Tap the microphone to try again.'
          );
        }
      }, 300);
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      shouldListenRef.current = false;

      setError(
        'The microphone could not start. Please try again.'
      );
    }
  }

  async function sendMessage(text = input) {
    // Include the latest microphone transcript if the user sends while listening.
    const messageText = shouldListenRef.current
      ? getCompleteSpeechText(currentSessionSpeechRef.current)
      : text;

    const clean = String(messageText || '').trim();

    if (!clean || sendLock.current) return;

    // Stop microphone before sending the message.
    if (shouldListenRef.current) {
      stopListening();
    }

    sendLock.current = true;

    setError('');
    setInterimText('');

    const requestId = makeId();

    const userMsg = {
      id: requestId,
      role: 'user',
      content: clean
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    try {
      const response = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: clean,
          sessionId,
          requestId
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || 'Could not reach BAWRA right now.'
        );
      }

      const answer =
        data.reply ||
        'I’m listening, Amu. Would you like to tell me more?';

      setMessages(prev => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          content: answer
        }
      ]);

      speak(answer);
    } catch (e) {
      setError(
        `${e.message} Check that MongoDB, the API key, and the backend are configured.`
      );
    } finally {
      setBusy(false);
      sendLock.current = false;
      inputRef.current?.focus();
    }
  }

  function clearChat() {
    const confirmed = window.confirm(
      'Clear this chat from this browser? The saved database conversation will remain until database deletion is added.'
    );

    if (!confirmed) return;

    if (shouldListenRef.current) {
      stopListening();
    }

    setMessages([
      {
        id: makeId(),
        role: 'assistant',
        content: 'A fresh page, Amu. 🌷 What would you like to talk about?'
      }
    ]);

    setInput('');
    setError('');
    setInterimText('');

    window.speechSynthesis?.cancel();
  }

  const GreetingIcon = daypart.icon;

  const prompts = [
    'Help me plan my study day 📚',
    'I feel a little low today 🌷',
    'Let’s talk about my dreams ✨'
  ];

  return (
    <div className="app-shell">
      <div className="petals" aria-hidden="true">
        <span>✿</span>
        <span>♡</span>
        <span>✧</span>
        <span>✿</span>
        <span>♡</span>
        <span>✧</span>
      </div>

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Heart fill="currentColor" size={19} />
          </div>

          <div>
            <b>BAWRA</b>
            <small>your gentle corner</small>
          </div>
        </div>

        <div className="top-actions">
          <button
            className="icon-btn"
            title={voiceOn ? 'Turn voice off' : 'Turn voice on'}
            aria-label={voiceOn ? 'Turn voice off' : 'Turn voice on'}
            onClick={() => {
              setVoiceOn(v => !v);
              window.speechSynthesis?.cancel();
            }}
          >
            {voiceOn ? <Volume2 /> : <VolumeX />}
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="welcome-card">
          <div className="welcome-copy">
            <div className="eyebrow">
              <Sparkles size={14} />
              A LITTLE SPACE JUST FOR YOU
            </div>

            <h1>
              {daypart.label}, <em>Amu</em> <span>♡</span>
            </h1>

            <p>{daypart.line}</p>

            <div className="welcome-note">
              “Your thoughts are welcome here. No judgement, no pressure.”
            </div>
          </div>

          <div className="orb-wrap">
            <div className="orb">
              <Heart fill="currentColor" size={37} />
            </div>

            <span className="orbit orbit-one"></span>
            <span className="orbit orbit-two"></span>
          </div>
        </section>

        <section className="best-friend-note" aria-label="A note from BAWRA">
          <div className="note-heart">
            <Heart size={17} fill="currentColor" />
          </div>

          <div>
            <div className="eyebrow">A LITTLE NOTE FROM BAWRA</div>

            <p>
              “I’m your BAWRA, Amu. I know the little things you’ve shared
              with me; for everything else you’re curious about in this
              wonderful world, ask my best friend, ChatGPT.”
            </p>
          </div>
        </section>

        <div className="content-grid">
          <section className="chat-card">
            <div className="section-head">
              <div>
                <div className="eyebrow">OUR CONVERSATION</div>

                <h2>
                  <MessageCircle size={19} />
                  Talk with BAWRA
                </h2>
              </div>

              <button className="text-btn" onClick={clearChat}>
                <Trash2 size={14} />
                Clear chat
              </button>
            </div>

            <div className="messages">
              {messages.map(message => (
                <div
                  className={`message-row ${message.role}`}
                  key={message.id}
                >
                  <div className="avatar">
                    {message.role === 'assistant' ? (
                      <Heart size={15} fill="currentColor" />
                    ) : (
                      'A'
                    )}
                  </div>

                  <div className="bubble">
                    <div className="bubble-name">
                      {message.role === 'assistant' ? 'BAWRA' : 'Amu'}
                    </div>

                    <p>{message.content}</p>
                  </div>
                </div>
              ))}

              {busy && (
                <div className="message-row assistant">
                  <div className="avatar">
                    <Heart size={15} fill="currentColor" />
                  </div>

                  <div className="bubble typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {error && (
              <div className="error-msg">
                <span>{error}</span>

                <button
                  onClick={() => setError('')}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="suggestions">
              {prompts.map(prompt => (
                <button
                  key={prompt}
                  disabled={busy}
                  onClick={() => sendMessage(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form
              className="composer"
              onSubmit={event => {
                event.preventDefault();
                sendMessage();
              }}
            >
              <button
                type="button"
                className={`mic-btn ${listening ? 'active' : ''}`}
                title={
                  listening
                    ? 'Stop microphone'
                    : 'Start microphone'
                }
                aria-label={
                  listening
                    ? 'Stop microphone'
                    : 'Start microphone'
                }
                onClick={listening ? stopListening : startListening}
                disabled={busy}
              >
                <Mic size={19} />
              </button>

              <input
                ref={inputRef}
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder={
                  listening
                    ? 'I’m listening… speak naturally'
                    : 'Write what’s on your mind, Amu…'
                }
                aria-label="Message BAWRA"
              />

              <button
                className="send-btn"
                disabled={!input.trim() || busy}
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </form>

            {listening && (
              <div className="interim-preview">
                <span className="listening-dot"></span>
                Listening… You can speak in complete sentences.
                {interimText && (
                  <span> {interimText}</span>
                )}
              </div>
            )}

            <div className="privacy-hint">
              Your personal details are kept in the private database and
              are not displayed here. Microphone starts only when you tap it.
            </div>
          </section>

          <aside className="side-column">
            <section className="side-card quote-card">
              <div className="side-icon">
                <Flower2 />
              </div>

              <div className="eyebrow">A LITTLE REMINDER</div>

              <p>
                You don’t have to figure everything out today. One kind
                step at a time is enough.
              </p>

              <small>♡ With care, BAWRA</small>
            </section>
          </aside>
        </div>
      </main>

      <footer>
        Made with care <Heart size={12} fill="currentColor" /> · BAWRA is
        an AI companion, not a replacement for trusted people in your life.
      </footer>
    </div>
  );
}
