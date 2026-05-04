# Brain Desktop

本地零摩擦收集工作台。当前主方向是 Electron 桌面端：复制文本、链接或图片后，用快捷键或托盘直接收进盒子。

## 功能

- 盒子和卡片：文字、链接、图片、文件和组合卡片。
- 系统级收集：`Ctrl+Shift+B` 收集剪贴板，`Ctrl+Alt+B` 切换自动监听。
- 托盘菜单：立即收集剪贴板、开启/关闭自动监听、打开主窗口、退出。
- 去重过滤：短时间重复内容不会反复刷屏。
- AI 整理：DeepSeek 帮当前盒子生成归类和标题补全建议，确认后再应用。

## 启动

```bash
cd desktop
npm install
npm start
```

数据存储在 Electron `userData` 目录下：

- `brain-desktop.db`：盒子和卡片数据
- `brain-ai-config.json`：本机 AI 配置

## AI 配置

可以在应用的“关于”界面填写 DeepSeek API Key、Base URL 和模型名。

也可以用环境变量：

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
```

`DEEPSEEK_MODEL` 可不填，默认使用 `deepseek-v4-flash`；默认 Base URL 是 `https://api.deepseek.com`。

## 开发命令

```bash
cd desktop
npm run lint
npm test
```

`npm test` 是日常开发测试，不会跑 Windows 安装包清理和构建验证。需要验证安装包流程时再单独运行：

```bash
npm run test:packaging
npm run make
```

Windows 打包现在使用 NSIS 安装包，生成 `.exe`，不是 Squirrel 的一键安装 EXE。安装器会显示向导，并允许选择安装目录。

打包前请先关闭正在运行的开发窗口或 `npm start`，否则清理 `.webpack` 时可能被占用。

```powershell
cd desktop
npm run make
```

打包产物会输出到仓库根目录的 `.desktop-out/`，这是本地生成目录，不提交到 Git：

- 免安装版：`.desktop-out/Brain Desktop-win32-x64/Brain Desktop.exe`
- 安装包：`.desktop-out/make/nsis/Brain Desktop Setup 1.0.0.exe`

生产打包的类型检查使用 `desktop/tsconfig.package.json`，只检查应用运行时代码，排除 `*.test.ts(x)` 测试文件；日常测试仍使用 Vitest。

## 技术栈

- Electron
- React
- TypeScript
- SQLite (`better-sqlite3`)

旧 Flask 网页端已经移除；后续捕获能力只在 Desktop 方向维护。
