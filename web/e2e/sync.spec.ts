import { test, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
test("Authenticated project sync preserves multi-device conflicts", async ({
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
      ).getDirectoryHandle("sync-test", { create: true });
  });
  await p.goto("http://127.0.0.1:4174");
  await p.getByRole("button", { name: /新建知识库.*选择位置/ }).click();
  await p.getByLabel("名称", { exact: true }).fill("本地库");
  await p.getByRole("button", { name: "选择位置并创建", exact: true }).click();
  await p.getByRole("button", { name: "创建项目", exact: true }).click();
  await p.getByLabel("名称", { exact: true }).fill("同步项目");
  await p.getByRole("button", { name: "确认", exact: true }).click();
  await p.getByRole("button", { name: /同步项目.*Markdown/ }).click();
  await p.getByRole("button", { name: "新建文档", exact: true }).last().click();
  await p.getByLabel("名称", { exact: true }).fill("同步笔记");
  await p.getByRole("button", { name: "确认", exact: true }).click();
  await p
    .getByRole("textbox", { name: "文档正文", exact: true })
    .fill("真实的同步内容。");
  await p.keyboard.press("Control+s");
  await p.waitForTimeout(1000);
  await p.getByRole("button", { name: "项目同步", exact: true }).click();
  await p
    .getByLabel("服务器地址", { exact: true })
    .fill("http://127.0.0.1:8790");
  await p
    .getByLabel("管理员密码", { exact: true })
    .fill("e2e-test-only-password");
  await p.getByRole("button", { name: "登录服务器", exact: true }).click();
  await p.getByRole("button", { name: "连接当前项目", exact: true }).click();
  await p.getByRole("button", { name: "立即同步", exact: true }).click();
  await p.waitForTimeout(2000);
  const login = await (
      await fetch("http://127.0.0.1:8790/v1/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "e2e-test-only-password",
          deviceName: "External device",
        }),
      })
    ).json(),
    headers = {
      Authorization: "Bearer " + login.token,
      "Content-Type": "application/json",
    };
  const libraries = await (
      await fetch("http://127.0.0.1:8790/v1/libraries", { headers })
    ).json(),
    remote = libraries.filter((x) => x.name === "同步项目").at(-1);
  assert(remote);
  const manifest = await (
    await fetch(`http://127.0.0.1:8790/v1/libraries/${remote.id}/manifest`, {
      headers,
    })
  ).json();
  assert.equal(manifest.files.length, 1);
  const path = manifest.files[0].path,
    revision = manifest.files[0].revision;
  const version = await (
    await fetch(
      `http://127.0.0.1:8790/v1/libraries/${remote.id}/file?path=${encodeURIComponent(path)}`,
      { headers },
    )
  ).json();
  assert(
    Buffer.from(version.contentBase64, "base64")
      .toString()
      .includes("真实的同步内容"),
  );
  console.log("real browser upload passed");
  await p.keyboard.press("Escape");
  await p
    .getByRole("textbox", { name: "文档正文", exact: true })
    .fill("本地离线编辑。");
  await p.keyboard.press("Control+s");
  await p.waitForTimeout(950);
  const update = await fetch(
    `http://127.0.0.1:8790/v1/libraries/${remote.id}/file`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        path,
        baseRevision: revision,
        operationId: randomUUID(),
        contentBase64: Buffer.from("外部设备离线编辑。").toString("base64"),
      }),
    },
  );
  assert.equal(update.status, 200);
  await p.getByRole("button", { name: "项目同步", exact: true }).click();
  await p.getByRole("button", { name: "立即同步", exact: true }).click();
  await p.getByRole("button", { name: "同步笔记.md", exact: true }).click();
  await p
    .getByRole("textbox", { name: "合并后的 Markdown", exact: true })
    .fill("# 合并\n\n两个设备的修改均保留。");
  await p.getByRole("button", { name: "保存合并结果", exact: true }).click();
  await p.waitForTimeout(500);
  const merged = await (
    await fetch(
      `http://127.0.0.1:8790/v1/libraries/${remote.id}/file?path=${encodeURIComponent(path)}`,
      { headers },
    )
  ).json();
  assert(
    Buffer.from(merged.contentBase64, "base64").toString().includes("两个设备"),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      errors,
      checks: [
        "browser authenticates service",
        "project binding",
        "actual local Markdown upload",
        "offline multi-device conflict",
        "actual remote merge version",
      ],
    }),
  );
});
