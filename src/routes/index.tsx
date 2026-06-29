import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Newspaper, Brain, Megaphone, ShieldAlert, Clock, Sparkles } from "lucide-react";
import logo from "@/assets/informa-agora-logo-transparent.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Informa Ágora — Inteligência política antes do debate" },
      {
        name: "description",
        content:
          "Curadoria automática de notícias, análise estratégica e geração de conteúdo para mandatos e campanhas. Controle a narrativa antes que ela controle você.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Pains />
      <HowItWorks />
      <Pricing />
      <Closing />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container-prose flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="Informa Ágora" className="h-10 w-auto object-contain" />
          <span className="font-serif text-xl tracking-tight">Informa Ágora</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#como-funciona" className="hover:text-foreground transition">
            Como funciona
          </a>
          <a href="#planos" className="hover:text-foreground transition">
            Planos
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm">
              Entrar
            </Button>
          </Link>
          <Link to="/auth">
            <Button size="sm">Solicitar acesso</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div className="container-prose py-24 md:py-32 grid gap-12 md:grid-cols-[1.2fr_1fr] items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Inteligência política em tempo real
          </div>
          <h1 className="mt-6 font-serif text-5xl md:text-6xl leading-[1.05] tracking-tight">
            A inteligência artificial que antecipa o debate.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            Informa Ágora lê o noticiário regional, identifica o que pode virar crise e entrega o
            roteiro pronto para o seu posicionamento antes que a narrativa fuja do controle.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/auth">
              <Button size="lg">Começar trial de 3 dias</Button>
            </Link>
            <a href="#como-funciona">
              <Button size="lg" variant="outline">
                Ver como funciona
              </Button>
            </a>
          </div>
        </div>
        <aside className="relative">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
              Aviso crítico · há 12 min
            </div>
            <h3 className="mt-2 font-serif text-xl">
              Operação policial em Venda Nova mobiliza moradores
            </h3>
            <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
              Reportagem do Estado de Minas aponta apreensão de armas e dois feridos. Repercussão
              alta nas redes regionais. Recomenda-se posicionamento ainda hoje.
            </p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Segurança Pública
              </span>
              <span className="text-xs rounded-full bg-gold/15 text-gold-foreground border border-gold/40 px-2 py-0.5">
                Urgência alta
              </span>
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 hidden md:block rounded-xl border border-border bg-card px-4 py-3 text-xs shadow-[var(--shadow-card)]">
            <span className="text-muted-foreground">Resposta sugerida em</span>
            <div className="font-serif text-2xl">28 segundos</div>
          </div>
        </aside>
      </div>
    </section>
  );
}

const PAINS = [
  {
    icon: Clock,
    title: "Sem tempo para ler jornais",
    text: "Informa Ágora resume o que importa em 2 frases por matéria, por tema e por região.",
  },
  {
    icon: ShieldAlert,
    title: "Risco de cancelamento",
    text: "Alertas de urgência destacam pautas com potencial de crise antes que a oposição reaja.",
  },
  {
    icon: Sparkles,
    title: "Lentidão para criar conteúdo",
    text: "Roteiros prontos para Instagram, Reels e X em segundos, no seu tom de voz.",
  },
];

function Pains() {
  return (
    <section className="border-b border-border/60 bg-secondary/40">
      <div className="container-prose py-20">
        <h2 className="font-serif text-3xl md:text-4xl max-w-2xl">
          Mandato moderno não perde no conteúdo. Perde no tempo.
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PAINS.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-card p-6">
              <p.icon className="h-5 w-5 text-gold" />
              <h3 className="mt-4 font-serif text-xl">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    icon: Newspaper,
    title: "Coleta de notícias",
    text: "Cron de 3 em 3 horas varre veículos regionais e nacionais sobre os temas que você monitora.",
  },
  {
    n: "02",
    icon: Brain,
    title: "Análise Informa Ágora",
    text: "IA classifica tema, sentimento e urgência. Crises sobem ao topo do radar com aviso crítico.",
  },
  {
    n: "03",
    icon: Megaphone,
    title: "Estratégia de conteúdo",
    text: "Em um clique, roteiro pronto para carrossel, vídeo curto ou thread, no tom do candidato.",
  },
];

function HowItWorks() {
  return (
    <section id="como-funciona" className="border-b border-border/60">
      <div className="container-prose py-24">
        <div className="max-w-2xl">
          <span className="text-xs uppercase tracking-[0.2em] text-gold">Como funciona</span>
          <h2 className="mt-3 font-serif text-3xl md:text-4xl">
            Três passos entre a notícia e o post.
          </h2>
        </div>
        <div className="mt-14 grid gap-px bg-border border border-border rounded-xl overflow-hidden md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-card p-8">
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-3xl text-muted-foreground/60">{s.n}</span>
                <s.icon className="h-5 w-5 text-gold" />
              </div>
              <h3 className="mt-4 font-serif text-xl">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PLANS = [
  {
    name: "Básico",
    role: "O Iniciante",
    price: "R$ 497",
    desc: "Para vereadores e equipes enxutas que precisam começar sem estrutura complexa.",
    features: [
      "1 usuário",
      "Radar a cada 24h",
      "3 postagens com IA / mês",
      "1 arquivo na memória legislativa",
      "Sem painel de inteligência",
    ],
  },
  {
    name: "Avançado",
    role: "O Estrategista",
    price: "R$ 1.497",
    desc: "O plano mais indicado para disputar narrativa com rotina real de comunicação.",
    features: [
      "3 dias grátis no trial",
      "Até 3 usuários",
      "Radar a cada 12h",
      "30 postagens com IA / mês",
      "10 arquivos na memória legislativa",
      "Painel de inteligência liberado",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    role: "O Centro de Comando",
    price: "R$ 2.497",
    desc: "Para prefeituras, campanhas majoritárias e diretórios que precisam operar em escala.",
    features: [
      "Até 15 usuários",
      "Atualização sob demanda",
      "Postagens ilimitadas",
      "Arquivos ilimitados na memória",
      "Alertas de picos negativos",
      "Onboarding dedicado",
    ],
    consult: true,
  },
];

function Pricing() {
  return (
    <section id="planos" className="border-b border-border/60 bg-secondary/40">
      <div className="container-prose py-24">
        <div className="max-w-2xl">
          <span className="text-xs uppercase tracking-[0.2em] text-gold">Planos</span>
          <h2 className="mt-3 font-serif text-3xl md:text-4xl">
            Investimento estratégico, não custo operacional.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Cada plano é um seguro contra crise e um acelerador de pauta. Cobramos pelo valor
            entregue.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-xl border bg-card p-8 flex flex-col ${
                p.featured ? "border-gold shadow-[var(--shadow-elegant)]" : "border-border"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-serif text-2xl">{p.name}</h3>
                {p.featured && (
                  <span className="text-[10px] uppercase tracking-wider rounded-full border border-gold text-gold px-2 py-0.5">
                    Mais escolhido
                  </span>
                )}
              </div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
                {p.role}
              </p>
              <div className="mt-6 font-serif text-4xl">
                {p.price}
                <span className="text-base text-muted-foreground font-sans">/mês</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{p.desc}</p>
              <ul className="mt-6 space-y-2 text-sm flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-gold">›</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link to="/auth" className="mt-8">
                <Button className="w-full" variant={p.featured ? "default" : "outline"}>
                  {p.consult
                    ? "Falar com consultor"
                    : p.featured
                      ? "Começar trial"
                      : "Solicitar avaliação"}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="border-b border-border/60">
      <div className="container-prose py-24 text-center">
        <h2 className="font-serif text-4xl md:text-5xl max-w-3xl mx-auto">
          A próxima crise não vai esperar a coletiva de quinta.
        </h2>
        <p className="mt-6 text-muted-foreground max-w-xl mx-auto">
          Comece hoje. Em 5 minutos seu radar está calibrado e o primeiro post sai pronto para
          revisão.
        </p>
        <Link to="/auth" className="inline-block mt-10">
          <Button size="lg">Entrar no Informa Ágora</Button>
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-background">
      <div className="container-prose py-10 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Informa Ágora Inteligência Política</span>
        <span className="text-xs">
          Conteúdo gerado pode ser produzido com auxílio de IA — sempre rotulado conforme exige a
          legislação eleitoral.
        </span>
      </div>
    </footer>
  );
}
