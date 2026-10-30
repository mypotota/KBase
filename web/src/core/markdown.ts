// Rich editing is disabled for constructs the current editor cannot round-trip safely.
// The exact original source is kept until the user explicitly edits it.

// Leading YAML frontmatter is split off verbatim: it never enters the editor,
// so it can never be rewritten, and it does not force source mode.
export function splitFrontmatter(markdown: string): { front: string; body: string } {
  const match = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!match) return { front: "", body: markdown };
  return { front: markdown.slice(0, match[0].length), body: markdown.slice(match[0].length) };
}

// Fenced code blocks and inline code spans are preserved verbatim by the
// editor, so constructs that merely look like syntax (Java generics such as
// List<String> or `WeakReference<Activity>`, mermaid sources, link maps inside
// examples) must not trigger source mode.
function outsideFences(markdown: string): string {
  const kept: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^[ \t]*(```|~~~)/.exec(line);
    if (fence) {
      if (marker && line.trim().startsWith(fence)) {
        fence = null;
        kept.push("");
      }
      continue;
    }
    if (marker) {
      fence = marker[1];
      kept.push("");
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/`[^`\n]*`/g, "");
}

export function requiresSource(markdown: string) {
  const text = outsideFences(markdown);
  return (
    /<\/?[a-zA-Z][^>]*>/.test(text) ||
    /^\[\^[^\]]+\]:/m.test(text) ||
    /\[\^[^\]]+\]/.test(text) ||
    /^\s*(\$\$|:::|\[toc\])/im.test(text) ||
    /^\s*\[[^\]]+\]:/m.test(text) ||
    /^\s*<\!--/m.test(text)
  );
}
