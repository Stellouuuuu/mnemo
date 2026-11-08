export interface AuditItem {
  id: string;
  tool: string;
  status: string;
  detail: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  executed: 'Exécuté',
  error: 'Échec',
  rejected: 'Refusé par le serveur',
  confirmation_requested: 'Accord demandé',
  confirmed: 'Autorisé par vous',
  denied: 'Refusé par vous',
  expired: 'Demande expirée',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Vrai pour les lignes qui montrent qu'une action a réellement eu lieu. */
export function tookEffect(status: string): boolean {
  return status === 'executed' || status === 'confirmed';
}

export function summarize(items: AuditItem[]): { executed: number; blocked: number; waiting: number } {
  return {
    executed: items.filter((i) => i.status === 'executed' || i.status === 'confirmed').length,
    blocked: items.filter((i) => i.status === 'rejected' || i.status === 'denied' || i.status === 'expired').length,
    waiting: items.filter((i) => i.status === 'confirmation_requested').length,
  };
}
