import { expect, it } from "vitest";
import { briefTemplate, parseEngineeringBrief } from "../src/core/engineering";
it("读取工程上下文并在无关章节处停止", () => {
  expect(parseEngineeringBrief("## 目标\r\n交付桌面版\r\n## 其他\r\n忽略\r\n## 下一步\r\n验证安装")).toEqual({目标:"交付桌面版",下一步:"验证安装"});
});
it("代码块里的标题不改变工程章节", () => {
  expect(parseEngineeringBrief("## 目标\n例子\n```md\n## 下一步\n示例\n```\n## 当前阶段\n验证")).toEqual({目标:"例子\n## 下一步\n示例",当前阶段:"验证"});
});
it("模板可被外部工具维护，空文档没有虚构工程状态", () => {
  expect(parseEngineeringBrief("")).toEqual({});
  expect(parseEngineeringBrief(briefTemplate("工程"))["当前阶段"]).toBe("准备中");
});
