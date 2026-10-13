import { useState } from "react";
import { Link } from "wouter";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <AuthLayout title="Demo only" description={`No reset email was sent to ${email}.`}>
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-4 text-sm">
          <MailCheck className="h-5 w-5 flex-none text-primary" />
          <p>Password recovery is not connected in this frontend-only preview.</p>
        </div>
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" description="Enter your email and we'll send you a link to set a new password.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPassword() {
  return (
    <AuthLayout title="Password reset unavailable" description="Email-based password recovery is not connected in this frontend-only preview.">
      <Button asChild className="h-11 w-full">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </AuthLayout>
  );
}
