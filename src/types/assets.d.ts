/**
 * GrammarLens — Asset Module Declarations
 * Tells TypeScript that .html and panel .css imports are raw strings
 * (webpack asset/source loader returns the file content as a string).
 */

/** Raw HTML template strings imported by panel.ts via webpack asset/source */
declare module '*.html' {
  const markup: string;
  export default markup;
}

/**
 * CSS files NOT processed by MiniCssExtractPlugin.
 * panel.css is imported as a raw string for injection into Shadow DOM.
 */
declare module '*.css' {
  const content: string;
  export default content;
}
