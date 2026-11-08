/** Un outil que le modèle peut demander. Tout ce qui est permis est décidé ici, côté serveur. */
export type ToolRisk = 'read' | 'sensitive';

export interface ToolContext {
  /** L'utilisateur de la session. Ne vient jamais d'un argument donné par le modèle. */
  userId: string;
  conversationId: string;
  signal?: AbortSignal;
}

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  enum?: readonly (string | number)[];
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: readonly string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolSchema;
  /** `sensitive` : jamais exécuté sans l'accord explicite de l'utilisateur. */
  risk: ToolRisk;
  /** Phrase affichée à l'utilisateur pour lui demander son accord (outils sensibles). */
  describeAction?: (args: Record<string, unknown>) => string;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<string>;
}

/** Un appel demandé par le modèle, avant toute vérification. */
export interface ModelToolCall {
  name: string;
  arguments: unknown;
}

export type AuditStatus =
  | 'executed'
  | 'error'
  | 'rejected'
  | 'confirmation_requested'
  | 'confirmed'
  | 'denied'
  | 'expired';

export interface AuditEntry {
  id: string;
  userId: string;
  conversationId: string | null;
  tool: string;
  args: unknown;
  status: AuditStatus;
  detail: string | null;
  createdAt: Date;
}

export interface PendingAction {
  id: string;
  userId: string;
  conversationId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  expiresAt: Date;
}
