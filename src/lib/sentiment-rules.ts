export type SentimentLabel = "positivo" | "neutro" | "negativo";

export type SentimentRuleProfile = {
  full_name?: string | null;
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  tiktok_handle?: string | null;
  facebook_handle?: string | null;
  mention_keywords?: string[] | null;
};

export function inferSentimentForCandidate(content: string, aliases: string[]): SentimentLabel {
  const text = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  const negativeStrong = [
    "acabou",
    "absurdo",
    "burro",
    "cade",
    "cala boca",
    "cansado",
    "corrupt",
    "criminos",
    "critica",
    "covarde",
    "decepcao",
    "decepcion",
    "demagog",
    "descaso",
    "desonest",
    "devia ter vergonha",
    "engan",
    "facil falar",
    "fake",
    "fora",
    "fraco",
    "hipocri",
    "horrivel",
    "incompet",
    "ladrao",
    "lixo",
    "mentir",
    "mentiros",
    "nao acredito",
    "nao aprovo",
    "nao da",
    "nao fez",
    "nao faz",
    "nao gostei",
    "nao presta",
    "omiss",
    "palhac",
    "pare de",
    "perdeu",
    "pessim",
    "piada",
    "promessa",
    "ridicul",
    "safad",
    "sumiu",
    "vergonhoso",
    "vergonha",
  ];
  const positiveStrong = [
    "abraco",
    "apoio",
    "apoiado",
    "apoiamos",
    "aprov",
    "bravo",
    "concordo",
    "defende",
    "defender",
    "defesa",
    "deus abencoe",
    "diferenciado",
    "excelente",
    "fechado",
    "felicit",
    "forca",
    "gratid",
    "honra",
    "honesto",
    "juntos",
    "lider",
    "merece",
    "melhor",
    "obrigad",
    "orgulho",
    "parabens",
    "perfeito",
    "representa",
    "respeito",
    "show",
    "top",
    "bom trabalho",
    "excelente trabalho",
    "grande trabalho",
    "unico q defende",
    "unico que defende",
    "vamos juntos",
  ];
  const neutralizingThirdParty = [
    "lula",
    "bolsonaro",
    "governador",
    "prefeito",
    "presidente",
    "ministro",
  ];

  const positiveEmoji =
    /[\u{1f44f}\u{1f44d}\u{1f4aa}\u{1f64c}\u{1f64f}\u{1f3c6}\u{1f947}\u{2764}\u{1f499}\u{1f49a}]/u;
  const negativeEmoji = /[\u{1f44e}\u{1f621}\u{1f620}\u{1f92e}\u{1f921}]/u;

  const directTarget = hasDirectTarget(text, aliases);
  const secondPerson =
    /\b(voce|vc|vcs|seu|sua|teu|tua|parabens|obrigad[oa]|gonzaga|deputad[oa])\b/.test(text);
  const likelyAboutTarget = directTarget || secondPerson || aliases.length === 0;
  const mentionsThirdParty = neutralizingThirdParty.some((term) => text.includes(term));
  const neutralGreeting =
    /^(bom dia|boa tarde|boa noite|bom domingo|boa semana)[!. ]*$/.test(text) ||
    /^(bom dia|boa tarde|boa noite|bom domingo|boa semana)\b/.test(text);

  const neg =
    negativeStrong.filter((term) => text.includes(term)).length +
    (negativeEmoji.test(content) ? 1 : 0);
  const pos =
    positiveStrong.filter((term) => text.includes(term)).length +
    (positiveEmoji.test(content) ? 1 : 0);

  if (neutralGreeting && pos <= 1 && neg === 0) return "neutro";
  if (neg > 0 && neg >= pos && (likelyAboutTarget || !mentionsThirdParty)) return "negativo";
  if (pos > 0 && (likelyAboutTarget || !mentionsThirdParty)) return "positivo";
  return "neutro";
}

export function buildCandidateAliases(profile: SentimentRuleProfile) {
  const aliases = new Set<string>();
  for (const value of [
    profile.full_name,
    profile.instagram_handle,
    profile.twitter_handle,
    profile.tiktok_handle,
    profile.facebook_handle,
    ...(profile.mention_keywords ?? []),
  ]) {
    const normalized = normalizeText(value ?? "");
    if (!normalized) continue;
    aliases.add(normalized.replace(/^@/, ""));
    const parts = normalized.split(/\s+/).filter((part) => part.length >= 3);
    if (parts.length) aliases.add(parts.at(-1)!);
  }
  return [...aliases].filter((alias) => alias.length >= 3).slice(0, 12);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[@#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDirectTarget(text: string, aliases: string[]) {
  return aliases.some((alias) => {
    if (alias.length < 3) return false;
    return text.includes(alias);
  });
}
