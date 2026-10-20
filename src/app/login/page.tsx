import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <p className="mt-2 text-muted-foreground">
        Enter your email and we&apos;ll send you a sign-in link. No password needed.
      </p>
      <Suspense>
        <LoginBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginBody({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <>
      {error === "link" && (
        <p role="alert" className="mt-4 rounded-lg border border-destructive p-3 text-destructive">
          That sign-in link expired or was already used. Please request a new one.
        </p>
      )}
      <LoginForm next={next} />
    </>
  );
}
