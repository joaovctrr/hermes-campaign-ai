import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { BarChart3, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sentiment")({
  component: SentimentPage,
});

function SentimentPage() {
  return (
    <AppShell
      title="Termômetro Social"
      subtitle="Análise de sentimento dos comentários do seu Instagram."
    >
      <div className="rounded-xl border border-border bg-card p-12 max-w-2xl mx-auto text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary mb-4">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="font-serif text-2xl">Disponível no plano Avançado</h2>
        <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
          O Termômetro Social conecta o Instagram do candidato via Meta API, classifica
          comentários (Apoio, Crítica, Ataque/Troll, Dúvida) e identifica top defensores e detratores
          para mobilização de base.
        </p>
        <div className="mt-8 grid grid-cols-3 gap-4 max-w-md mx-auto text-xs text-muted-foreground">
          <Stat label="Sentimento" value="—" />
          <Stat label="Apoio" value="—" />
          <Stat label="Ataques" value="—" />
        </div>
        <div className="mt-8 inline-flex items-center gap-2 text-xs text-gold">
          <BarChart3 className="h-3.5 w-3.5" /> Em breve
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="font-serif text-xl text-foreground">{value}</div>
      <div className="mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}
