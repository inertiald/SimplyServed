"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Pizza,
  Scissors,
  Bot,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentResponse, ThinkingStep, ToolCall } from "@/lib/agent/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Message {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  thinkingSteps?: ThinkingStep[];
  toolCalls?: ToolCall[];
}

/* ------------------------------------------------------------------ */
/*  Landing                                                            */
/* ------------------------------------------------------------------ */

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl">
        SimplyServed
      </h1>
      <p className="mb-10 max-w-xl text-lg text-gray-400">
        AI-powered local service coordination. Order food, book services, and
        manage everyday tasks through a single intelligent assistant.
      </p>
      <button
        onClick={onStart}
        className="rounded-xl bg-blue-600 px-8 py-3.5 text-lg font-semibold text-white transition hover:bg-blue-500"
      >
        Try Eleanor
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Thinking-steps accordion                                           */
/* ------------------------------------------------------------------ */

function ThinkingSteps({ steps }: { steps: ThinkingStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;

  return (
    <div className="mb-2 rounded-lg bg-gray-800/60 text-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-gray-400 hover:text-gray-200"
      >
        <Bot size={14} />
        <span>Agent steps ({steps.length})</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <ul className="space-y-1 px-3 pb-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-gray-300">
              <span className="mt-0.5">
                {s.status === "done"
                  ? "✅"
                  : s.status === "error"
                  ? "❌"
                  : "⏳"}
              </span>
              <span>{s.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Receipt card                                                       */
/* ------------------------------------------------------------------ */

function ReceiptCard({ call }: { call: ToolCall }) {
  if (!call.result) return null;
  const { result } = call;
  const Icon = call.toolName === "orderPizza" ? Pizza : Scissors;

  return (
    <div className="mt-3 rounded-xl border border-gray-700 bg-gray-900 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-400">
        <Icon size={16} />
        {result.service}
      </div>
      <p className="mb-2 text-sm text-gray-300">{result.summary}</p>
      <div className="space-y-1 text-xs text-gray-400">
        <p>
          <span className="font-medium text-gray-300">Provider:</span>{" "}
          {result.provider}
        </p>
        {Object.entries(result.details).map(([k, v]) => (
          <p key={k}>
            <span className="font-medium text-gray-300">
              {k.charAt(0).toUpperCase() + k.slice(1)}:
            </span>{" "}
            {v}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chat bubble                                                        */
/* ------------------------------------------------------------------ */

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const isError = msg.role === "error";

  return (
    <div
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-blue-600 text-white"
            : isError
            ? "bg-red-600/80 text-white"
            : "bg-gray-800 text-gray-100"
        )}
      >
        {/* Thinking steps (assistant only) */}
        {msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
          <ThinkingSteps steps={msg.thinkingSteps} />
        )}

        {/* Message text */}
        <p>{msg.text}</p>

        {/* Tool receipts */}
        {msg.toolCalls?.map((call, idx) => (
          <ReceiptCard key={idx} call={call} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [page, setPage] = useState<"landing" | "chat">("landing");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) throw new Error("Agent request failed");

      const data: AgentResponse = await res.json();

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.reply,
        thinkingSteps: data.thinkingSteps,
        toolCalls: data.toolCalls,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "error",
          text: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /* ----- Landing ----- */
  if (page === "landing") {
    return <Landing onStart={() => setPage("chat")} />;
  }

  /* ----- Chat ----- */
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-800 px-6 py-4">
          <Bot className="text-blue-400" size={24} />
          <div>
            <h2 className="text-lg font-semibold">SimplyServed Assistant</h2>
            <p className="text-xs text-gray-400">
              Ask Eleanor to order food, book services, and more
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-scroll flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-center text-gray-500">
              <p>
                Type something like{" "}
                <span className="text-gray-300">
                  &quot;Order me a pizza and book a haircut for Monday at
                  10&quot;
                </span>
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatBubble key={msg.id} msg={msg} />
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-gray-800 px-4 py-3 text-sm text-gray-400">
                <Loader2 size={16} className="animate-spin" />
                Eleanor is thinking…
              </div>
            </div>
          )}
          <div ref={chatEnd} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ask Eleanor to order pizza, book a haircut…"
              disabled={loading}
              className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="rounded-xl bg-blue-600 p-3 text-white transition hover:bg-blue-500 disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
