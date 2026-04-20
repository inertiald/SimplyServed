export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      {children}
    </div>
  );
}
