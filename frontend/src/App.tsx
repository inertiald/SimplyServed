import { useState } from "react";
import ChatInterface from "./components/chatInterface";
import LandingPage from "./components/LandingPage";

function App() {
  const [page, setPage] = useState<"landing" | "chat">("landing");

  return (
    <>
      {page === "landing" && (
        <LandingPage onStart={() => setPage("chat")} />
      )}

      {page === "chat" && (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "20px"
          }}
        >
          <div style={{ width: "100%", maxWidth: "700px" }}>
            <h2 style={{ textAlign: "center", marginBottom: "20px" }}>
              SimplyServed Assistant
            </h2>
            <ChatInterface />
          </div>
        </div>
      )}
    </>
  );
}

export default App;
