import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { requiresSource } from "./core/markdown";
import { Textarea } from "@/components/ui/textarea";

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
  const source = requiresSource(value);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
        undoRedo: { depth: 100 },
      }),
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
    content: value,
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
      latest.current.onChange(editor.getMarkdown());
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
    if (editor.getMarkdown() !== value)
      editor.commands.setContent(value, {
        contentType: "markdown",
        emitUpdate: false,
      });
  }, [editor, value, readOnly]);
  if (source)
    return (
      <>
        <p className="source-notice">
          此文档含扩展语法，使用源码模式保留完整内容。
        </p>
        <Textarea
          aria-label="文档源码"
          className="source-document"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      </>
    );
  return <EditorContent editor={editor} className="document-body" />;
}
