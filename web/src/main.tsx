import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import QuickCapture from "./QuickCapture";
import "./index.css";

// 快速收集箱是同一个 SPA 的第二个窗口：桌面端按窗口 label 分流，
// 浏览器用 ?quick-capture 参数分流以便自动化测试。
const quickCapture =
  (isTauri() && getCurrentWindow().label === "quick-capture") ||
  new URLSearchParams(location.search).has("quick-capture");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{quickCapture ? <QuickCapture /> : <App />}</StrictMode>,
);
