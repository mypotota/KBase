import { useEffect, useRef, useState } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { cn } from "@/lib/utils";

// Fence languages that hold a Mermaid diagram instead of source code.
const diagramLanguages = new Set([
  "mermaid",
  "flowchart",
  "graph",
  "diagram",
]);

type MermaidApi = typeof import("mermaid").default;
let mermaidLoader: Promise<MermaidApi> | null = null;

// Mermaid is heavy, so it is only fetched once a diagram is actually present.
function loadMermaid(theme: "default" | "dark"): Promise<MermaidApi> {
  mermaidLoader ??= import("mermaid").then((module) => module.default);
  return mermaidLoader.then((mermaid) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme,
      themeVariables: { background: "transparent" },
      // mermaid 默认在渲染失败时往页面插入一张全屏的错误大图；
      // 这里关掉它，失败只走我们的 error 分支展示摘要。
      suppressErrorRendering: true,
    });
    return mermaid;
  });
}

function useIsDark() {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function MermaidBlockView({ node, editor, getPos }: NodeViewProps) {
  const language = String(node.attrs.language ?? "");
  const diagram = diagramLanguages.has(language.toLowerCase());
  const dark = useIsDark();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const id = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);
  const code = node.textContent;

  // The source is shown while the cursor is inside the block, the diagram
  // otherwise — clicking a diagram therefore opens its source.
  useEffect(() => {
    if (!diagram) return;
    const check = () => {
      try {
        const pos = getPos();
        if (pos === undefined) return setEditing(false);
        const { from, to } = editor.state.selection;
        setEditing(from >= pos && to <= pos + node.nodeSize);
      } catch {
        setEditing(false);
      }
    };
    check();
    editor.on("selectionUpdate", check);
    editor.on("blur", check);
    return () => {
      editor.off("selectionUpdate", check);
      editor.off("blur", check);
    };
  }, [diagram, editor, getPos, node.nodeSize]);

  useEffect(() => {
    if (!diagram) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const source = code.trim();
      if (!source) {
        setSvg(null);
        setError(null);
        return;
      }
      try {
        const mermaid = await loadMermaid(dark ? "dark" : "default");
        const result = await mermaid.render(id.current, source);
        if (cancelled) return;
        setSvg(result.svg);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setSvg(null);
        // 保险：清理 mermaid 失败时遗留的临时错误节点。
        document.getElementById(`d${id.current}`)?.remove();
        document.getElementById(id.current)?.remove();
        setError(
          cause instanceof Error ? cause.message : "图表语法无法解析",
        );
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [diagram, code, dark]);

  if (!diagram)
    return (
      <NodeViewWrapper className="mermaid-node">
        <pre>
          <NodeViewContent<"code"> as="code" />
        </pre>
      </NodeViewWrapper>
    );
  return (
    <NodeViewWrapper
      className={cn("mermaid-node is-diagram", editing && "is-editing")}
      data-language={language}
    >
      <div
        className="mermaid-preview"
        contentEditable={false}
        onClick={() => {
          // Clicking the diagram moves the cursor into its source.
          const pos = getPos();
          if (pos !== undefined) editor.commands.setTextSelection(pos + 1);
          editor.view.dom.focus();
        }}
      >
        {error ? (
          <p className="mermaid-error">{error}</p>
        ) : svg ? (
          <div
            className="mermaid-svg"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="mermaid-hint">图表渲染中…</p>
        )}
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

// Code blocks keep the language attribute for Markdown round-trips; Mermaid
// fences additionally render as a diagram.
export const MermaidCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView);
  },
});
