import { ClickAction } from './constants';

export type ModifierFallbackEvent = {
  combination: string;
  resolvedAction: ClickAction;
  reason: 'missing' | 'invalid' | 'unassigned';
};

export const reportModifierFallback = (event: ModifierFallbackEvent) => {
  console.info('UnbreakLink modifier fallback', event);
};
