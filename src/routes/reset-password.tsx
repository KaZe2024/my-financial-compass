import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Mot de passe mis à jour");
    navigate({ to: "/dashboard" });
  }
  return (
    <div className="grid-bg flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-md border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Nouveau mot de passe</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">Mot de passe</Label>
          <Input id="pw" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "..." : "Mettre à jour"}</Button>
      </form>
    </div>
  );
}
