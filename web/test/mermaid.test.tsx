// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect } from "vitest";
import MarkdownEditor from "../src/MarkdownEditor";
import type { Editor } from "@tiptap/react";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const diagram = `\`\`\`mermaid
flowchart LR
  A[Runnable] --> B[Executor]
  B --> C[Thread]
\`\`\`
`;

async function render(value: string) {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  let editor: Editor | null = null;
  await act(async () =>
    root.render(
      <MarkdownEditor
        value={value}
        onChange={() => {}}
        readOnly={false}
        onReady={(value) => {
          editor = value;
        }}
        onSlash={() => {}}
        resolveImage={async () => ""}
        onImage={async () => ""}
      />,
    ),
  );
  return { element, root, editor: editor! };
}

describe("mermaid code blocks", () => {
  it("marks diagram fences and keeps their source and Markdown intact", async () => {
    const { element, root, editor } = await render(diagram);
    expect(editor).toBeTruthy();
    const node = document.querySelector(".mermaid-node");
    expect(node).toBeTruthy();
    expect(node?.className).toContain("is-diagram");
    expect(node?.getAttribute("data-language")).toBe("mermaid");
    // the source stays in the document and the fence survives serialization
    expect(node?.textContent).toContain("flowchart LR");
    expect(editor.getMarkdown()).toContain("```mermaid");
    expect(editor.getMarkdown()).toContain("A[Runnable] --> B[Executor]");
    await act(async () => root.unmount());
    element.remove();
  });

  it("leaves ordinary code blocks untouched", async () => {
    const { element, root } = await render(
      "```ts\nconst answer = 42\n```\n",
    );
    const node = document.querySelector(".mermaid-node");
    expect(node?.className).not.toContain("is-diagram");
    expect(node?.textContent).toContain("const answer = 42");
    await act(async () => root.unmount());
    element.remove();
  });
});
