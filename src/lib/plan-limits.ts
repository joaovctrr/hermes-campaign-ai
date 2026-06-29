/**
 * Manual refresh cooldown windows per plan. Cron has its own ceilings.
 */
export type Plan =
  | "bloqueado"
  | "basico"
  | "trial_avancado"
  | "avancado"
  | "enterprise"
  | string
  | null
  | undefined;

export function manualCooldownHours(plan: Plan): number {
  if (plan === "enterprise") return 0;
  if (plan === "avancado" || plan === "trial_avancado") return 12;
  return 24;
}

export function planLabel(plan: Plan): string {
  if (plan === "bloqueado") return "Bloqueado";
  if (plan === "trial_avancado") return "Trial Avançado";
  if (plan === "enterprise") return "Enterprise";
  if (plan === "avancado") return "Avançado";
  return "Básico";
}

export function formatCooldownRemaining(ms: number): string {
  if (ms <= 0) return "agora";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h${m ? ` ${m}min` : ""}`;
  return `${Math.max(1, m)}min`;
}
