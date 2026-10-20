import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Local event sponsorships, delivered.</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Sell sponsorship packages, prove you delivered, and bring sponsors back next year.
      </p>
      <div className="mt-8">
        <Link
          href="/login"
          className="inline-flex h-12 items-center rounded-lg bg-primary px-6 font-semibold text-on-primary hover:bg-primary-hover"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
