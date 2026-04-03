/**
 * Renders a prompt template by replacing {{variable}} placeholders.
 * vars: plain object of string-keyed values.
 */
export function renderPrompt(templateText, vars = {}) {
  return templateText.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, key) => {
    const k = key.trim();
    const value = vars[k];
    if (value === undefined || value === null) {
      return match;
    } // leave unresolved for warning
    return String(value);
  });
}

/**
 * Merge variables from multiple sources (later sources win, but task inputs from context
 * are the base; extraVars passed at call-time win over everything except reserved fields).
 *
 * Priority (highest last wins):
 *   taskInputs → templateInputDefaults → contextFields → extraVars
 */
export function mergeVars(
  taskInputs = {},
  templateInputDefaults = {},
  contextFields = {},
  extraVars = {},
) {
  return {
    ...taskInputs,
    ...templateInputDefaults,
    ...contextFields,
    ...extraVars,
  };
}

/**
 * Log warnings for any unresolved {{vars}} still present in rendered text.
 * Returns the list of unresolved variable names.
 */
export function warnUnresolvedVars(renderedText, templateName, logger) {
  const matches = [...renderedText.matchAll(/\{\{(\s*[\w.]+\s*)\}\}/g)];
  if (matches.length === 0) {
    return [];
  }
  const unresolved = matches.map((m) => m[1].trim());
  if (logger) {
    for (const v of unresolved) {
      logger.warn(`[prompt-render] Template "${templateName}" has unresolved variable: {{${v}}}`);
    }
  }
  return unresolved;
}
