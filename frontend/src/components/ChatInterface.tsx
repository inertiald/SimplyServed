import React, { useState } from "react";

type Receipt = {
  service: string;
  provider: string;
  total: string;
  confirmationId: string;
};

type Message = {
  role: "user" | "model" | "error";
  text: string;
  receipt?: Receipt;
};

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Mock AI response
    const aiMessage: Message = {
      role: "model",
      text: "Your pizza order has been successfully placed!",
      receipt: {
        service: "Pizza Order",
        provider: "Everett Pizza Co",
        total: "$22.45",
        confirmationId: "ABC123",
      },
    };

    setMessages((prev) => [...prev, aiMessage]);
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
                  {msg.text}

                  {msg.receipt && (
                    <div className="mt-4 bg-slate-900 border border-white/10 p-4 rounded-xl text-xs space-y-1">
                      <p className="font-semibold text-emerald-400">
                        ✅ Transaction Confirmation
                      </p>
                      <p><strong>Service:</strong> {msg.receipt.service}</p>
                      <p><strong>Provider:</strong> {msg.receipt.provider}</p>
                      <p><strong>Total:</strong> {msg.receipt.total}</p>
                      <p className="text-gray-400">
                        <strong>ID:</strong> {msg.receipt.confirmationId}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input Dock */}
          <div className="p-6 bg-slate-900 border-t border-white/10">
            <div className="flex bg-slate-800 rounded-2xl overflow-hidden border border-white/10 focus-within:ring-2 focus-within:ring-indigo-500 transition">

              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask Eleanor to order pizza..."
                className="flex-1 bg-transparent px-6 py-4 text-white placeholder-gray-400 outline-none"
              />

              <button
                onClick={sendMessage}
                className="bg-indigo-600 hover:bg-indigo-500 px-8 font-semibold text-white transition-all duration-300"
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
