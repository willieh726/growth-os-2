/**
 * Central AI model configuration.
 * Update this file when Anthropic releases new models or deprecates old ones.
 * All API routes import from here — one change covers everything.
 */

/** Fast model — used for audit, email, call-script generation */
export const FAST_MODEL = "claude-haiku-4-5";

/** Powerful model — reserved for future complex reasoning tasks */
export const SMART_MODEL = "claude-sonnet-5-5";
