// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import MarkdownEditor from "../src/MarkdownEditor";
import { requiresSource, splitFrontmatter } from "../src/core/markdown";
import type { Editor } from "@tiptap/react";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it("never emits a user edit while loading an external Markdown update or toggling read mode", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element),
    onChange = vi.fn();
  let editor: Editor | null = null;
  const onReady = (value: Editor | null) => {
      editor = value;
    },
    resolveImage = async () => "",
    onImage = async () => "";
  const render = (value: string, readOnly = false) => (
    <MarkdownEditor
      value={value}
      readOnly={readOnly}
      onChange={onChange}
      onReady={onReady}
      onSlash={() => {}}
      resolveImage={resolveImage}
      onImage={onImage}
    />
  );
  await act(async () => {
    root.render(render("# 原文\n\n初始内容。"));
  });
  expect(editor).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => {
    root.render(render("# Agent 修改\n\n外部内容。"));
  });
  expect(editor!.getMarkdown()).toContain("Agent 修改");
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => {
    root.render(render("# Agent 修改\n\n外部内容。", true));
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(editor!.isEditable).toBe(false);
  await act(async () => {
    root.render(render("# Agent 修改\n\n外部内容。"));
  });
  await act(async () => {
    editor!.commands.insertContent("新的输入");
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  element.remove();
});
it("renders frontmatter documents richly while keeping the block verbatim", async () => {
  const frontmatter = "---\ntags: [Android]\nsummary: 测试\n---\n";
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element),
    onChange = vi.fn();
  let editor: Editor | null = null;
  await act(async () =>
    root.render(
      <MarkdownEditor
        value={frontmatter + "# 标题\n\n正文。"}
        onChange={onChange}
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
  expect(editor).toBeTruthy();
  expect(document.querySelector('textarea[aria-label="文档源码"]')).toBeNull();
  expect(editor!.getMarkdown()).not.toContain("tags:");
  await act(async () => {
    editor!.commands.insertContent("追加");
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0]).toBe(frontmatter + editor!.getMarkdown());
  await act(async () => root.unmount());
  element.remove();
});
it("syntax-highlights fenced code blocks while keeping their text and serialization intact", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  let editor: Editor | null = null;
  const value =
    "```java\npublic final class Handler {\n  int count = 1; // 注释\n}\n```\n\n```mermaid\ngraph TD; A-->B;\n```\n";
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
  expect(editor).toBeTruthy();
  // registered languages get highlight.js token spans
  expect(document.querySelector(".tiptap .hljs-keyword")).toBeTruthy();
  expect(document.querySelector(".tiptap .hljs-comment")?.textContent).toBe(
    "// 注释",
  );
  // highlighting is decoration only: text content and Markdown output are unchanged
  expect(document.querySelector(".tiptap pre code")?.textContent).toContain(
    "public final class Handler {",
  );
  expect(editor!.getMarkdown()).toContain(
    "```java\npublic final class Handler {",
  );
  // unregistered languages fall back to plain code instead of crashing
  expect(
    [...document.querySelectorAll(".tiptap pre")].some((pre) =>
      (pre.textContent ?? "").includes("graph TD"),
    ),
  ).toBe(true);
  await act(async () => root.unmount());
  element.remove();
});
it("preserves unsupported Markdown as source instead of silently converting it", () => {
  const { front, body } = splitFrontmatter(
    "---\ntitle: YAML\ntags: [a, b]\n---\n\n正文",
  );
  expect(front).toBe("---\ntitle: YAML\ntags: [a, b]\n---\n");
  expect(body).toBe("\n正文");
  expect(requiresSource(body)).toBe(false);
  for (const text of [
    "正文[^1]\n\n[^1]: 注释",
    "<details>原文</details>",
    "[name]: https://example.com",
  ])
    expect(requiresSource(text)).toBe(true);
  // constructs that merely look like syntax inside fenced or inline code are safe
  expect(
    requiresSource("```java\nList<String> a = new ArrayList<>();\n```\n"),
  ).toBe(false);
  expect(
    requiresSource("正文引用 `WeakReference<Activity>` 与 `[^1]`。\n"),
  ).toBe(false);
  expect(
    requiresSource("# 标题\n\n- [ ] 待办\n\n```ts\nconst value=1\n```\n"),
  ).toBe(false);
});
it("round-trips headings, GFM tasks, code fences, tables, links and local image references", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  let editor: Editor | null = null;
  const value =
    "# 标题\n\n- [x] 已完成\n- [ ] 待办\n\n```ts\nconst answer = 42\n```\n\n| 名称 | 内容 |\n| --- | --- |\n| Markdown | 本地 |\n\n[链接](https://example.com)\n\n![附件](attachments/test.png)\n\n> 引用\n";
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
  const output = editor!.getMarkdown();
  for (const snippet of [
    "# 标题",
    "[x] 已完成",
    "[ ] 待办",
    "```ts",
    "const answer = 42",
    "Markdown",
    "本地",
    "[链接](https://example.com)",
    "attachments/test.png",
    "> 引用",
  ])
    expect(output).toContain(snippet);
  await act(async () => root.unmount());
  element.remove();
});
it("opens slash insertion only in an empty paragraph and never during IME composition", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element),
    onSlash = vi.fn();
  let editor: Editor | null = null;
  await act(async () =>
    root.render(
      <MarkdownEditor
        value=""
        onChange={() => {}}
        readOnly={false}
        onReady={(value) => {
          editor = value;
        }}
        onSlash={onSlash}
        resolveImage={async () => ""}
        onImage={async () => ""}
      />,
    ),
  );
  await act(async () => {
    editor!.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        isComposing: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 5));
  });
  expect(onSlash).not.toHaveBeenCalled();
  await act(async () => {
    editor!.commands.setContent("https://example.com", {
      contentType: "markdown",
      emitUpdate: false,
    });
    editor!.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 5));
  });
  expect(onSlash).not.toHaveBeenCalled();
  await act(async () => {
    editor!.commands.clearContent(false);
    editor!.view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 5));
  });
  expect(onSlash).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  element.remove();
});
