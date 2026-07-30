import React, { useState } from "react";
import { resetPassword } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Loader2 } from "lucide-react";

// The auth Worker emails a 6-digit code (not a magic link) on
// /auth/forgot-password, then requires { email, resetCode, newPassword } on
// /auth/reset-password — see workers/auth/src/handlers/passwordReset.ts.
// Email/code are prefilled from the URL if the reset email links here with
// ?email=&code=, but both stay editable in case the user opens this page
// directly and types the code in by hand.
export default function ResetPassword() {
  const urlParams = new URLSearchParams(window.location.search);

  const [email, setEmail] = useState(urlParams.get("email") || "");
  const [resetCode, setResetCode] = useState(urlParams.get("code") || "");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPw) { setError("Passwords don't match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await resetPassword({ email: email.trim().toLowerCase(), resetCode: resetCode.trim(), newPassword: password });
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">New Password</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter the code from your email and choose a new password</p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="bg-card border-border mt-1" required />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Reset Code</Label>
            <Input type="text" inputMode="numeric" value={resetCode} onChange={e => setResetCode(e.target.value)} placeholder="6-digit code" className="bg-card border-border mt-1" required />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">New Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="bg-card border-border mt-1" required />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Confirm Password</Label>
            <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="••••••••" className="bg-card border-border mt-1" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Reset Password
          </Button>
        </form>
      </div>
    </div>
  );
}
