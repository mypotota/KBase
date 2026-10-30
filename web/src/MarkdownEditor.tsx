import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { MermaidCodeBlock } from "./mermaid-block";
import { createLowlight } from "lowlight";import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import diff from "highlight.js/lib/languages/diff";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { requiresSource, splitFrontmatter } from "./core/markdown";
import { Textarea } from "@/components/ui/textarea";

// Curated language set — covers the common cases (Java/Kotlin/C/C++/shell for
// Android & AOSP notes, plus web/config languages) without bundling every
// grammar. Unregistered languages (e.g. mermaid) render as plain code.
const lowlight = createLowlight();
lowlight.register({
  java,
  kotlin,
  c,
  cpp,
  bash,
  json,
  xml,
  yaml,
  javascript,
  typescript,
  python,
  sql,
  diff,
  ini,
  plaintext,
});

type Props = {
  value: string;
  onChange: (text: string) => void;
  readOnly: boolean;
  onReady: (editor: Editor | null) => void;
  onSlash: () => void;
  resolveImage: (source: string) => Promise<string>;
  onImage: (file: File) => Promise<string>;
};
export default function MarkdownEditor(props: Props) {
  const { value, onChange, readOnly, onReady, onSlash, resolveImage, onImage } =
    props;
  const latest = useRef({ onChange, onSlash, resolveImage, onImage });
  latest.current = { onChange, onSlash, resolveImage, onImage };
  // The frontmatter block stays out of the editor entirely and is re-attached
  // verbatim on every save; refs avoid stale closures inside editor events.
  const frontRef = useRef("");
  const bodyRef = useRef("");
  const { front, body } = splitFrontmatter(value);
  const source = requiresSource(body);
  frontRef.current = front;
  bodyRef.current = body;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
        undoRedo: { depth: 100 },
        codeBlock: false,
      }),
      MermaidCodeBlock.configure({ lowlight, defaultLanguage: "plaintext" }),
      Markdown,
      Placeholder.configure({ placeholder: "写下你的想法，或输入 / 插入内容" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      Image.extend({
        addNodeView() {
          return ({ node }) => {
            const image = document.createElement("img");
            image.alt = node.attrs.alt ?? "";
            let url: string | undefined,
              destroyed = false;
            latest.current
              .resolveImage(String(node.attrs.src ?? ""))
              .then((value) => {
                if (destroyed) {
                  if (value.startsWith("blob:")) URL.revokeObjectURL(value);
                  return;
                }
                url = value;
                image.src = value;
              })
              .catch(() => {
                image.alt = "图片不可用：" + (node.attrs.alt ?? "本地附件");
              });
            return {
              dom: image,
              destroy() {
                destroyed = true;
                if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
              },
            };
          };
        },
      }),
    ],
    content: body,
    contentType: "markdown",
    editable: !readOnly,
    editorProps: {
      attributes: {
        "aria-label": "文档正文",
        role: "textbox",
        "aria-multiline": "true",
      },
      handlePaste(view, event) {
        const file = event.clipboardData?.files[0];
        if (!file) return false;
        event.preventDefault();
        latest.current
          .onImage(file)
          .then((src) => {
            if (!view.isDestroyed)
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src, alt: file.name }),
                ),
              );
          })
          .catch((error) =>
            toast.error(error instanceof Error ? error.message : String(error)),
          );
        return true;
      },
      handleKeyDown(_view, event) {
        if (
          event.key === "/" &&
          !event.isComposing &&
          !event.metaKey &&
          !event.ctrlKey &&
          _view.state.selection.empty &&
          _view.state.selection.$from.parent.type.name === "paragraph" &&
          !_view.state.selection.$from.parent.textContent.trim()
        )
          setTimeout(() => latest.current.onSlash(), 0);
        return false;
      },
    },
    onUpdate({ editor }) {
      bodyRef.current = editor.getMarkdown();
      latest.current.onChange(frontRef.current + editor.getMarkdown());
    },
  });
  useEffect(() => {
    if (!editor) return;
    onReady(source ? null : editor);
    return () => onReady(null);
  }, [editor, source, onReady]);
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly, false);
    if (editor.getMarkdown() !== body)
      editor.commands.setContent(body, {
        contentType: "markdown",
        emitUpdate: false,
      });
  }, [editor, body, readOnly]);
  if (source)
    return (
      <>
        <p className="pb-3 text-sm text-muted-foreground">
          此文档含扩展语法，使用源码模式保留完整内容。
        </p>
        <Textarea
          aria-label="文档源码"
          className="min-h-[50vh] resize-y bg-transparent font-mono text-[13px] leading-relaxed"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      </>
    );
  // The frontmatter never enters the editor; it is kept out of the document
  // and shown in the side panel instead.
  return <EditorContent editor={editor} />;
}
