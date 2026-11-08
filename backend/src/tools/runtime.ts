import { randomUUID } from 'node:crypto';
import { validateArguments } from './schema.js';
import type { AuditStore } from './audit-store.js';
import type {
  ModelToolCall,
  PendingAction,
  ToolContext,
  ToolDefinition,
} from './types.js';

const TOOL_TIMEOUT_MS = 5_000;
const OUTPUT_MAX_CHARS = 2_000;
const PENDING_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_PER_USER = 5;

export type ToolOutcome =
  | { kind: 'result'; tool: string; output: string }
  | { kind: 'rejected'; tool: string; output: string }
  | { kind: 'confirmation'; tool: string; output: string; action: PendingAction };

export type ConfirmationResult =
  | { ok: true; tool: string; conversationId: string; output: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'failed' };

/** Définition d'outil au format attendu par Ollama. */
export interface ModelToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: ToolDefinition['parameters'] };
}

/** Texte renvoyé au modèle : sans caractères de contrôle et borné. */
function cleanOutput(text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  return clean.length > OUTPUT_MAX_CHARS ? `${clean.slice(0, OUTPUT_MAX_CHARS - 1)}…` : clean;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tool-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Applique les règles d'usage des outils. Le modèle ne fait que demander : c'est ce code qui
 * décide si l'appel a lieu. Un outil inconnu, des arguments invalides ou une action sensible
 * sans accord de l'utilisateur ne s'exécutent jamais.
 */
export class ToolRuntime {
  private readonly byName: Map<string, ToolDefinition>;
  private readonly pending = new Map<string, PendingAction>();

  constructor(
    tools: ToolDefinition[],
    private readonly audit: AuditStore,
    private readonly now: () => number = Date.now,
  ) {
    this.byName = new Map(tools.map((tool) => [tool.name, tool]));
  }

  definitionsForModel(): ModelToolDefinition[] {
    return [...this.byName.values()].map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  /** Traite un appel demandé par le modèle. Ne lève jamais d'exception. */
  async handleCall(call: ModelToolCall, context: ToolContext): Promise<ToolOutcome> {
    const base = { userId: context.userId, conversationId: context.conversationId };
    const tool = this.byName.get(call.name);

    if (!tool) {
      await this.audit.record({ ...base, tool: call.name, args: call.arguments, status: 'rejected', detail: 'outil inconnu' });
      return { kind: 'rejected', tool: call.name, output: `Outil inconnu : « ${call.name} ». Il n'a pas été exécuté.` };
    }

    const checked = validateArguments(tool.parameters, call.arguments);
    if (!checked.ok) {
      await this.audit.record({ ...base, tool: tool.name, args: call.arguments, status: 'rejected', detail: checked.error });
      return { kind: 'rejected', tool: tool.name, output: `Appel refusé : ${checked.error}` };
    }

    if (tool.risk === 'sensitive') {
      const action = this.createPending(tool, checked.args, context);
      await this.audit.record({ ...base, tool: tool.name, args: checked.args, status: 'confirmation_requested', detail: action.summary });
      return {
        kind: 'confirmation',
        tool: tool.name,
        action,
        output:
          "Cette action demande l'accord de l'utilisateur et n'a PAS été exécutée. Dis-lui qu'elle attend sa confirmation.",
      };
    }

    return this.run(tool, checked.args, context);
  }

  private async run(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolOutcome> {
    const base = { userId: context.userId, conversationId: context.conversationId };
    try {
      const output = cleanOutput(await withTimeout(tool.execute(args, context), TOOL_TIMEOUT_MS));
      await this.audit.record({ ...base, tool: tool.name, args, status: 'executed' });
      return { kind: 'result', tool: tool.name, output };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'erreur inconnue';
      await this.audit.record({ ...base, tool: tool.name, args, status: 'error', detail });
      return { kind: 'result', tool: tool.name, output: "L'outil a échoué : aucun résultat." };
    }
  }

  private createPending(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    context: ToolContext,
  ): PendingAction {
    this.purgeExpired();
    const mine = [...this.pending.values()]
      .filter((a) => a.userId === context.userId)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
    while (mine.length >= MAX_PENDING_PER_USER) {
      this.pending.delete(mine.shift()!.id);
    }

    const action: PendingAction = {
      id: randomUUID(),
      userId: context.userId,
      conversationId: context.conversationId,
      tool: tool.name,
      args,
      summary: tool.describeAction ? tool.describeAction(args) : `Exécuter ${tool.name}`,
      expiresAt: new Date(this.now() + PENDING_TTL_MS),
    };
    this.pending.set(action.id, action);
    return action;
  }

  private purgeExpired(): void {
    for (const [id, action] of this.pending) {
      if (action.expiresAt.getTime() <= this.now()) {
        this.pending.delete(id);
      }
    }
  }

  listPending(userId: string): PendingAction[] {
    this.purgeExpired();
    return [...this.pending.values()].filter((a) => a.userId === userId);
  }

  /** L'utilisateur autorise l'action : elle est exécutée une seule fois, avec ses propres droits. */
  async confirm(userId: string, actionId: string, signal?: AbortSignal): Promise<ConfirmationResult> {
    const action = this.pending.get(actionId);
    if (!action || action.userId !== userId) {
      return { ok: false, reason: 'not_found' };
    }
    this.pending.delete(actionId);

    const base = { userId, conversationId: action.conversationId, tool: action.tool, args: action.args };
    if (action.expiresAt.getTime() <= this.now()) {
      await this.audit.record({ ...base, status: 'expired' });
      return { ok: false, reason: 'expired' };
    }

    const tool = this.byName.get(action.tool);
    if (!tool) {
      return { ok: false, reason: 'failed' };
    }
    await this.audit.record({ ...base, status: 'confirmed' });
    const outcome = await this.run(tool, action.args, {
      userId,
      conversationId: action.conversationId,
      signal,
    });
    return outcome.output.startsWith("L'outil a échoué")
      ? { ok: false, reason: 'failed' }
      : { ok: true, tool: action.tool, conversationId: action.conversationId, output: outcome.output };
  }

  async deny(userId: string, actionId: string): Promise<boolean> {
    const action = this.pending.get(actionId);
    if (!action || action.userId !== userId) {
      return false;
    }
    this.pending.delete(actionId);
    await this.audit.record({
      userId,
      conversationId: action.conversationId,
      tool: action.tool,
      args: action.args,
      status: 'denied',
    });
    return true;
  }
}
