import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { ALLOWED_MEMORY_KEYS, MEMORY_KEY_LABELS } from '../memory/memory-schema.js';
import type { MemoryService } from '../memory/memory.service.js';
import { redactInstructions } from '../knowledge/instruction-filter.js';
import { CalculatorError, evaluateExpression } from './calculator.js';
import type { ToolDefinition } from './types.js';

const EXCERPT_CHARS = 500;

export interface ToolDependencies {
  knowledge: KnowledgeService;
  memory: MemoryService;
}

/**
 * Les outils de Mnemo. Chacun reçoit l'identité de l'utilisateur depuis la session (`context`),
 * jamais depuis les arguments du modèle : un modèle manipulé ne peut donc pas agir au nom
 * d'un autre compte.
 */
export function createTools({ knowledge, memory }: ToolDependencies): ToolDefinition[] {
  const calculator: ToolDefinition = {
    name: 'calculator',
    description:
      "Calcule une expression arithmétique (+ - * / % ^ et parenthèses). À utiliser pour tout calcul : ne calcule pas de tête.",
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Ex. : (12 + 8) * 3', maxLength: 200 },
      },
      required: ['expression'],
    },
    risk: 'read',
    async execute(args) {
      const expression = String(args.expression);
      try {
        return `${expression} = ${evaluateExpression(expression)}`;
      } catch (error) {
        if (error instanceof CalculatorError) {
          return `Calcul impossible : ${error.message}`;
        }
        throw error;
      }
    },
  };

  const searchDocuments: ToolDefinition = {
    name: 'search_documents',
    description:
      "Cherche dans les documents que l'utilisateur a ajoutés (cours, notes). À utiliser quand la question porte sur ses documents.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Ce qu’on cherche, en une phrase', maxLength: 300 },
      },
      required: ['query'],
    },
    risk: 'read',
    async execute(args, context) {
      const hits = await knowledge.search(context.userId, String(args.query));
      if (hits.length === 0) {
        return 'Aucun passage pertinent dans les documents.';
      }
      return hits
        .map((hit, index) => {
          const where = hit.page ? `${hit.title}, page ${hit.page}` : hit.title;
          const text = redactInstructions(hit.content).text.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS);
          return `[${index + 1}] ${where} : ${text}`;
        })
        .join('\n');
    },
  };

  const listDocuments: ToolDefinition = {
    name: 'list_documents',
    description:
      "Liste les documents que l'utilisateur a ajoutés (titres, taille). À utiliser avant de chercher dedans, ou quand il demande ce qu'il a ajouté.",
    parameters: { type: 'object', properties: {} },
    risk: 'read',
    async execute(_args, context) {
      const documents = await knowledge.listDocuments(context.userId);
      if (documents.length === 0) {
        return "L'utilisateur n'a ajouté aucun document.";
      }
      return documents
        .map((doc, index) => `${index + 1}. ${doc.title} (${doc.chunkCount} passages)`)
        .join('\n');
    },
  };

  const deleteMemory: ToolDefinition = {
    name: 'delete_memory',
    description:
      "Efface un souvenir sur l'utilisateur (par exemple son prénom). Demande toujours son accord : à n'utiliser que s'il le demande lui-même.",
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Le souvenir à effacer',
          enum: [...ALLOWED_MEMORY_KEYS],
        },
      },
      required: ['key'],
    },
    risk: 'sensitive',
    describeAction(args) {
      const label = MEMORY_KEY_LABELS[args.key as keyof typeof MEMORY_KEY_LABELS] ?? String(args.key);
      return `Effacer ce que Mnemo sait de vous : « ${label} »`;
    },
    async execute(args, context) {
      const existing = await memory.getMemoryByKey(context.userId, String(args.key));
      if (!existing) {
        return "Ce souvenir n'existe pas.";
      }
      await memory.deleteMemory(context.userId, existing.id);
      const label = MEMORY_KEY_LABELS[existing.key as keyof typeof MEMORY_KEY_LABELS] ?? existing.key;
      return `Souvenir « ${label} » effacé.`;
    },
  };

  return [calculator, listDocuments, searchDocuments, deleteMemory];
}
