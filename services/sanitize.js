// ─── Input Sanitizer ──────────────────────────────────────────
// Wraps user-controlled text in XML tags before Claude injection.
// Prevents user data from being interpreted as instructions.

const INSTRUCTION_PATTERNS = [
  /ignore (previous|above|all) instructions/i,
  /you are now/i,
  /new instructions:/i,
  /system prompt/i,
  /disregard/i,
  /forget everything/i,
  /act as/i,
  /jailbreak/i,
];

/**
 * Sanitize a user-supplied string before injecting into Claude context.
 * Wraps in XML tags and checks for instruction-like patterns.
 */
export function sanitizeUserInput(text, fieldName = 'user_data') {
  if (!text || typeof text !== 'string') return '';
  
  const trimmed = text.trim().slice(0, 1000);
  
  const hasInjection = INSTRUCTION_PATTERNS.some(p => p.test(trimmed));
  if (hasInjection) {
    console.warn(`[Sanitize] Possible prompt injection in ${fieldName}: ${trimmed.slice(0, 100)}`);
    return `<${fieldName}>[content removed — policy violation]</${fieldName}>`;
  }
  
  return `<${fieldName}>${trimmed}</${fieldName}>`;
}

/**
 * Sanitize all user-controlled fields before building Claude context.
 */
export function sanitizeContextFields({ goals_text, dietary_restrictions, health_concerns, supplement_names }) {
  return {
    goals_text: sanitizeUserInput(goals_text, 'goals'),
    dietary_restrictions: sanitizeUserInput(dietary_restrictions, 'dietary_restrictions'),
    health_concerns: sanitizeUserInput(health_concerns, 'health_concerns'),
    supplement_names: (supplement_names || []).map(n => sanitizeUserInput(n, 'supplement')),
  };
}