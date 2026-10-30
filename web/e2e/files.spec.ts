import { test, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
test("Local Markdown files remain directly accessible and external edits are preserved", async ({
  page: p,
}) => {
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.addInitScript(() => {
    window.showDirectoryPicker = async () =>
      await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("test-parent", { create: true });
  });
  await p.goto("http://127.0.0.1:4174");
  await p.getByRole("heading", { name: "建立你的知识库。" }).waitFor();
  await p.getByRole("button", { name: /新建知识库.*选择位置/ }).click();
  await p.getByLabel("名称", { exact: true }).fill("真实知识库");
  await p.getByRole("button", { name: "选择位置并创建", exact: true }).click();
  await p.getByRole("heading", { name: "你的第一个项目。" }).waitFor();
  console.log("root created");
  await p.getByRole("button", { name: "创建项目", exact: true }).click();
  await p.getByLabel("名称", { exact: true }).fill("Agent 项目");
  await p.getByRole("button", { name: "确认", exact: true }).click();
  await p.getByRole("button", { name: /Agent 项目.*Markdown/ }).click();
  await p.getByRole("button", { name: "新建文档", exact: true }).last().click();
  await p.getByLabel("名称", { exact: true }).fill("本地笔记");
  await p.getByRole("textbox", { name: "子文件夹（可选）" }).fill("资料/草稿");
  await p.getByRole("button", { name: "确认", exact: true }).click();
  await p
    .getByRole("textbox", { name: "文档正文", exact: true })
    .fill("Agent 可以直接访问的 Markdown。");
  await p.keyboard.press("Control+s");
  await p.waitForTimeout(1000);
  async function diskText() {
    return p.evaluate(async () => {
      const parent = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("test-parent"),
        root = await parent.getDirectoryHandle("真实知识库"),
        project = await root.getDirectoryHandle("Agent 项目"),
        folder = await (
          await project.getDirectoryHandle("资料")
        ).getDirectoryHandle("草稿");
      return await (
        await (await folder.getFileHandle("本地笔记.md")).getFile()
      ).text();
    });
  }
  async function external(text) {
    return p.evaluate(async (value) => {
      const parent = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("test-parent"),
        root = await parent.getDirectoryHandle("真实知识库"),
        project = await root.getDirectoryHandle("Agent 项目"),
        folder = await (
          await project.getDirectoryHandle("资料")
        ).getDirectoryHandle("草稿");
      const stream = await (
        await folder.getFileHandle("本地笔记.md")
      ).createWritable();
      await stream.write(value);
      await stream.close();
    }, text);
  }
  assert((await diskText()).includes("Agent 可以直接访问"));
  assert(!(await diskText()).includes("<p>"));
  console.log("real .md file saved");
  await external("# Agent 更新\n\n由外部编辑器修改。");
  await p
    .locator(".tiptap h1")
    .getByText("Agent 更新", { exact: true })
    .waitFor({ timeout: 8000 });
  assert.equal(await diskText(), "# Agent 更新\n\n由外部编辑器修改。");
  console.log("external file refresh passed");
  await p
    .getByRole("textbox", { name: "文档正文", exact: true })
    .press("Control+End");
  await p.keyboard.type("本机尚未保存的内容");
  await external("# Agent 再次修改\n\n不能被覆盖。");
  await p
    .getByRole("heading", { name: "文件被外部程序修改", exact: true })
    .waitFor({ timeout: 8000 });
  assert((await diskText()).includes("不能被覆盖"));
  await p
    .getByRole("textbox", { name: "手动合并结果", exact: true })
    .fill("# 安全合并\n\n本机和 Agent 的修改都保留。");
  await p.getByRole("button", { name: "保存合并结果", exact: true }).click();
  await p.waitForTimeout(300);
  assert.equal(await diskText(), "# 安全合并\n\n本机和 Agent 的修改都保留。");
  console.log("external conflict safely merged");
  await p.waitForTimeout(1200);
  console.log("disk before delete", JSON.stringify(await diskText()));
  await p.getByRole("button", { name: "文档操作", exact: true }).click();
  await p.getByRole("menuitem", { name: "移入回收站", exact: true }).click();
  await p.getByRole("button", { name: "移入回收站", exact: true }).click();
  await p.getByRole("button", { name: "更多操作", exact: true }).click();
  await p.getByRole("menuitem", { name: "回收站", exact: true }).click();
  await p.getByRole("button", { name: "恢复", exact: true }).click();
  await p
    .getByRole("button", { name: "恢复", exact: true })
    .waitFor({ state: "detached" });
  console.log("disk after restore", JSON.stringify(await diskText()));
  assert((await diskText()).includes("安全合并"));
  await p.keyboard.press("Escape");
  console.log("trash restore passed");
  await p.getByRole("button", { name: "返回项目", exact: true }).click();
  await p.reload();
  await p.getByRole("button", { name: "真实知识库", exact: true }).click();
  await p.getByRole("button", { name: /Agent 项目.*Markdown/ }).click();
  await p.waitForTimeout(400);
  assert.equal(await diskText(), "# 安全合并\n\n本机和 Agent 的修改都保留。");
  console.log("reopen persisted folder passed");
  await p
    .getByRole("textbox", { name: "文档正文", exact: true })
    .fill("删除前尚未保存的草稿");
  await p.evaluate(async () => {
    const root = await (
        await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("test-parent")
      ).getDirectoryHandle("真实知识库"),
      folder = await (
        await (
          await root.getDirectoryHandle("Agent 项目")
        ).getDirectoryHandle("资料")
      ).getDirectoryHandle("草稿");
    await folder.removeEntry("本地笔记.md");
  });
  await p
    .getByRole("heading", { name: "文件被外部程序修改", exact: true })
    .waitFor();
  await p.getByRole("button", { name: "保留当前编辑", exact: true }).click();
  await expect.poll(() => diskText().catch(() => "")).toContain("删除前尚未保存的草稿");
  await p.evaluate(async () => {
    const root = await (
        await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle("test-parent")
      ).getDirectoryHandle("真实知识库"),
      folder = await (
        await (
          await root.getDirectoryHandle("Agent 项目")
        ).getDirectoryHandle("资料")
      ).getDirectoryHandle("草稿");
    await folder.removeEntry("本地笔记.md");
  });
  await p
    .getByRole("heading", { name: "从第一篇文档开始。", exact: true })
    .waitFor({ timeout: 8000 });
  await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      errors,
      checks: [
        "real directory API create",
        "nested .md disk write",
        "external Agent refresh",
        "optimistic conflict protection",
        "merge backups",
        "trash restore",
        "reopen persistent directory",
        "390px layout",
      ],
    }),
  );
});
