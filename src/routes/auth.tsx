import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Activity, Lock } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Connexion — Personal CFO" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [signupOpen, setSignupOpen] = useState<boolean>(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
    supabase.rpc("is_signup_open").then(({ data }) => setSignupOpen(Boolean(data)));
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Connecté");
        navigate({ to: "/dashboard" });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.user) {
          const { error: pErr } = await supabase.from("profiles").insert({ id: data.user.id, full_name: name || email });
          if (pErr) throw new Error(pErr.message);
        }
        toast.success("Compte propriétaire créé");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        toast.success("Email de réinitialisation envoyé");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-sm bg-primary text-primary-foreground"><Activity className="h-5 w-5" /></div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Personal CFO</div>
            <div className="text-lg font-semibold">Terminal financier</div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-6 shadow-2xl shadow-black/40">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold">
                {mode === "login" ? "Connexion propriétaire" : mode === "signup" ? "Initialiser le terminal" : "Réinitialiser le mot de passe"}
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <Lock className="mr-1 inline h-3 w-3" /> instance privée — un seul utilisateur
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nom</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
              </div>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "..." : mode === "login" ? "Se connecter" : mode === "signup" ? "Créer le compte" : "Envoyer le lien"}
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => setMode("reset")} className="hover:text-foreground">Mot de passe oublié ?</button>
                {signupOpen && (
                  <button type="button" onClick={() => setMode("signup")} className="hover:text-foreground">Initialiser le terminal</button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => setMode("login")} className="hover:text-foreground">← Retour à la connexion</button>
            )}
          </div>
          {!signupOpen && mode === "login" && (
            <p className="mt-4 rounded border border-border bg-muted/40 p-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Inscription désactivée — propriétaire déjà enregistré.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
