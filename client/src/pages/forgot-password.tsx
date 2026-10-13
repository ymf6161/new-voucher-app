import { useState } from "react";
import { Link } from "wouter";
import { MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth-layout";
import { useToast } from "@/hooks/use-toast";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast({
        title: "Could not send reset email",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout title="Check your email" description={`A password reset link has been sent to ${email}.`}>
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-4 text-sm">
          <MailCheck className="h-5 w-5 flex-none text-primary" />
          <p>Click the link in the email to set a new password, then sign in.</p>
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
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      window.location.href = "/login";
    } catch (err: any) {
      toast({
        title: "Could not update password",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Set a new password" description="Enter your new password below.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11" />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
