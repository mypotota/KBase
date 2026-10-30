// Rich editing is disabled for constructs the current editor cannot round-trip safely.
// The exact original source is kept until the user explicitly edits it.
export function requiresSource(markdown: string) {
  return (
    /^---\s*\r?\n/.test(markdown) ||
    /<\/?[a-zA-Z][^>]*>/.test(markdown) ||
    /^\[\^[^\]]+\]:/m.test(markdown) ||
    /\[\^[^\]]+\]/.test(markdown) ||
    /^\s*(\$\$|:::|\[toc\])/im.test(markdown) ||
    /^\s*\[[^\]]+\]:/m.test(markdown) ||
    /^\s*<\!--/m.test(markdown)
  );
}
