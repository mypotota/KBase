export type OutlineEntry = { level: number; text: string; pos: number };

type OutlineNode = {
  type: { name: string };
  attrs?: Record<string, unknown>;
  textContent: string;
};

type OutlineSource = {
  state: {
    doc: {
      descendants: (
        visit: (node: OutlineNode, pos: number) => boolean,
      ) => void;
    };
  };
};

// Headings of the current document, at any nesting depth, with their level so
// the outline can indent them.
export function outlineOf(source: OutlineSource | null): OutlineEntry[] {
  if (!source) return [];
  const entries: OutlineEntry[] = [];
  source.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading")
      entries.push({
        level: Number(node.attrs?.level ?? 1),
        text: node.textContent,
        pos,
      });
    return true;
  });
  return entries;
}
