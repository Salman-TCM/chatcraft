export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="text-center space-y-4 px-4">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          ChatCraft AI
        </h1>
        <p className="text-lg text-muted-foreground max-w-prose mx-auto">
          Production-grade AI chatbot platform for businesses worldwide.
        </p>
      </div>
    </main>
  );
}
