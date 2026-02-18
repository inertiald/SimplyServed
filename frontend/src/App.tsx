import { useState } from "react";
import Navbar from "./components/Navbar";
import LandingPage from "./components/LandingPage";
import ChatInterface from "./components/chatInterface";
import AboutPage from "./components/AboutPage";


function App() {
  const [page, setPage] = useState<"home" | "chat" | "about">("home");

  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900 font-sans">
      <Navbar current={page} onNavigate={setPage} />

      <main className="flex-1 flex justify-center px-6 py-12">
        <div className="w-full max-w-5xl">
          {page === "home" && (
            <LandingPage onStart={() => setPage("chat")} />
          )}

          {page === "chat" && <ChatInterface />}

          {page === "about" && <AboutPage />}
        </div>
      </main>
    </div>
  );
}
export default App;
