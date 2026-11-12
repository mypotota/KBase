import { test, expect } from "@playwright/test";
test("工程概览创建为真实 Markdown 并能往返工作区", async ({page:p}) => {
  await p.addInitScript(() => {
    window.showDirectoryPicker = async () =>
      await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle("test-parent", { create: true });
  });
  await p.goto("http://127.0.0.1:4174");
  await p.getByRole("heading", { name: "建立你的知识库" }).waitFor();
  await p.getByRole("button", { name: /新建知识库.*选择位置/ }).click();
  await p.getByLabel("名称", { exact: true }).fill("真实知识库");
  await p.getByRole("button", { name: "选择位置并创建", exact: true }).click();
  await p.getByRole("heading", { name: "还没有项目" }).waitFor();
  console.log("root created");
  await p.getByRole("button", { name: "创建项目", exact: true }).click();
  await p.getByLabel("名称", { exact: true }).fill("Agent 项目");
  await p.getByRole("button", { name: "确认", exact: true }).click();
  await p.getByRole("button", { name: /Agent 项目.*Markdown/ }).click();
  await expect(p.getByRole("heading", {name:"Agent 项目", exact:true})).toBeVisible();
  await p.getByRole("button", {name:"建立工程概览"}).click();
  await expect(p.getByRole("textbox", {name:"文档正文",exact:true})).toBeVisible();
  await p.getByRole("banner").getByRole("button", {name:"工程概览",exact:true}).click();
  await expect(p.getByLabel("工程上下文")).toContainText("准备中");
  const content = await p.evaluate(async () => {
    const parent = await (await navigator.storage.getDirectory()).getDirectoryHandle("test-parent");
    const root = await parent.getDirectoryHandle("真实知识库");
    const project = await root.getDirectoryHandle("Agent 项目");
    return (await (await project.getFileHandle("工程概览.md")).getFile()).text();
  });
  expect(content).toContain("## 下一步");
  await p.getByRole("heading", {name:"最近更新的资料"}).waitFor();
  await p.screenshot({animations:"disabled", path:"test-results/engineering-overview.png",fullPage:true});
});
