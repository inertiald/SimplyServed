interface Props {
  onStart: () => void;
}

const LandingPage: React.FC<Props> = ({ onStart }) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white font-sans">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center min-h-screen px-6 pt-20">
        <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 max-w-4xl leading-tight">
          AI-powered{" "}
          <span // className="bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-600 bg-clip-text text-transparent">
           className="text-red-500 text-6xl">

            service coordination
          </span>
        </h1>

        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-12 leading-relaxed">
          SimplyServed helps you order food, book local services,
          and manage everyday tasks through a single intelligent assistant.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <button
            onClick={onStart}
            className="px-8 py-3 rounded-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/50 hover:shadow-indigo-500/75 transition-all duration-300 transform hover:scale-105"
          >
            Try Eleanor
          </button>

          <button
            onClick={() => onStart()}
            className="px-8 py-3 rounded-lg font-semibold text-gray-200 border border-white/20 hover:border-white/40 hover:bg-white/5 transition-all duration-300"
          >
            See Demo
          </button>
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl w-full">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300">
            <h3 className="text-xl font-semibold mb-4 text-white">
              Order Services
            </h3>
            <p className="text-gray-400 leading-relaxed">
              Request plumbers, electricians, or food delivery instantly.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300">
            <h3 className="text-xl font-semibold mb-4 text-white">
              Smart Matching
            </h3>
            <p className="text-gray-400 leading-relaxed">
              Our AI understands your request and finds the best provider for you.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300">
            <h3 className="text-xl font-semibold mb-4 text-white">
              Instant Confirmation
            </h3>
            <p className="text-gray-400 leading-relaxed">
              Receive structured transaction confirmations immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
