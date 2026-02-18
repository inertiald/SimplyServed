interface Props {
  current: string;
  onNavigate: (page: "home" | "chat" | "about") => void;
}

const Navbar: React.FC<Props> = ({ current, onNavigate }) => {
  const linkClasses = (page: string) =>
    `text-sm font-medium transition ${
      current === page
        ? "text-indigo-600"
        : "text-gray-600 hover:text-gray-900"
    }`;

  return (
    <div className="w-full border-b border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <div
          className="text-lg font-semibold tracking-tight cursor-pointer"
          onClick={() => onNavigate("home")}
        >
          SimplyServed
        </div>

        <div className="space-x-8">
          <button className={linkClasses("home")} onClick={() => onNavigate("home")}>
            Home
          </button>
          <button className={linkClasses("chat")} onClick={() => onNavigate("chat")}>
            Chat
          </button>
          <button className={linkClasses("about")} onClick={() => onNavigate("about")}>
            About
          </button>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
