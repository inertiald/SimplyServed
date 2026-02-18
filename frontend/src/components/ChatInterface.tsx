import React, { useState } from 'react';

type Receipt = {
  service: string;
  provider: string;
  total: string;
  confirmationId: string;
};

type Message = {
  role: 'user' | 'model' | 'error';
  text: string;
  receipt?: Receipt;
};

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', text: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      // 🔥 TEMP MOCK RESPONSE
      const mockResponse = {
        response: "Your pizza order has been successfully placed!",
        receipt: {
          service: "Pizza Order",
          provider: "Everett Pizza Co",
          total: "$22.45",
          confirmationId: "ABC123"
        }
      };

      const aiMessage: Message = {
        role: 'model',
        text: mockResponse.response,
        receipt: mockResponse.receipt
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'error', text: 'Something went wrong.' }
      ]);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#1f2937",
        padding: "20px",
        borderRadius: "16px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
      }}
    >
      <h2 style={{ marginBottom: "20px" }}>
        SimplyServed Assistant
      </h2>

      {/* Chat Window */}
      <div
        style={{
          height: "400px",
          overflowY: "auto",
          padding: "10px",
          backgroundColor: "#111827",
          borderRadius: "12px",
          marginBottom: "15px"
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent:
                msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: "12px"
            }}
          >
            <div
              style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: "12px",
                backgroundColor:
                  msg.role === "user"
                    ? "#3b82f6"
                    : msg.role === "error"
                    ? "#ef4444"
                    : "#374151",
                color: "white"
              }}
            >
              {msg.text}

              {/* Receipt Display */}
              {msg.receipt && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px",
                    borderRadius: "10px",
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151"
                  }}
                >
                  <h4 style={{ marginBottom: "8px" }}>
                    ✅ Transaction Confirmation
                  </h4>
                  <p><strong>Service:</strong> {msg.receipt.service}</p>
                  <p><strong>Provider:</strong> {msg.receipt.provider}</p>
                  <p><strong>Total:</strong> {msg.receipt.total}</p>
                  <p><strong>Confirmation ID:</strong> {msg.receipt.confirmationId}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div style={{ display: "flex" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask Eleanor to order pizza, book a plumber, etc..."
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "8px 0 0 8px",
            border: "none",
            outline: "none",
            fontSize: "14px"
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            padding: "12px 18px",
            borderRadius: "0 8px 8px 0",
            border: "none",
            backgroundColor: "#3b82f6",
            color: "white",
            fontWeight: "bold",
            cursor: "pointer"
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
