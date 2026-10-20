import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Host dashboard" };

export default function HostHome() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-bold">Host dashboard</h1>
      <Suspense fallback={<p className="mt-2 text-muted-foreground">Loading…</p>}>
        <HostSummary />
      </Suspense>
    </main>
  );
}

async function HostSummary() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/host");

  const { data: orgs } = await supabase.from("organizations").select("id, name");

  return (
    <>
      <p className="mt-2 text-muted-foreground">Signed in as {data.user.email}</p>
      <section className="mt-8 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">Your organizations</h2>
        {orgs && orgs.length > 0 ? (
          <ul className="mt-2 list-disc pl-5">{orgs.map((o) => <li key={o.id}>{o.name}</li>)}</ul>
        ) : (
          <p className="mt-2 text-muted-foreground">None yet. Creating one comes next.</p>
        )}
      </section>
      <form action="/auth/signout" method="post" className="mt-8">
        <button className="h-11 cursor-pointer rounded-lg border border-border px-4 font-medium hover:bg-muted">
          Sign out
        </button>
      </form>
    </>
  );
}
