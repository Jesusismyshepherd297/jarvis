import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { JarvisTurn } from "#/lib/jarvis";

export const Route = createFileRoute("/")({
  component: JarvisPage,
  head: () => ({
    meta: [
      { title: "J.A.R.V.I.S." },
      { name: "description", content: "Talk to JARVIS, a voice-enabled AI assistant powered by Claude." },
    ],
  }),
});

type Status = "idle" | "listening" | "thinking" | "speaking";

// The Web Speech API isn't in TypeScript's DOM lib, so describe the parts we use.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

const GREETING: JarvisTurn = {
  role: "assistant",
  text: "Good day. I'm JARVIS. Tap the mic or type, and tell me what you need.",
};

const SUGGESTIONS = [
  "Help me plan my day",
  "Explain black holes simply",
  "Give me 3 dinner ideas with chicken and rice",
  "Draft a polite text to reschedule a meeting",
];

function JarvisPage() {
  const [turns, setTurns] = useState<JarvisTurn[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [voiceOn, setVoiceOn] = useState(true);
  const [micSupported, setMicSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMicSupported(getSpeechRecognition() !== null);
    return () => {
      abortRef.current?.abort();
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  function speak(text: string) {
    if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis) {
      setStatus("idle");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|arthur|george/i.test(v.name)) ??
      voices.find((v) => /en-GB/i.test(v.lang)) ??
      voices.find((v) => /^en/i.test(v.lang));
    if (preferred) utterance.voice = preferred;
    utterance.rate = 1.03;
    utterance.pitch = 0.9;
    utterance.onend = () => setStatus("idle");
    utterance.onerror = () => setStatus("idle");
    setStatus("speaking");
    window.speechSynthesis.speak(utterance);
  }

  function stopEverything() {
    abortRef.current?.abort();
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setStatus("idle");
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || status === "thinking") return;
    window.speechSynthesis?.cancel();
    setError(null);
    setDraft("");

    // The greeting is UI-only; the API conversation must start with the user.
    const history = [...turns.filter((t) => t !== GREETING), { role: "user", text: content } as JarvisTurn];
    setTurns((prev) => [...prev, { role: "user", text: content }, { role: "assistant", text: "" }]);
    setStatus("thinking");

    const controller = new AbortController();
    abortRef.current = controller;
    let reply = "";
    try {
      const res = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.text()) || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const snapshot = reply;
        setTurns((prev) => [...prev.slice(0, -1), { role: "assistant", text: snapshot }]);
      }
      speak(reply);
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("idle");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("idle");
      }
      if (!reply) setTurns((prev) => prev.slice(0, -1));
    } finally {
      abortRef.current = null;
    }
  }

  function toggleListening() {
    if (status === "listening") {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = getSpeechRecognition();
    if (!Recognition) return;
    window.speechSynthesis?.cancel();
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalText = "";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setDraft(finalText + interim);
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Microphone error: ${event.error}`);
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus("idle");
      if (finalText.trim()) void send(finalText);
    };
    recognitionRef.current = recognition;
    setStatus("listening");
    recognition.start();
  }

  const statusLabel: Record<Status, string> = {
    idle: "Online",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="animate-float-slow absolute -left-40 top-[10%] h-96 w-96 rounded-full bg-cyan-500/15 blur-[110px]" />
        <div className="animate-float-slower absolute -right-32 top-[45%] h-[28rem] w-[28rem] rounded-full bg-violet-600/15 blur-[130px]" />
        <div className="bg-grid absolute inset-0" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-[#05050a]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-sm font-medium tracking-widest text-white/60">JARVIS</span>
          <button
            type="button"
            onClick={() => {
              if (voiceOn) window.speechSynthesis?.cancel();
              setVoiceOn((v) => !v);
            }}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
            aria-pressed={voiceOn}
          >
            {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4 sm:px-6">
        <div className="flex flex-col items-center py-8">
          <ArcReactor status={status} />
          <h1 className="mt-5 text-2xl font-semibold tracking-[0.3em]">J.A.R.V.I.S.</h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-cyan-300/80" aria-live="polite">
            {statusLabel[status]}
          </p>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
          style={{ maxHeight: "50vh" }}
        >
          {turns.map((turn, i) => (
            <div key={i} className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  turn.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm leading-relaxed"
                    : "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-cyan-400/20 bg-cyan-400/5 px-4 py-2.5 text-sm leading-relaxed text-white/90"
                }
              >
                {turn.text || <TypingDots />}
              </div>
            </div>
          ))}
        </div>

        {turns.length === 1 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:border-cyan-400/40 hover:bg-cyan-400/10"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          {micSupported && (
            <button
              type="button"
              onClick={toggleListening}
              disabled={status === "thinking"}
              aria-label={status === "listening" ? "Stop listening" : "Speak to JARVIS"}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-40 ${
                status === "listening"
                  ? "animate-pulse border-red-400 bg-red-500/20 text-red-300"
                  : "border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
              }`}
            >
              <MicIcon />
            </button>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={status === "listening" ? "Listening…" : "Ask JARVIS anything"}
            className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:outline-none"
          />
          {status === "thinking" || status === "speaking" ? (
            <button
              type="button"
              onClick={stopEverything}
              className="shrink-0 rounded-full border border-white/20 px-4 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              className="shrink-0 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          )}
        </form>
        <p className="mt-3 text-center text-[11px] text-white/35">
          JARVIS is an AI assistant and can make mistakes. Double-check anything important.
        </p>
      </main>
    </div>
  );
}

function ArcReactor({ status }: { status: Status }) {
  const active = status !== "idle";
  const color =
    status === "listening" ? "rgb(248 113 113)" : status === "thinking" ? "rgb(167 139 250)" : "rgb(34 211 238)";
  return (
    <div className="relative h-28 w-28" aria-hidden="true">
      <div
        className="absolute inset-0 rounded-full blur-2xl transition-all duration-500"
        style={{ background: color, opacity: active ? 0.55 : 0.25 }}
      />
      <div
        className={`absolute inset-0 rounded-full border-2 border-dashed ${active ? "animate-spin" : ""}`}
        style={{ borderColor: color, animationDuration: status === "thinking" ? "1.5s" : "6s" }}
      />
      <div className="absolute inset-3 rounded-full border" style={{ borderColor: color, opacity: 0.6 }} />
      <div
        className={`absolute inset-7 rounded-full ${status === "speaking" || status === "listening" ? "animate-pulse" : ""}`}
        style={{ background: `radial-gradient(circle, white 0%, ${color} 45%, transparent 75%)` }}
      />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1" aria-label="JARVIS is thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v5" />
    </svg>
  );
}
