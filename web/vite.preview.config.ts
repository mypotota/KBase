import { mergeConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import config from "./vite.config";
export default mergeConfig(config, { plugins: [viteSingleFile()] });
