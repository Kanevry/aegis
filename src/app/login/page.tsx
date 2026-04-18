"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast, Toaster } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [passphrase, setPassphrase] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [shake, setShake] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      if (res.ok) {
        const next = searchParams.get("next");
        router.push((next ?? "/dashboard/chat") as Parameters<typeof router.push>[0]);
      } else if (res.status === 401) {
        setShake(true);
        setTimeout(() => setShake(false), 600);
        toast.error("Invalid passphrase");
      } else {
        toast.error("Login failed. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Toaster position="top-center" theme="dark" />
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white">Ægis</h1>
            <p className="mt-2 text-sm text-neutral-400">Observable agentic hardening</p>
          </div>

          <Card>
            <CardHeader>
              <p className="text-sm font-medium text-neutral-200">Operator Login</p>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit}
                className={shake ? "animate-[shake_0.5s_ease-in-out]" : ""}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="passphrase"
                      className="text-xs font-medium uppercase tracking-wide text-neutral-400"
                    >
                      Passphrase
                    </label>
                    <input
                      id="passphrase"
                      type="password"
                      autoComplete="current-password"
                      required
                      minLength={8}
                      maxLength={200}
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      placeholder="Enter your passphrase"
                    />
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginPageContent />
    </React.Suspense>
  );
}
