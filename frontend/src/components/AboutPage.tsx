const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white font-sans">
      <div className="max-w-4xl mx-auto px-6 py-20">
        {/* Header */}
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
          About SimplyServed
        </h1>
        <p className="text-xl text-gray-400 mb-16 leading-relaxed">
          Restoring authentic, merit-based connection in local communities
        </p>

        {/* What SimplyServed Is */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-white mb-6">
            What SimplyServed Is
          </h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            SimplyServed is a community-focused agentic services platform that replaces 
            pay-to-play dynamics with merit-based discovery. Unlike platforms like Yelp, 
            Google, or Facebook that prioritize marketing budgets and sponsored results, 
            SimplyServed is completely free for providers to list on.
          </p>
          <p className="text-gray-400 leading-relaxed">
            We prioritize quality and neighborhood identity over who can afford to boost 
            their visibility. Our platform ensures that small, high-quality local service 
            providers get the recognition they deserve based on merit, not money.
          </p>
        </section>

        {/* Eleanor */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-white mb-6">
            Meet Eleanor
          </h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            Eleanor is the intelligent agent at the core of SimplyServed. She goes beyond 
            simple search — users can tell her to "order a pizza" or "fix a sink," and 
            the system handles discovery, scheduling, and coordination based on what's 
            actually good and local, not what's sponsored.
          </p>
          <p className="text-gray-400 leading-relaxed">
            Eleanor understands context, preferences, and intent, making service coordination 
            feel effortless. She's your personal concierge for everyday tasks, connecting 
            you with the best providers in your community.
          </p>
        </section>

        {/* Why This Matters */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-white mb-6">
            Why This Matters
          </h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            Small, high-quality local service providers are getting buried because they 
            can't afford to boost visibility on major platforms. The best neighborhood 
            bakery or the most reliable handyman shouldn't need a marketing budget to be 
            discovered.
          </p>
          <p className="text-gray-400 leading-relaxed">
            Meanwhile, consumers are exhausted sifting through SEO-manipulated results, 
            fake reviews, and sponsored listings. People want authentic recommendations 
            from their community, not algorithmic results designed to maximize ad revenue.
          </p>
        </section>

        {/* Validation Approach */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-white mb-6">
            Our Validation Approach
          </h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            We're running a "concierge MVP" to test the agentic workflow — simulating the 
            AI behind the scenes to validate our core assumptions before scaling the 
            technology.
          </p>
          <p className="text-gray-400 leading-relaxed">
            This approach helps us verify that users are comfortable handing off control 
            to an intelligent agent and that providers respond positively to a platform 
            that doesn't charge for leads. The feedback we gather directly shapes how 
            Eleanor evolves.
          </p>
        </section>

        {/* Technical Approach */}
        <section className="mb-16">
          <h2 className="text-3xl font-semibold text-white mb-6">
            Technical Approach
          </h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            SimplyServed is built with advanced AI orchestration at its core. Eleanor's 
            decision engine leverages RAG (Retrieval-Augmented Generation) architectures 
            and machine learning to understand user intent and match them with the right 
            providers.
          </p>
          <p className="text-gray-400 leading-relaxed">
            Behind the scenes, we maintain a rigorous persistence layer to ensure data 
            integrity and secure authentication for user data and payments. Our infrastructure 
            is designed to scale while maintaining the personal, community-focused experience 
            that makes SimplyServed unique.
          </p>
        </section>

        {/* Closing Statement */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-2xl">
          <p className="text-gray-300 leading-relaxed text-center text-lg">
            We're building a platform where quality wins, communities thrive, and everyday 
            tasks become effortless. Join us in restoring authentic connection to local services.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
