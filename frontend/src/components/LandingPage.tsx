interface Props {
  onStart: () => void;
}

const LandingPage: React.FC<Props> = ({ onStart }) => {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
        textAlign: "center"
      }}
    >
      <h1 style={{ fontSize: "48px", marginBottom: "20px" }}>
        SimplyServed
      </h1>

      <p
        style={{
          maxWidth: "600px",
          fontSize: "18px",
          color: "#9ca3af",
          marginBottom: "40px"
        }}
      >
        AI-powered local service coordination.  
        Order food, book services, and manage everyday tasks
        through a single intelligent assistant.
      </p>

      <button
        onClick={onStart}
        style={{
          padding: "14px 28px",
          fontSize: "16px",
          borderRadius: "10px",
          border: "none",
          backgroundColor: "#3b82f6",
          color: "white",
          cursor: "pointer"
        }}
      >
        Try Eleanor
      </button>
    </div>
  );
};

export default LandingPage;
