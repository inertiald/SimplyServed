import React, { useState } from "react";
import type { AgentResponse, ToolCall, ThinkingStep } from "../types/agent";

type Message = {
  role: "user" | "model" | "error";
  text: string;
  thinkingSteps?: ThinkingStep[];
  toolCalls?: ToolCall[];
};

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      if (!res.ok) {
        throw new Error("Agent request failed");
      }

      const data: AgentResponse = await res.json();

      const aiMessage: Message = {
        role: "model",
        text: data.reply,
        thinkingSteps: data.thinkingSteps,
        toolCalls: data.toolCalls,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: "error",
        text: "Something went wrong. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-black px-6 py-20">
      
      {/* Header Section */}
      <div className="max-w-4xl mx-auto mb-8">
        <h2 className="text-3xl font-semibold text-white mb-2">
          Talk to Eleanor
        </h2>
        <p className="text-gray-400">
          Ask our AI assistant to order services, book providers, or manage tasks instantly.
        </p>
      </div>

      {/* Chat Container */}
      <div className="max-w-4xl mx-auto">
        <div className="h-[650px] bg-slate-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">

          {/* Message Area */}
          <div className="flex-1 bg-slate-950 p-8 space-y-6 overflow-y-auto">

            {/* Empty State */}
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-gray-500">
                Start a conversation with Eleanor.
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-md px-5 py-4 rounded-2xl text-sm leading-relaxed transition-all duration-300 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                      : msg.role === "error"
                      ? "bg-red-600 text-white"
                      : "bg-slate-800 text-gray-200 border border-white/5"
                  }`}
                >
                  {/* Thinking steps (assistant only) */}
                  {msg.thinkingSteps && msg.thinkingSteps.length > 0 && (
                    <div className="mb-3 rounded-lg bg-slate-900/60 text-xs">
                      <div className="px-3 py-2 text-gray-400 flex items-center gap-2">
                        <span>🤖</span>
                        <span>Agent steps ({msg.thinkingSteps.length})</span>
                      </div>
                      <ul className="space-y-1 px-3 pb-2">
                        {msg.thinkingSteps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-gray-300">
                            <span className="mt-0.5">
                              {step.status === "done"
                                ? "✅"
                                : step.status === "error"
                                ? "❌"
                                : "⏳"}
                            </span>
                            <span>{step.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Message text */}
                  {msg.text}

                  {/* Tool call receipts */}
                  {msg.toolCalls?.map((call, idx) => {
                    if (!call.result) return null;
                    const { result } = call;
                    return (
                      <div key={idx} className="mt-4 bg-slate-900 border border-white/10 p-4 rounded-xl text-xs space-y-1">
                        <p className="font-semibold text-emerald-400 flex items-center gap-1">
                          <span>{call.toolName === "orderPizza" ? "🍕" : "✂️"}</span>
                          <span>✅ {result.service}</span>
                        </p>
                        <p className="text-gray-300">{result.summary}</p>
                        <div className="space-y-1 text-gray-400">
                          <p>
                            <strong className="text-gray-300">Provider:</strong> {result.provider}
                          </p>
                          {Object.entries(result.details).map(([k, v]) => (
                            <p key={k}>
                              <strong className="text-gray-300">
                                {k.charAt(0).toUpperCase() + k.slice(1)}:
                              </strong>{" "}
                              {v}
                            </p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-md px-5 py-4 rounded-2xl text-sm bg-slate-800 text-gray-400 border border-white/5 flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full"></div>
                  Eleanor is thinking…
                </div>
              </div>
            )}
          </div>

          {/* Input Dock */}
          <div className="p-6 bg-slate-900 border-t border-white/10">
            <div className="flex bg-slate-800 rounded-2xl overflow-hidden border border-white/10 focus-within:ring-2 focus-within:ring-indigo-500 transition">

              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && sendMessage()}
                placeholder="Ask Eleanor to order pizza..."
                disabled={loading}
                className="flex-1 bg-transparent px-6 py-4 text-white placeholder-gray-400 outline-none disabled:opacity-50"
              />

              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 px-8 font-semibold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>

            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default ChatInterface;
