# Sticky Popout Notes

Open Markdown notes as lightweight sticky pop-out windows in Obsidian Desktop.

[中文](#中文) | [English](#english)

## 快速上手 / Quick Start

### 中文

1. 从 [GitHub Release 0.6.9](https://github.com/haoshadexitong/sticky-popout-notes/releases/tag/0.6.9) 下载：

   - `manifest.json`
   - `main.js`
   - `styles.css`

2. 将三个文件放入：

   ```text
   <你的 Vault>/.obsidian/plugins/sticky-popout-notes/
   ```

3. 打开 Obsidian Desktop，在 `Settings -> Community plugins` 中启用 `Sticky Popout Notes`。

4. 打开 Command Palette，运行：

   ```text
   Sticky Notes: Create sticky note
   ```

也可以在笔记中加入：

````markdown
```sticky-controls
open
```
````

然后在阅读视图中点击“打开为便签”。

### English

1. Download these files from [GitHub Release 0.6.9](https://github.com/haoshadexitong/sticky-popout-notes/releases/tag/0.6.9):

   - `manifest.json`
   - `main.js`
   - `styles.css`

2. Put all three files in:

   ```text
   <your-vault>/.obsidian/plugins/sticky-popout-notes/
   ```

3. Open Obsidian Desktop and enable `Sticky Popout Notes` under `Settings -> Community plugins`.

4. Open the Command Palette and run:

   ```text
   Sticky Notes: Create sticky note
   ```

You can also add this block to a note:

````markdown
```sticky-controls
open
```
````

Then click the open button in reading view.

## Project Info

| Item | Value |
| --- | --- |
| Plugin ID | `sticky-popout-notes` |
| Version | `0.6.9` |
| Author | `BIG_GOOSE` |
| Minimum Obsidian version | `1.5.0` |
| Platform | Obsidian Desktop only |
| License | MIT |

The TypeScript source is published in this repository. Installable builds are provided as GitHub Release assets.

# 中文

## 简介

Sticky Popout Notes 是一个 Obsidian 桌面端插件，用于把 Markdown 笔记打开为轻量便签窗口。

它适合临时任务、会议记录、草稿、代码片段、阅读摘录和桌面提醒等场景，让常用笔记可以停留在工作区旁边。

插件支持两种窗口路线：

- **Transparent window**：默认路线，支持透明背景、拖动、置顶、外观面板以及 Markdown 预览和编辑切换。
- **Obsidian Pop-out window**：兼容路线，保留 Obsidian 原生 Pop-out 窗口能力。

## 功能

- 从当前 Markdown 笔记打开便签窗口
- 创建新的 sticky note，默认保存在 `Sticky Notes/` 文件夹
- 打开所有已标记为 sticky 的笔记
- 聚焦当前笔记对应的 transparent sticky window
- 关闭所有 transparent sticky windows
- Transparent window 支持拖动
- Transparent window 支持置顶和取消置顶
- Transparent window 支持 Markdown 预览和编辑切换
- 外观面板支持背景颜色、内容背景透明度、文本色调和窗口模式偏好
- `sticky-controls` 控制块可在 Obsidian 阅读视图中显示“打开为便签”按钮
- sticky note textarea 会隐藏 frontmatter 和 `sticky-controls` 内部控制块
- 普通 Markdown fenced code block 会保留

## 安装

从对应版本的 GitHub Release 下载：

```text
manifest.json
main.js
styles.css
```

将文件放入：

```text
<你的 Vault>/.obsidian/plugins/sticky-popout-notes/
```

目录结构应为：

```text
.obsidian/plugins/sticky-popout-notes/
├─ manifest.json
├─ main.js
└─ styles.css
```

然后在 Obsidian Desktop 的 `Settings -> Community plugins` 中启用插件。

`main.js` 是构建产物，仅作为 GitHub Release asset 发布，不提交到源码仓库根目录。

## 从源码构建

需要 Node.js 和 npm。

```powershell
npm ci
npm run dev
```

构建完成后，仓库根目录会生成 `main.js`。该文件已被 `.gitignore` 忽略。

## 基本使用

### 创建新的 sticky note

打开 Command Palette，运行：

```text
Sticky Notes: Create sticky note
```

插件会在 `Sticky Notes/` 文件夹中创建新笔记，并打开为便签。

### 把当前笔记打开为便签

打开一个 Markdown 笔记，然后运行：

```text
Sticky Notes: Open current note as sticky note
```

插件会把该笔记标记为 sticky，并按照 `useTransparentWindow` 设置打开窗口。

### 强制打开 transparent window

运行：

```text
Sticky Notes: Open current note as transparent sticky window
```

### 外观、置顶和预览

将鼠标移动到 transparent window 顶部以显示导航栏。

- 点击“外观”调整背景颜色、内容背景透明度、文本色调和窗口模式偏好。
- 点击“未置顶”启用 always-on-top；再次点击可取消置顶。
- 点击“预览”渲染 Markdown；点击“编辑”返回 textarea 编辑模式。
- 点击“关闭”关闭当前窗口。

预览模式使用 Obsidian `MarkdownRenderer`。Frontmatter 和 `sticky-controls` 控制块不会显示，普通 fenced code block 会保留。

## sticky-controls 控制块

在 Markdown 笔记中加入：

````markdown
```sticky-controls
open
```
````

在 Obsidian 阅读视图中，它会显示“打开为便签”按钮。

该控制块是插件内部控制块：

- 在 sticky note textarea 中隐藏
- 在 transparent Markdown preview 中隐藏
- 不影响普通 fenced code block

## Command Palette 命令

- `Sticky Notes: Create sticky note`
- `Sticky Notes: Open current note as sticky note`
- `Sticky Notes: Open current note as transparent sticky window`
- `Sticky Notes: Close all transparent sticky windows`
- `Sticky Notes: Focus current transparent sticky window`
- `Sticky Notes: Open all sticky notes`
- `Sticky Notes: Set current sticky note color`

## Frontmatter 字段

以下字段由插件自动维护，通常不需要手动修改。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sticky` | boolean | 标记该 Markdown note 是 sticky note |
| `color` | string | 便签基础背景颜色 |
| `backgroundOpacity` | number | 内容背景透明度，范围 `0` 到 `100` |
| `textTone` | number | 文本色调，范围 `-100` 到 `100` |
| `textOpacity` | number | 兼容字段，由插件维护 |
| `textColor` | string | 兼容字段，由插件维护 |
| `useTransparentWindow` | boolean | 是否优先使用 transparent window |
| `transparentAlwaysOnTop` | boolean | transparent window 是否置顶 |
| `windowOpacity` | number | 兼容 Pop-out 的整窗透明度，范围 `20` 到 `100` |
| `width` | number | transparent window 初始宽度 |
| `height` | number | transparent window 初始高度 |

## 已知限制

- 仅支持 Obsidian Desktop，不支持移动端。
- Transparent window 依赖 Electron BrowserWindow，在不同系统、GPU、显示器缩放和窗口管理器下表现可能不同。
- Pop-out 的 `windowOpacity` 会影响整个窗口，包括文字和按钮。
- Markdown preview 不是完整的 Obsidian 阅读视图替代品。
- 窗口切换时会尽量保存内容，但焦点和位置行为仍可能受 Obsidian 或 Electron API 限制。

## Troubleshooting

### 插件没有显示

请确认：

1. 插件目录是 `.obsidian/plugins/sticky-popout-notes/`。
2. `manifest.json`、`main.js` 和 `styles.css` 位于该目录根部。
3. Obsidian 已允许 Community plugins。
4. 插件已在 `Settings -> Community plugins` 中启用。

### 插件加载失败

如果 `main.js` 缺失，Obsidian 无法加载插件。请重新下载当前版本的三个 Release assets。

### Release tag 与 manifest version 不一致

当前版本为 `0.6.9`。GitHub Release tag、`manifest.json` 中的 `version` 和仓库中的 `versions.json` 应保持一致。

### Transparent window 无法打开

请确认：

1. 当前使用 Obsidian Desktop。
2. 当前文件是 Markdown note。
3. 插件已启用。
4. 系统安全软件、窗口管理器或策略未阻止透明窗口。

## 反馈问题

请通过 [GitHub Issues](https://github.com/haoshadexitong/sticky-popout-notes/issues) 提交问题，并尽量包含：

- Obsidian 版本
- 操作系统
- 插件版本和安装方式
- 期望行为和实际行为
- 最小复现步骤
- 问题发生在 transparent window、Pop-out window，还是两者都发生

请先移除私人路径、个人笔记内容和其他敏感信息。

# English

## Overview

Sticky Popout Notes is an Obsidian Desktop plugin for opening Markdown notes as lightweight sticky pop-out windows.

It is useful for temporary tasks, meeting notes, drafts, code snippets, reading excerpts, and reminders that should stay visible beside your workspace.

The plugin supports two window paths:

- **Transparent window**: the default path, with transparency, dragging, always-on-top, appearance controls, and Markdown preview/edit switching.
- **Obsidian Pop-out window**: a compatibility path that uses Obsidian's native Pop-out support.

## Features

- Open the current Markdown note as a sticky note
- Create a new sticky note under `Sticky Notes/`
- Open all notes marked as sticky
- Focus the transparent window for the current note
- Close all transparent sticky windows
- Drag and pin transparent windows
- Switch between Markdown preview and editing
- Adjust background color, content opacity, text tone, and window mode preference
- Add an open button to reading view with a `sticky-controls` block
- Hide frontmatter and internal control blocks from sticky note textareas
- Preserve normal Markdown fenced code blocks

## Installation

Download these assets from the matching GitHub Release:

```text
manifest.json
main.js
styles.css
```

Place them in:

```text
<your-vault>/.obsidian/plugins/sticky-popout-notes/
```

The folder should contain:

```text
.obsidian/plugins/sticky-popout-notes/
├─ manifest.json
├─ main.js
└─ styles.css
```

Then enable the plugin in Obsidian Desktop under `Settings -> Community plugins`.

`main.js` is a generated build artifact. It is published as a GitHub Release asset and is intentionally excluded from the source repository root.

## Build From Source

Node.js and npm are required.

```powershell
npm ci
npm run dev
```

The build generates `main.js` in the repository root. The file is ignored by Git.

## Basic Usage

### Create a sticky note

Open the Command Palette and run:

```text
Sticky Notes: Create sticky note
```

The plugin creates a note under `Sticky Notes/` and opens it as a sticky note.

### Open the current note

Open a Markdown note and run:

```text
Sticky Notes: Open current note as sticky note
```

The plugin marks the note as sticky and opens it according to `useTransparentWindow`.

### Force a transparent window

Run:

```text
Sticky Notes: Open current note as transparent sticky window
```

### Appearance, pinning, and preview

Move the pointer near the top of a transparent window to reveal its navbar.

- Select `Appearance` to adjust background color, content opacity, text tone, and window mode preference.
- Select `Not pinned` to enable always-on-top; select it again to unpin.
- Select `Preview` to render Markdown; select `Edit` to return to the textarea.
- Select `Close` to close the current window.

Preview mode uses Obsidian `MarkdownRenderer`. Frontmatter and `sticky-controls` blocks are hidden, while normal fenced code blocks are preserved.

## sticky-controls Block

Add this block to a Markdown note:

````markdown
```sticky-controls
open
```
````

It displays an “Open as sticky note” button in Obsidian reading view.

The block is internal to the plugin:

- It is hidden from sticky note textareas
- It is hidden from transparent Markdown preview
- It does not hide normal fenced code blocks

## Command Palette Commands

- `Sticky Notes: Create sticky note`
- `Sticky Notes: Open current note as sticky note`
- `Sticky Notes: Open current note as transparent sticky window`
- `Sticky Notes: Close all transparent sticky windows`
- `Sticky Notes: Focus current transparent sticky window`
- `Sticky Notes: Open all sticky notes`
- `Sticky Notes: Set current sticky note color`

## Frontmatter Fields

These fields are maintained automatically by the plugin.

| Field | Type | Description |
| --- | --- | --- |
| `sticky` | boolean | Marks the Markdown note as a sticky note |
| `color` | string | Base sticky note background color |
| `backgroundOpacity` | number | Content background opacity from `0` to `100` |
| `textTone` | number | Text tone from `-100` to `100` |
| `textOpacity` | number | Compatibility field maintained by the plugin |
| `textColor` | string | Compatibility field maintained by the plugin |
| `useTransparentWindow` | boolean | Whether opening a sticky note should prefer transparent mode |
| `transparentAlwaysOnTop` | boolean | Whether the transparent window stays on top |
| `windowOpacity` | number | Compatibility Pop-out opacity from `20` to `100` |
| `width` | number | Initial transparent window width |
| `height` | number | Initial transparent window height |

## Known Limitations

- The plugin supports Obsidian Desktop only.
- Transparent windows depend on Electron BrowserWindow and may behave differently across operating systems, GPUs, display scaling settings, and window managers.
- Pop-out `windowOpacity` affects the entire window, including text and controls.
- Markdown preview is not a full replacement for Obsidian reading view.
- Focus and window position can still depend on Obsidian and Electron APIs when switching window modes.

## Troubleshooting

### The plugin does not appear

Check that:

1. The plugin folder is `.obsidian/plugins/sticky-popout-notes/`.
2. `manifest.json`, `main.js`, and `styles.css` are directly inside that folder.
3. Community plugins are allowed in Obsidian.
4. The plugin is enabled under `Settings -> Community plugins`.

### The plugin fails to load

Obsidian cannot load the plugin without `main.js`. Download all three assets again from the current GitHub Release.

### Release tag and manifest version do not match

The current version is `0.6.9`. The GitHub Release tag, the `version` in `manifest.json`, and the repository's `versions.json` entry should match.

### A transparent window does not open

Check that:

1. You are using Obsidian Desktop.
2. The current file is a Markdown note.
3. The plugin is enabled.
4. Security software, a window manager, or a system policy is not blocking transparent windows.

## Feedback

Please use [GitHub Issues](https://github.com/haoshadexitong/sticky-popout-notes/issues) and include:

- Obsidian version
- Operating system
- Plugin version and installation method
- Expected and actual behavior
- Minimal reproduction steps
- Whether the issue affects transparent windows, Pop-out windows, or both

Remove private paths, personal note content, and other sensitive information before posting.

## License

MIT License. See [LICENSE](LICENSE).
