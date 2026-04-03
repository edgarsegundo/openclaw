/**
 * Resolve a dot-notation key (e.g. "cluster.allSlugs") against a vars object.
 * Falls back to a flat lookup first so plain keys still work.
 */
function resolveDotNotation(vars, key) {
  // Try flat key first (covers simple cases and avoids splitting "my.key" accidentally)
  if (key in vars) return vars[key];
  // Walk dot path
  const parts = key.split(".");
  let cur = vars;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Renders a prompt template by replacing {{variable}} placeholders.
 * Supports dot-notation keys (e.g. {{cluster.allSlugs}}).
 * vars: plain object of string-keyed values.
 */
export function renderPrompt(templateText, vars = {}) {
  return templateText.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (match, key) => {
    const k = key.trim();
    const value = resolveDotNotation(vars, k);
    if (value === undefined || value === null) {
      return match;
    } // leave unresolved for warning
    if (Array.isArray(value)) {
      return value.join(", ");
    }
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
