import { stepStatusLabel, stepsSummary, toolLabel } from '../../lib/tools';
import type { StepInfo } from '../../types/chat';

interface ChatStepsProps {
  steps: StepInfo[];
  budgetExhausted?: boolean;
  /** Vrai pendant que la réponse se construit : la liste est ouverte et se remplit. */
  live?: boolean;
}

/** Ce que l'agent a fait pour répondre : chaque outil demandé et ce que le serveur en a fait. */
export function ChatSteps({ steps, budgetExhausted = false, live = false }: ChatStepsProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <details className="chat-steps" open={live}>
      <summary className="chat-sources__summary">{stepsSummary(steps, budgetExhausted)}</summary>
      <ol className="chat-steps__list">
        {steps.map((step) => (
          <li key={step.step} className={`chat-steps__item chat-steps__item--${step.status}`}>
            <span className="chat-steps__title">
              {toolLabel(step.tool)} <em>({stepStatusLabel(step.status)})</em>
            </span>
            <code className="chat-steps__args">{step.args}</code>
            {step.preview ? <span className="chat-sources__snippet">{step.preview}</span> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
