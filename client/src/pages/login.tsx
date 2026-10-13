import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { setDemoSession } from "@/lib/demo-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";

/** Where to go after signing in: the page the user was sent here from, if it's one of ours. */
export function nextPathFromUrl(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setDemoSession(true);
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    setLocation(nextPathFromUrl());
    setLoading(false);
  };

  return (
    <AuthLayout title="Sign in" description="Frontend preview. Enter any email and password to open the demo.">
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" autoFocus placeholder="you@organisation.org" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" data-testid="input-email" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" data-testid="input-password" />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading} data-testid="button-sign-in">
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
