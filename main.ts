import {
  FileSystemAdapter,
  ItemView,
  MarkdownRenderer,
  Modal,
  Notice,
  parseYaml,
  Plugin,
  TFile,
  ViewStateResult,
  WorkspaceLeaf
} from "obsidian";

const VIEW_TYPE_STICKY_NOTE = "sticky-note-view";
const STICKY_NOTES_FOLDER = "Sticky Notes";
const DEFAULT_X = 300;
const DEFAULT_Y = 200;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;
const WINDOW_OFFSET_PX = 32;
const WINDOW_OFFSET_CYCLE = 8;
const SAVE_DELAY_MS = 500;
const UTF8_BOM = "\uFEFF";
const DEFAULT_COLOR_HEX = "#FFF3A3";
const DEFAULT_TEXT_COLOR_HEX = "#111111";
const DEFAULT_BACKGROUND_OPACITY = 100;
const DEFAULT_TEXT_OPACITY = 100;
const DEFAULT_TEXT_TONE = 100;
const DEFAULT_WINDOW_OPACITY = 100;
const DEFAULT_USE_TRANSPARENT_WINDOW = true;
const DEFAULT_TRANSPARENT_ALWAYS_ON_TOP = false;
const MIN_WINDOW_OPACITY = 20;
const TRANSPARENT_STICKY_SAVE_DELAY_MS = 500;
const TRANSPARENT_NAV_BUTTON_HEIGHT_PX = 40;
const TRANSPARENT_NAVBAR_TRIGGER_RATIO = 1.3;
const TRANSPARENT_NAVBAR_HEIGHT_PX = Math.round(
  TRANSPARENT_NAV_BUTTON_HEIGHT_PX * TRANSPARENT_NAVBAR_TRIGGER_RATIO
);
const TRANSPARENT_NAVBAR_HOVER_ZONE_PX = 72;
const TRANSPARENT_NAVBAR_HIDE_DELAY_MS = 500;
const TRANSPARENT_WINDOW_TITLE_PREFIX = "sticky-popout-transparent::";
const TRANSPARENT_WINDOW_IPC_CHANNEL =
  "sticky-popout-notes:transparent-appearance";
const TRANSPARENT_WINDOW_CLOSE_CURRENT_IPC_CHANNEL =
  "sticky-popout-notes:close-current-transparent-window";
const TRANSPARENT_WINDOW_ALWAYS_ON_TOP_IPC_CHANNEL =
  "sticky-popout-notes:transparent-always-on-top";
const TRANSPARENT_WINDOW_RENDER_MARKDOWN_IPC_CHANNEL =
  "sticky-popout-notes:transparent-render-markdown";
const TRANSPARENT_WINDOW_RENDER_MARKDOWN_RESULT_IPC_CHANNEL =
  "sticky-popout-notes:transparent-render-markdown-result";
const TRANSPARENT_WINDOW_DRAG_START_IPC_CHANNEL =
  "sticky-popout-notes:transparent-window-drag-start";
const TRANSPARENT_WINDOW_DRAG_STOP_IPC_CHANNEL =
  "sticky-popout-notes:transparent-window-drag-stop";
const TRANSPARENT_WINDOW_LEGACY_MOVE_IPC_CHANNEL =
  "sticky-popout-notes:transparent-window-move";
const TRANSPARENT_WINDOW_DRAG_INTERVAL_MS = 32;
const TRANSPARENT_WINDOW_DRAG_MAX_DURATION_MS = 8000;
const TRANSPARENT_WINDOW_SLOW_TICK_WARNING_MS = 150;
const TRANSPARENT_DUPLICATE_CLEANUP_DELAY_MS = 200;
const DEFAULT_BODY = "新的便签";
const DEFAULT_FRONTMATTER = [
  "---",
  "sticky: true",
  `color: "${DEFAULT_COLOR_HEX}"`,
  `backgroundOpacity: ${DEFAULT_BACKGROUND_OPACITY}`,
  `textTone: ${DEFAULT_TEXT_TONE}`,
  `textOpacity: ${DEFAULT_TEXT_OPACITY}`,
  `textColor: "${DEFAULT_TEXT_COLOR_HEX}"`,
  `useTransparentWindow: ${DEFAULT_USE_TRANSPARENT_WINDOW}`,
  `transparentAlwaysOnTop: ${DEFAULT_TRANSPARENT_ALWAYS_ON_TOP}`,
  `windowOpacity: ${DEFAULT_WINDOW_OPACITY}`,
  `width: ${DEFAULT_WIDTH}`,
  `height: ${DEFAULT_HEIGHT}`,
  "---",
  "",
  ""
].join("\n");

interface StickyNoteViewState extends Record<string, unknown> {
  filePath?: string;
}

interface StickyNoteWindowOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface MarkdownParts {
  frontmatter: string;
  body: string;
}

type StickyNoteColor = "yellow" | "blue" | "green" | "pink";

interface StickyNoteAppearance {
  color: string;
  backgroundOpacity: number;
  textOpacity: number;
  textTone: number;
  windowOpacity: number;
  useTransparentWindow: boolean;
  background: string;
  textColor: string;
  caretColor: string;
  textColorHex: string;
}

const LEGACY_STICKY_NOTE_COLORS: Record<StickyNoteColor, string> = {
  yellow: "#FFF3A3",
  blue: "#D9EFFF",
  green: "#DFF5CF",
  pink: "#FFD9E6"
};

const STICKY_APPEARANCE_PRESET_COLORS = [
  "#FFF3A3",
  "#FFE08A",
  "#FFD166",
  "#F59E0B",
  "#FB7185",
  "#F43F5E",
  "#FFD9E6",
  "#F0ABFC",
  "#D8B4FE",
  "#A78BFA",
  "#93C5FD",
  "#60A5FA",
  "#D9EFFF",
  "#7DD3FC",
  "#67E8F9",
  "#5EEAD4",
  "#86EFAC",
  "#DFF5CF",
  "#BEF264",
  "#D9F99D",
  "#E5E7EB",
  "#D1D5DB",
  "#A3A3A3",
  "#737373"
];

export default class StickyPopoutNotesPlugin extends Plugin {
  private transparentWindowManager: TransparentStickyWindowManager | null = null;
  private transparentWindowIpcMain: { removeHandler?: (channel: string) => void } | null =
    null;
  private transparentWindowDragSessions = new Map<
    string,
    TransparentWindowDragSession
  >();

  async onload() {
    this.transparentWindowManager = new TransparentStickyWindowManager(this);
    this.registerTransparentWindowIpc();

    this.registerView(
      VIEW_TYPE_STICKY_NOTE,
      (leaf) => new StickyNoteView(leaf, this)
    );

    this.addCommand({
      id: "create-sticky-note",
      name: "Sticky Notes: Create sticky note",
      callback: () => {
        void this.createStickyNote();
      }
    });

    this.addCommand({
      id: "open-current-note-as-sticky-note",
      name: "Sticky Notes: Open current note as sticky note",
      callback: () => {
        void this.openCurrentNoteAsStickyNote();
      }
    });

    this.addCommand({
      id: "open-current-note-as-transparent-sticky-window",
      name: "Sticky Notes: Open current note as transparent sticky window",
      callback: () => {
        void this.openCurrentNoteAsTransparentStickyWindow();
      }
    });

    this.addCommand({
      id: "close-all-transparent-sticky-windows",
      name: "Sticky Notes: Close all transparent sticky windows",
      callback: () => {
        void this.closeAllTransparentStickyWindows();
      }
    });

    this.addCommand({
      id: "focus-current-transparent-sticky-window",
      name: "Sticky Notes: Focus current transparent sticky window",
      callback: () => {
        void this.focusCurrentTransparentStickyWindow();
      }
    });

    this.addCommand({
      id: "open-all-sticky-notes",
      name: "Sticky Notes: Open all sticky notes",
      callback: () => {
        void this.openAllStickyNotes();
      }
    });

    this.addCommand({
      id: "set-current-sticky-note-color",
      name: "Sticky Notes: Set current sticky note color",
      callback: () => {
        this.setCurrentStickyNoteColor();
      }
    });

    this.registerMarkdownCodeBlockProcessor(
      "sticky-controls",
      (source, el, ctx) => {
        this.renderStickyControls(source, el, ctx.sourcePath);
      }
    );
  }

  async onunload(): Promise<void> {
    this.stopAllTransparentWindowDragSessions("unload");
    this.transparentWindowIpcMain?.removeHandler?.(
      TRANSPARENT_WINDOW_IPC_CHANNEL
    );
    this.transparentWindowIpcMain?.removeHandler?.(
      TRANSPARENT_WINDOW_CLOSE_CURRENT_IPC_CHANNEL
    );
    this.transparentWindowIpcMain?.removeHandler?.(
      TRANSPARENT_WINDOW_ALWAYS_ON_TOP_IPC_CHANNEL
    );
    this.transparentWindowIpcMain?.removeHandler?.(
      TRANSPARENT_WINDOW_RENDER_MARKDOWN_IPC_CHANNEL
    );
    this.transparentWindowIpcMain?.removeHandler?.(
      TRANSPARENT_WINDOW_DRAG_START_IPC_CHANNEL
    );
    this.transparentWindowIpcMain?.removeHandler?.(
      TRANSPARENT_WINDOW_DRAG_STOP_IPC_CHANNEL
    );
    this.transparentWindowIpcMain?.removeHandler?.(
      TRANSPARENT_WINDOW_LEGACY_MOVE_IPC_CHANNEL
    );
    this.transparentWindowIpcMain = null;
    await this.transparentWindowManager?.closeAll();
    this.transparentWindowManager = null;
  }

  async createStickyNote(): Promise<void> {
    await this.ensureStickyNotesFolder();

    const filePath = await this.getAvailableStickyNotePath();
    const file = await this.app.vault.create(
      filePath,
      `${DEFAULT_FRONTMATTER}${DEFAULT_BODY}`
    );

    await this.openStickyNote(file.path);
  }

  async openCurrentNoteAsStickyNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();

    if (!file || file.extension !== "md") {
      new Notice("No active Markdown note to open as a sticky note.");
      return;
    }

    await this.markFileAsSticky(file);
    await this.openStickyNoteWithPreference(file);
  }

  async openCurrentNoteAsTransparentStickyWindow(): Promise<void> {
    const file = this.app.workspace.getActiveFile();

    if (!file) {
      new Notice("No active Markdown note to open as a transparent sticky window.");
      return;
    }

    if (file.extension !== "md") {
      new Notice("Active file is not a Markdown note.");
      return;
    }

    await this.openTransparentStickyWindow(file);
  }

  async openTransparentStickyWindow(
    file: TFile,
    options: TransparentStickyWindowOpenOptions = {}
  ): Promise<boolean> {
    await this.markFileAsSticky(file);
    return (
      (await this.transparentWindowManager?.open(file, options)) === true
    );
  }

  async focusTransparentStickyWindow(file: TFile): Promise<boolean> {
    return (await this.transparentWindowManager?.focus(file)) === true;
  }

  async closeAllTransparentStickyWindows(): Promise<void> {
    await this.transparentWindowManager?.closeAll();
    new Notice("Transparent sticky windows closed.");
  }

  async focusCurrentTransparentStickyWindow(): Promise<void> {
    const file = this.app.workspace.getActiveFile();

    if (!file) {
      new Notice("No active Markdown note to focus as a transparent sticky window.");
      return;
    }

    if (file.extension !== "md") {
      new Notice("Active file is not a Markdown note.");
      return;
    }

    const didFocus = await this.transparentWindowManager?.focus(file);

    if (!didFocus) {
      new Notice("No transparent sticky window is open for current note.");
    }
  }

  async openAllStickyNotes(): Promise<void> {
    const stickyFiles = this.app.vault
      .getMarkdownFiles()
      .filter((file) => this.isStickyFile(file));

    if (stickyFiles.length === 0) {
      new Notice("No sticky notes found.");
      return;
    }

    for (let index = 0; index < stickyFiles.length; index += 1) {
      const offset = (index % WINDOW_OFFSET_CYCLE) * WINDOW_OFFSET_PX;

      await this.openStickyNote(stickyFiles[index].path, {
        x: DEFAULT_X + offset,
        y: DEFAULT_Y + offset
      });
    }
  }

  setCurrentStickyNoteColor(): void {
    const file = this.app.workspace.getActiveFile();

    if (!file) {
      new Notice("No active note to set sticky note color.");
      return;
    }

    if (file.extension !== "md") {
      new Notice("Active file is not a Markdown note.");
      return;
    }

    if (!this.isStickyFile(file)) {
      new Notice("Current Markdown note is not marked as a sticky note.");
    }

    new StickyNoteAppearanceModal(this, file).open();
  }

  async openStickyNote(
    filePath: string,
    options: StickyNoteWindowOptions = {}
  ): Promise<WorkspaceLeaf> {
    const windowOptions = await this.resolveWindowOptions(filePath, options);
    const leaf = this.app.workspace.openPopoutLeaf({
      x: windowOptions.x,
      y: windowOptions.y,
      size: {
        width: windowOptions.width,
        height: windowOptions.height
      }
    });

    await leaf.setViewState({
      type: VIEW_TYPE_STICKY_NOTE,
      active: true,
      state: {
        filePath
      }
    });

    return leaf;
  }

  private renderStickyControls(
    source: string,
    el: HTMLElement,
    sourcePath: string
  ): void {
    const commands = source
      .split(/\r\n|\n|\r/)
      .map((line) => line.trim().toLowerCase());

    if (!commands.includes("open")) {
      return;
    }

    const container = el.createDiv({
      cls: "sticky-controls"
    });

    const button = container.createEl("button", {
      cls: "sticky-controls-button",
      text: "打开为便签",
      attr: {
        type: "button"
      }
    });

    button.addEventListener("click", () => {
      button.disabled = true;
      void this.openStickyControlsSource(sourcePath).finally(() => {
        button.disabled = false;
      });
    });
  }

  private async openStickyControlsSource(sourcePath: string): Promise<void> {
    const abstractFile = this.app.vault.getAbstractFileByPath(sourcePath);

    if (!(abstractFile instanceof TFile)) {
      new Notice("Sticky controls source file not found.");
      return;
    }

    if (abstractFile.extension !== "md") {
      new Notice("Sticky controls source file is not a Markdown note.");
      return;
    }

    try {
      if (!this.isStickyFile(abstractFile)) {
        await this.app.fileManager.processFrontMatter(
          abstractFile,
          (frontmatter) => {
            frontmatter.sticky = true;
          }
        );
      }

      await this.openStickyNoteWithPreference(abstractFile);
    } catch (error) {
      console.error("Failed to open sticky note from controls", error);
      new Notice("Failed to open sticky note.");
    }
  }

  private async openStickyNoteWithPreference(
    file: TFile,
    options: StickyNoteWindowOptions = {}
  ): Promise<void> {
    const useTransparentWindow = await this.shouldUseTransparentWindow(file);

    if (!useTransparentWindow) {
      await this.openStickyNote(file.path, options);
      return;
    }

    const didOpenTransparent = await this.openTransparentStickyWindow(file);

    if (didOpenTransparent) {
      return;
    }

    new Notice(
      "Transparent sticky window is unavailable; opening Obsidian pop-out sticky note."
    );
    await this.openStickyNote(file.path, options);
  }

  private async shouldUseTransparentWindow(file: TFile): Promise<boolean> {
    try {
      const raw = await this.app.vault.read(file);
      return getStickyNoteUseTransparentWindow(splitFrontmatter(raw).frontmatter);
    } catch (error) {
      console.error("Failed to read sticky note open preference", error);
      return DEFAULT_USE_TRANSPARENT_WINDOW;
    }
  }

  private registerTransparentWindowIpc(): void {
    const electron = getElectronModule();
    const ipcMain = electron?.remote?.ipcMain as
      | {
          handle?: (
            channel: string,
            listener: (event: unknown, payload: unknown) => Promise<unknown>
          ) => void;
          removeHandler?: (channel: string) => void;
        }
      | undefined;

    if (!ipcMain?.handle) {
      console.warn("Electron ipcMain is not available for transparent windows.");
      return;
    }

    ipcMain.removeHandler?.(TRANSPARENT_WINDOW_IPC_CHANNEL);
    ipcMain.removeHandler?.(TRANSPARENT_WINDOW_CLOSE_CURRENT_IPC_CHANNEL);
    ipcMain.removeHandler?.(TRANSPARENT_WINDOW_ALWAYS_ON_TOP_IPC_CHANNEL);
    ipcMain.removeHandler?.(TRANSPARENT_WINDOW_RENDER_MARKDOWN_IPC_CHANNEL);
    ipcMain.removeHandler?.(TRANSPARENT_WINDOW_DRAG_START_IPC_CHANNEL);
    ipcMain.removeHandler?.(TRANSPARENT_WINDOW_DRAG_STOP_IPC_CHANNEL);
    ipcMain.removeHandler?.(TRANSPARENT_WINDOW_LEGACY_MOVE_IPC_CHANNEL);
    ipcMain.handle(TRANSPARENT_WINDOW_IPC_CHANNEL, async (event, payload) =>
      this.handleTransparentWindowBridge(event, payload)
    );
    ipcMain.handle(
      TRANSPARENT_WINDOW_CLOSE_CURRENT_IPC_CHANNEL,
      async (event, payload) =>
        this.handleCloseCurrentTransparentWindow(event, payload)
    );
    ipcMain.handle(
      TRANSPARENT_WINDOW_ALWAYS_ON_TOP_IPC_CHANNEL,
      async (event, payload) =>
        this.handleTransparentWindowAlwaysOnTop(event, payload)
    );
    ipcMain.handle(
      TRANSPARENT_WINDOW_RENDER_MARKDOWN_IPC_CHANNEL,
      async (event, payload) =>
        this.handleTransparentWindowRenderMarkdown(event, payload)
    );
    ipcMain.handle(
      TRANSPARENT_WINDOW_DRAG_START_IPC_CHANNEL,
      async (event, payload) =>
        this.handleStartTransparentWindowDrag(event, payload)
    );
    ipcMain.handle(
      TRANSPARENT_WINDOW_DRAG_STOP_IPC_CHANNEL,
      async (event, payload) =>
        this.handleStopTransparentWindowDrag(event, payload)
    );
    this.transparentWindowIpcMain = ipcMain;
  }

  private async handleTransparentWindowBridge(
    event: unknown,
    payload: unknown
  ): Promise<TransparentWindowBridgeResult> {
    if (!isRecord(payload)) {
      return {
        ok: false,
        error: "Invalid transparent window request."
      };
    }

    const filePath = typeof payload.filePath === "string" ? payload.filePath : "";
    const file = this.app.vault.getAbstractFileByPath(filePath);
    const expectedKey =
      typeof payload.fileKey === "string"
        ? normalizeAbsoluteFilePath(payload.fileKey)
        : null;

    if (!(file instanceof TFile) || file.extension !== "md") {
      return {
        ok: false,
        error: "Transparent sticky note file not found."
      };
    }

    const appearanceRecord = isRecord(payload.appearance)
      ? payload.appearance
      : {};
    const color = normalizeStickyNoteColor(appearanceRecord.color);
    const backgroundOpacity = normalizeStickyNoteBackgroundOpacity(
      appearanceRecord.backgroundOpacity
    );
    const textTone = normalizeStickyNoteTextTone(appearanceRecord.textTone);
    const useTransparentWindow = normalizeStickyNoteUseTransparentWindow(
      appearanceRecord.useTransparentWindow
    );

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.sticky = true;
        frontmatter.color = color;
        frontmatter.backgroundOpacity = backgroundOpacity;
        frontmatter.textTone = textTone;
        frontmatter.textOpacity = Math.abs(textTone);
        frontmatter.textColor = buildStickyNoteTextColorHexFromTone(textTone);
        frontmatter.useTransparentWindow = useTransparentWindow;
        frontmatter.width = frontmatter.width ?? DEFAULT_WIDTH;
        frontmatter.height = frontmatter.height ?? DEFAULT_HEIGHT;
      });

      const raw = await this.app.vault.read(file);
      const parts = splitFrontmatter(raw);
      const appearance = getStickyNoteAppearance(parts.frontmatter);
      let switchToPopout = false;
      let switchBoundsPreserved = false;
      let closeSourceWindow: boolean | undefined;
      let sourceCloseDestroyedFallback: boolean | undefined;
      let sourceCloseMethod: TransparentWindowLookupMethod | undefined;
      let warning: string | undefined;

      if (payload.switchMode === true && !appearance.useTransparentWindow) {
        const sourceWindowOptions =
          normalizeStickyNoteWindowOptions(payload.sourceWindowBounds) ??
          getStickyNoteWindowOptionsFromIpcEvent(event);
        switchBoundsPreserved = sourceWindowOptions !== null;
        console.debug("Sticky transparent switch to popout started", {
          fileKey: expectedKey,
          filePath,
          sourceWindowOptions,
          switchBoundsPreserved
        });
        const popoutLeaf = await this.openStickyNote(
          file.path,
          sourceWindowOptions ?? {}
        );
        this.focusStickyPopoutLeaf(popoutLeaf);
        console.debug("Sticky transparent switch to popout opened", {
          fileKey: expectedKey,
          filePath,
          sourceWindowOptions
        });
        switchToPopout = true;
        const sourceCloseResult =
          await this.closeTransparentSwitchToPopoutSourceFromEvent(
            event,
            expectedKey,
            filePath
          );
        closeSourceWindow = sourceCloseResult.closed;
        sourceCloseDestroyedFallback = sourceCloseResult.destroyedFallback;
        sourceCloseMethod = sourceCloseResult.method;

        if (!sourceCloseResult.closed) {
          warning =
            sourceCloseResult.error ??
            "Source transparent BrowserWindow did not close.";
        }

        console.debug(
          "Sticky transparent switch to popout source close completed",
          {
            closeSourceWindow,
            destroyedFallback: sourceCloseDestroyedFallback,
            fileKey: expectedKey,
            filePath,
            method: sourceCloseMethod,
            warning
          }
        );
      }

      return {
        ok: true,
        appearance,
        closeSourceWindow,
        frontmatter: parts.frontmatter,
        sourceCloseDestroyedFallback,
        sourceCloseMethod,
        switchBoundsPreserved,
        switchToPopout,
        warning
      };
    } catch (error) {
      console.error("Failed to apply transparent window appearance", error);
      return {
        ok: false,
        error: "Failed to update sticky note appearance."
      };
    }
  }

  private focusStickyPopoutLeaf(leaf: WorkspaceLeaf): void {
    try {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    } catch (error) {
      console.warn("Failed to focus sticky Pop-out leaf.", error);

      try {
        this.app.workspace.setActiveLeaf(leaf, false, true);
      } catch (legacyError) {
        console.warn("Failed to focus sticky Pop-out leaf fallback.", legacyError);
      }
    }
  }

  private async closeTransparentSwitchToPopoutSourceFromEvent(
    event: unknown,
    expectedKey: string | null,
    filePath: string
  ): Promise<TransparentSwitchSourceCloseResult> {
    let target: TransparentWindowCloseTarget | null = null;

    try {
      target = await resolveCurrentTransparentWindowCloseTarget(
        event,
        expectedKey
      );
    } catch (error) {
      const message = `Failed to resolve source transparent BrowserWindow: ${formatUnknownError(
        error
      )}`;
      console.warn(
        "Sticky transparent switch to popout source close failed",
        error
      );
      return {
        closed: false,
        destroyedFallback: false,
        error: message
      };
    }

    if (!target) {
      const message = "Source transparent BrowserWindow was not found.";
      console.warn(
        "Sticky transparent switch to popout source close failed",
        message
      );
      return {
        closed: false,
        destroyedFallback: false,
        error: message
      };
    }

    const keysToUnregister = new Set(
      [target.key, expectedKey].filter(
        (key): key is string => typeof key === "string" && key.length > 0
      )
    );

    console.debug(
      "Sticky transparent switch to popout source close started",
      {
        fileKey: expectedKey,
        filePath,
        method: target.method
      }
    );

    return this.closeTransparentSwitchToPopoutSource(
      target,
      keysToUnregister,
      expectedKey,
      filePath
    );
  }

  private async closeTransparentSwitchToPopoutSource(
    target: TransparentWindowCloseTarget,
    keysToUnregister: Set<string>,
    expectedKey: string | null,
    filePath: string
  ): Promise<TransparentSwitchSourceCloseResult> {
    let stoppedDragSessions = 0;
    let unregistered = 0;

    try {
      stoppedDragSessions = this.stopTransparentWindowDragSessionsForWindowCount(
        target.browserWindow,
        null,
        "switch-to-popout-source-close"
      );

      if (!isBrowserWindowAlive(target.browserWindow)) {
        unregistered = unregisterTransparentWindowKeys(keysToUnregister);
        console.debug("Sticky transparent source close cleanup", {
          fileKey: expectedKey,
          stoppedDragSessions,
          unregistered
        });
        console.debug("Sticky transparent switch to popout source closed", {
          alreadyDestroyed: true,
          fileKey: expectedKey,
          filePath,
          method: target.method
        });
        return {
          closed: true,
          destroyedFallback: false,
          method: target.method
        };
      }

      await flushTransparentBrowserWindowPendingSave(target.browserWindow);
      const closeResult = await closeBrowserWindowWithFallback(
        target.browserWindow
      );

      if (closeResult.closed === true) {
        unregistered = unregisterTransparentWindowKeys(keysToUnregister);
        console.debug("Sticky transparent source close cleanup", {
          fileKey: expectedKey,
          stoppedDragSessions,
          unregistered
        });
        console.debug("Sticky transparent switch to popout source closed", {
          destroyedFallback: closeResult.destroyedFallback,
          fileKey: expectedKey,
          filePath,
          method: target.method
        });
        return {
          closed: true,
          destroyedFallback: closeResult.destroyedFallback,
          error: closeResult.error,
          method: target.method
        };
      }

      console.warn(
        "Sticky transparent switch to popout source close failed",
        closeResult.error || closeResult
      );
      console.debug("Sticky transparent source close cleanup", {
        fileKey: expectedKey,
        stoppedDragSessions,
        unregistered
      });
      return {
        closed: false,
        destroyedFallback: closeResult.destroyedFallback,
        error:
          closeResult.error ||
          "Source transparent BrowserWindow close did not complete.",
        method: target.method
      };
    } catch (error) {
      console.warn(
        "Sticky transparent switch to popout source close failed",
        error
      );
      console.debug("Sticky transparent source close cleanup", {
        fileKey: expectedKey,
        stoppedDragSessions,
        unregistered
      });
      return {
        closed: false,
        destroyedFallback: false,
        error: formatUnknownError(error),
        method: target.method
      };
    }
  }

  private async handleCloseCurrentTransparentWindow(
    event: unknown,
    payload: unknown
  ): Promise<TransparentWindowCloseCurrentResult> {
    const payloadRecord = isRecord(payload) ? payload : {};
    const expectedKey =
      typeof payloadRecord.fileKey === "string"
        ? normalizeAbsoluteFilePath(payloadRecord.fileKey)
        : null;
    const target = await resolveCurrentTransparentWindowCloseTarget(
      event,
      expectedKey
    );

    if (!target) {
      return {
        ok: false,
        closed: false,
        destroyedFallback: false,
        error: "Current transparent sticky window was not found."
      };
    }

    const keysToUnregister = new Set(
      [target.key, expectedKey].filter(
        (key): key is string => typeof key === "string" && key.length > 0
      )
    );

    for (const key of keysToUnregister) {
      unregisterTransparentWindow(key);
    }

    const closeResult = await closeBrowserWindowWithFallback(
      target.browserWindow
    );

    return {
      ok: true,
      closed: closeResult.closed,
      destroyedFallback: closeResult.destroyedFallback,
      method: target.method,
      error: closeResult.error
    };
  }

  private async handleTransparentWindowAlwaysOnTop(
    event: unknown,
    payload: unknown
  ): Promise<TransparentWindowAlwaysOnTopResult> {
    const fail = (
      error: string | unknown,
      saveFailed = false
    ): TransparentWindowAlwaysOnTopResult => {
      console.warn("Sticky transparent always-on-top failed", error);
      return {
        ok: false,
        error: typeof error === "string" ? error : formatUnknownError(error),
        saveFailed
      };
    };

    if (!isRecord(payload)) {
      return fail("Invalid transparent always-on-top request.");
    }

    const filePath = typeof payload.filePath === "string" ? payload.filePath : "";
    const file = this.app.vault.getAbstractFileByPath(filePath);
    const expectedKey =
      typeof payload.fileKey === "string"
        ? normalizeAbsoluteFilePath(payload.fileKey)
        : null;
    const alwaysOnTop = normalizeStickyNoteTransparentAlwaysOnTop(
      payload.alwaysOnTop
    );

    if (!(file instanceof TFile) || file.extension !== "md") {
      return fail("Transparent sticky note file not found.", true);
    }

    const identity = getTransparentWindowIdentity(this, file);

    if (
      !identity ||
      (expectedKey !== null && identity.key !== expectedKey)
    ) {
      return fail("Transparent always-on-top request does not match current note.");
    }

    const eventWindow = getBrowserWindowFromIpcEvent(event);
    const target = await buildTransparentWindowCloseTarget(
      eventWindow,
      expectedKey,
      "fromWebContents",
      true,
      false
    );

    if (!target) {
      return fail("Current transparent sticky window was not found.");
    }

    if (target.key !== null && target.key !== identity.key) {
      return fail("Current transparent window does not match requested note.");
    }

    let previousAlwaysOnTop = !alwaysOnTop;

    try {
      if (typeof target.browserWindow?.isAlwaysOnTop === "function") {
        previousAlwaysOnTop = Boolean(target.browserWindow.isAlwaysOnTop());
      }
    } catch (error) {
      console.warn("Failed to read transparent always-on-top state.", error);
    }

    if (
      !applyTransparentBrowserWindowAlwaysOnTop(
        target.browserWindow,
        alwaysOnTop
      )
    ) {
      return fail("Electron BrowserWindow.setAlwaysOnTop is unavailable.");
    }

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.sticky = true;
        frontmatter.transparentAlwaysOnTop = alwaysOnTop;
      });

      console.debug("Sticky transparent always-on-top changed", {
        alwaysOnTop,
        fileKey: target.key ?? expectedKey,
        filePath
      });

      return {
        ok: true,
        alwaysOnTop
      };
    } catch (error) {
      applyTransparentBrowserWindowAlwaysOnTop(
        target.browserWindow,
        previousAlwaysOnTop
      );
      return fail(error, true);
    }
  }

  private async handleTransparentWindowRenderMarkdown(
    event: unknown,
    payload: unknown
  ): Promise<TransparentWindowRenderMarkdownAcceptResult> {
    const requestId =
      isRecord(payload) && typeof payload.requestId === "string"
        ? payload.requestId
        : "";
    const sendResult = (
      result: Omit<TransparentWindowRenderMarkdownResultPayload, "requestId">
    ): boolean =>
      sendIpcEventPayload(
        event,
        TRANSPARENT_WINDOW_RENDER_MARKDOWN_RESULT_IPC_CHANNEL,
        {
          requestId,
          ...result
        }
      );
    const fail = (
      error: string | unknown
    ): TransparentWindowRenderMarkdownAcceptResult => {
      const message =
        typeof error === "string" ? error : formatUnknownError(error);
      console.warn("Sticky transparent Markdown preview failed", error);
      sendResult({
        ok: false,
        error: message
      });
      return {
        ok: false,
        error: message
      };
    };

    if (!isRecord(payload)) {
      return fail("Invalid transparent Markdown preview request.");
    }

    const filePath = typeof payload.filePath === "string" ? payload.filePath : "";
    const file = this.app.vault.getAbstractFileByPath(filePath);
    const expectedKey =
      typeof payload.fileKey === "string"
        ? normalizeAbsoluteFilePath(payload.fileKey)
        : null;

    if (!(file instanceof TFile) || file.extension !== "md") {
      return fail("Transparent sticky note file not found.");
    }

    const identity = getTransparentWindowIdentity(this, file);

    if (
      !identity ||
      (expectedKey !== null && identity.key !== expectedKey)
    ) {
      return fail("Transparent Markdown preview request does not match current note.");
    }

    const eventWindow = getBrowserWindowFromIpcEvent(event);
    const target = await buildTransparentWindowCloseTarget(
      eventWindow,
      expectedKey,
      "fromWebContents",
      true,
      false
    );

    if (!target) {
      return fail("Current transparent sticky window was not found.");
    }

    if (target.key !== null && target.key !== identity.key) {
      return fail("Current transparent window does not match requested note.");
    }

    try {
      const raw = await this.app.vault.read(file);
      const parts = splitFrontmatter(raw);
      const bodyParts = extractStickyControlsBlocks(parts.body);
      const previewEl = document.createElement("div");
      await MarkdownRenderer.render(
        this.app,
        bodyParts.visibleBody,
        previewEl,
        file.path,
        this
      );

      const html = previewEl.innerHTML;
      sendResult({
        ok: true,
        html
      });
      console.debug("Sticky transparent Markdown preview rendered", {
        requestId,
        filePath,
        htmlLength: html.length
      });

      return {
        ok: true,
        accepted: true
      };
    } catch (error) {
      return fail(error);
    }
  }

  private async handleStartTransparentWindowDrag(
    event: unknown,
    payload: unknown
  ): Promise<TransparentWindowDragStartResult> {
    const fail = (error: string | unknown): TransparentWindowDragStartResult => {
      console.warn("Sticky transparent drag session failed", error);
      return {
        ok: false,
        error: typeof error === "string" ? error : formatUnknownError(error)
      };
    };

    if (!isRecord(payload)) {
      return fail("Invalid transparent window drag start request.");
    }

    const expectedKey =
      typeof payload.fileKey === "string"
        ? normalizeAbsoluteFilePath(payload.fileKey)
        : null;

    if (!expectedKey) {
      return fail("Transparent window drag start request is missing fileKey.");
    }

    const target = await resolveCurrentTransparentWindowCloseTarget(
      event,
      expectedKey
    );

    if (!target) {
      return fail("Current transparent sticky window was not found.");
    }

    const startBounds = getBrowserWindowBounds(target.browserWindow);

    if (!startBounds) {
      return fail("Transparent window bounds are unavailable.");
    }

    const screen = getElectronScreenModule();

    if (!screen) {
      return fail("Electron screen.getCursorScreenPoint is unavailable.");
    }

    const startCursor = getCursorScreenPoint(screen);

    if (!startCursor) {
      return fail("Electron cursor screen point is unavailable.");
    }

    this.stopDestroyedTransparentWindowDragSessions("start-cleanup");
    this.stopTransparentWindowDragSession(expectedKey, "restart");
    this.stopTransparentWindowDragSessionsForWindow(
      target.browserWindow,
      expectedKey,
      "same-window-restart"
    );

    const session: TransparentWindowDragSession = {
      browserWindow: target.browserWindow,
      closedListener: null,
      didMoveLog: false,
      didWarnSlowTick: false,
      didWarnLog: false,
      isMoving: false,
      key: expectedKey,
      lastTickAt: Date.now(),
      lastMoveAt: 0,
      lastX: startBounds.x,
      lastY: startBounds.y,
      maxTickDelay: 0,
      method: target.method,
      moveCount: 0,
      screen,
      startBounds,
      startCursor,
      timer: null,
      timeoutTimer: null
    };

    session.closedListener = () => {
      this.stopTransparentWindowDragSession(expectedKey, "window-closed");
    };

    try {
      target.browserWindow.once?.("closed", session.closedListener);
    } catch (error) {
      logDeadTransparentBrowserWindow(error);
      session.closedListener = null;
    }

    session.timer = setInterval(() => {
      this.moveTransparentWindowDragSession(expectedKey);
    }, TRANSPARENT_WINDOW_DRAG_INTERVAL_MS);
    session.timeoutTimer = setTimeout(() => {
      this.stopTransparentWindowDragSession(expectedKey, "timeout");
    }, TRANSPARENT_WINDOW_DRAG_MAX_DURATION_MS);
    this.transparentWindowDragSessions.set(expectedKey, session);

    console.debug("Sticky transparent drag session started", {
      method: target.method,
      startBounds,
      startCursor
    });

    return {
      ok: true,
      method: target.method
    };
  }

  private async handleStopTransparentWindowDrag(
    event: unknown,
    payload: unknown
  ): Promise<TransparentWindowDragStopResult> {
    const payloadRecord = isRecord(payload) ? payload : {};
    const expectedKey =
      typeof payloadRecord.fileKey === "string"
        ? normalizeAbsoluteFilePath(payloadRecord.fileKey)
        : null;

    let didStop = false;

    if (expectedKey) {
      didStop = this.stopTransparentWindowDragSession(expectedKey, "stop");
    }

    const browserWindow = getBrowserWindowFromIpcEvent(event);
    didStop =
      this.stopTransparentWindowDragSessionsForWindow(
        browserWindow,
        didStop ? expectedKey : null,
        "stop"
      ) || didStop;

    return { ok: true };
  }

  private moveTransparentWindowDragSession(key: string): void {
    const session = this.transparentWindowDragSessions.get(key);

    if (!session) {
      return;
    }

    const now = Date.now();
    const tickDelay = Math.max(0, now - session.lastTickAt);
    session.lastTickAt = now;
    session.maxTickDelay = Math.max(session.maxTickDelay, tickDelay);

    if (
      tickDelay > TRANSPARENT_WINDOW_SLOW_TICK_WARNING_MS &&
      !session.didWarnSlowTick
    ) {
      session.didWarnSlowTick = true;
      console.warn("Sticky transparent drag session tick delayed", {
        fileKey: key,
        maxTickDelay: session.maxTickDelay,
        moveCount: session.moveCount,
        tickDelay
      });
    }

    if (session.isMoving) {
      return;
    }

    if (!isBrowserWindowAlive(session.browserWindow)) {
      this.stopTransparentWindowDragSession(key, "window-closed");
      return;
    }

    session.isMoving = true;

    try {
      const cursor = getCursorScreenPoint(session.screen);

      if (!cursor) {
        this.warnTransparentWindowDragSession(
          session,
          "Electron cursor screen point is unavailable."
        );
        this.stopTransparentWindowDragSession(key, "cursor-unavailable");
        return;
      }

      const rawNextX =
        session.startBounds.x + cursor.x - session.startCursor.x;
      const rawNextY =
        session.startBounds.y + cursor.y - session.startCursor.y;
      const nextX = Math.round(rawNextX);
      const nextY = Math.round(rawNextY);

      if (
        Math.abs(rawNextX - session.lastX) < 1 &&
        Math.abs(rawNextY - session.lastY) < 1
      ) {
        return;
      }

      if (nextX === session.lastX && nextY === session.lastY) {
        return;
      }

      if (typeof session.browserWindow.setPosition === "function") {
        session.browserWindow.setPosition(nextX, nextY);
      } else if (typeof session.browserWindow.setBounds === "function") {
        session.browserWindow.setBounds({
          x: nextX,
          y: nextY
        });
      } else {
        throw new Error("Transparent BrowserWindow move API is unavailable.");
      }

      session.lastMoveAt = Date.now();
      session.lastX = nextX;
      session.lastY = nextY;
      session.moveCount += 1;

      if (!session.didMoveLog) {
        session.didMoveLog = true;
        console.debug("Sticky transparent drag session moved", {
          method: session.method,
          moveCount: session.moveCount,
          x: nextX,
          y: nextY
        });
      }
    } catch (error) {
      this.warnTransparentWindowDragSession(session, error);
      this.stopTransparentWindowDragSession(key, "move-failed");
    } finally {
      session.isMoving = false;
    }
  }

  private warnTransparentWindowDragSession(
    session: TransparentWindowDragSession,
    error: unknown
  ): void {
    if (session.didWarnLog) {
      return;
    }

    session.didWarnLog = true;
    console.warn("Sticky transparent drag session failed", error);
  }

  private stopTransparentWindowDragSession(
    key: string,
    reason: string
  ): boolean {
    const session = this.transparentWindowDragSessions.get(key);

    if (!session) {
      return false;
    }

    if (session.timer !== null) {
      clearInterval(session.timer);
    }

    if (session.timeoutTimer !== null) {
      clearTimeout(session.timeoutTimer);
    }

    if (session.closedListener !== null) {
      try {
        session.browserWindow?.removeListener?.(
          "closed",
          session.closedListener
        );
      } catch (error) {
        logDeadTransparentBrowserWindow(error);
      }
      session.closedListener = null;
    }

    session.isMoving = false;
    this.transparentWindowDragSessions.delete(key);
    console.debug("Sticky transparent drag session stopped", {
      fileKey: key,
      lastMoveAt: session.lastMoveAt,
      maxTickDelay: session.maxTickDelay,
      moveCount: session.moveCount,
      reason
    });
    return true;
  }

  private stopTransparentWindowDragSessionsForWindow(
    browserWindow: any,
    exceptKey: string | null,
    reason: string
  ): boolean {
    return (
      this.stopTransparentWindowDragSessionsForWindowCount(
        browserWindow,
        exceptKey,
        reason
      ) > 0
    );
  }

  private stopTransparentWindowDragSessionsForWindowCount(
    browserWindow: any,
    exceptKey: string | null,
    reason: string
  ): number {
    if (!browserWindow) {
      return 0;
    }

    let stoppedCount = 0;

    for (const [key, session] of Array.from(
      this.transparentWindowDragSessions.entries()
    )) {
      if (
        key !== exceptKey &&
        browserWindowsAreSame(session.browserWindow, browserWindow)
      ) {
        stoppedCount += this.stopTransparentWindowDragSession(key, reason)
          ? 1
          : 0;
      }
    }

    return stoppedCount;
  }

  private stopDestroyedTransparentWindowDragSessions(reason: string): boolean {
    return this.stopDestroyedTransparentWindowDragSessionsCount(reason) > 0;
  }

  private stopDestroyedTransparentWindowDragSessionsCount(
    reason: string
  ): number {
    let stoppedCount = 0;

    for (const [key, session] of Array.from(
      this.transparentWindowDragSessions.entries()
    )) {
      if (!isBrowserWindowAlive(session.browserWindow)) {
        stoppedCount += this.stopTransparentWindowDragSession(key, reason)
          ? 1
          : 0;
      }
    }

    return stoppedCount;
  }

  private stopAllTransparentWindowDragSessions(reason: string): void {
    for (const key of Array.from(this.transparentWindowDragSessions.keys())) {
      this.stopTransparentWindowDragSession(key, reason);
    }
  }

  cleanupTransparentWindowOpenState(
    identity: TransparentWindowIdentity
  ): TransparentOpenCleanupResult {
    return {
      closedDuplicateWindows: 0,
      duplicateCount: 0,
      removedStaleWindows: pruneDestroyedTransparentWindowRegistryEntries(),
      stoppedDragSessions: this.stopDestroyedTransparentWindowDragSessionsCount(
        "transparent-open-cleanup"
      )
    };
  }

  scheduleDelayedTransparentDuplicateCleanup(
    identity: TransparentWindowIdentity,
    BrowserWindow: any,
    preferredWindow: any
  ): void {
    setTimeout(() => {
      void this.cleanupTransparentWindowDuplicates(
        identity,
        BrowserWindow,
        preferredWindow
      );
    }, TRANSPARENT_DUPLICATE_CLEANUP_DELAY_MS);
  }

  private async cleanupTransparentWindowDuplicates(
    identity: TransparentWindowIdentity,
    BrowserWindow: any,
    preferredWindow: any
  ): Promise<void> {
    const result: TransparentOpenCleanupResult = {
      closedDuplicateWindows: 0,
      duplicateCount: 0,
      removedStaleWindows: pruneDestroyedTransparentWindowRegistryEntries(),
      stoppedDragSessions: this.stopDestroyedTransparentWindowDragSessionsCount(
        "transparent-delayed-duplicate-cleanup"
      )
    };
    const matchingWindows = await findTransparentWindowsMatchingIdentity(
      BrowserWindow,
      identity
    );
    result.duplicateCount = matchingWindows.length;

    const registeredWindow = getRegisteredTransparentWindow(identity);
    const keepWindow =
      (isBrowserWindowAlive(preferredWindow) ? preferredWindow : null) ??
      matchingWindows.find((candidate) =>
        browserWindowsAreSame(candidate, registeredWindow)
      ) ?? matchingWindows[0];

    if (matchingWindows.length > 1) {
      console.warn("Duplicate transparent sticky windows found", {
        count: matchingWindows.length,
        fileKey: identity.key
      });
    }

    if (isBrowserWindowAlive(keepWindow)) {
      registerTransparentWindow(identity, keepWindow);
    }

    console.debug("Sticky transparent delayed duplicate cleanup", {
      duplicateCount: result.duplicateCount,
      fileKey: identity.key,
      keptWindowId: getBrowserWindowId(keepWindow),
      removedStaleWindows: result.removedStaleWindows,
      stoppedDragSessions: result.stoppedDragSessions
    });
  }

  private async ensureStickyNotesFolder(): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(STICKY_NOTES_FOLDER);

    if (!existing) {
      await this.app.vault.createFolder(STICKY_NOTES_FOLDER);
      return;
    }

    if (existing instanceof TFile) {
      throw new Error(`${STICKY_NOTES_FOLDER} exists but is not a folder.`);
    }
  }

  private async getAvailableStickyNotePath(): Promise<string> {
    const timestamp = formatTimestamp(new Date());
    let filePath = `${STICKY_NOTES_FOLDER}/${timestamp}.md`;
    let index = 1;

    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = `${STICKY_NOTES_FOLDER}/${timestamp}-${index}.md`;
      index += 1;
    }

    return filePath;
  }

  private async markFileAsSticky(file: TFile): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.sticky = true;
      frontmatter.color = frontmatter.color ?? DEFAULT_COLOR_HEX;
      frontmatter.backgroundOpacity =
        frontmatter.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY;
      frontmatter.textTone = frontmatter.textTone ?? DEFAULT_TEXT_TONE;
      frontmatter.textOpacity =
        frontmatter.textOpacity ?? DEFAULT_TEXT_OPACITY;
      frontmatter.textColor =
        frontmatter.textColor ?? DEFAULT_TEXT_COLOR_HEX;
      frontmatter.useTransparentWindow =
        frontmatter.useTransparentWindow ?? DEFAULT_USE_TRANSPARENT_WINDOW;
      frontmatter.transparentAlwaysOnTop =
        frontmatter.transparentAlwaysOnTop ?? DEFAULT_TRANSPARENT_ALWAYS_ON_TOP;
      frontmatter.windowOpacity =
        frontmatter.windowOpacity ?? DEFAULT_WINDOW_OPACITY;
      frontmatter.width = frontmatter.width ?? DEFAULT_WIDTH;
      frontmatter.height = frontmatter.height ?? DEFAULT_HEIGHT;
    });
  }

  private isStickyFile(file: TFile): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const sticky = cache?.frontmatter?.sticky;

    return sticky === true || sticky === "true";
  }

  private async resolveWindowOptions(
    filePath: string,
    options: StickyNoteWindowOptions
  ): Promise<Required<StickyNoteWindowOptions>> {
    return {
      x: getFiniteNumber(options.x, DEFAULT_X),
      y: getFiniteNumber(options.y, DEFAULT_Y),
      width: getPositiveNumber(options.width, DEFAULT_WIDTH),
      height: getPositiveNumber(options.height, DEFAULT_HEIGHT)
    };
  }

  private async readStickyNoteFrontmatter(
    filePath: string
  ): Promise<Record<string, unknown>> {
    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);

    if (!(abstractFile instanceof TFile)) {
      return {};
    }

    try {
      const raw = await this.app.vault.read(abstractFile);
      return parseFrontmatterRecord(splitFrontmatter(raw).frontmatter);
    } catch (error) {
      console.error("Failed to read sticky note frontmatter", error);
      return {};
    }
  }
}

class TransparentStickyWindowManager {
  private readonly windows = new Map<string, TransparentStickyWindowController>();

  constructor(private readonly plugin: StickyPopoutNotesPlugin) {}

  async open(
    file: TFile,
    options: TransparentStickyWindowOpenOptions = {}
  ): Promise<boolean> {
    const context = this.resolveOpenContext(file);

    if (!context) {
      return false;
    }

    const { BrowserWindow, identity } = context;
    const cleanup = this.plugin.cleanupTransparentWindowOpenState(identity);
    let removedStaleTrackedController = 0;
    const tracked = this.windows.get(identity.key);

    if (tracked?.isDestroyed()) {
      this.windows.delete(identity.key);
      removedStaleTrackedController = 1;
    }

    const reusable = await this.findReusableController(
      file,
      identity,
      BrowserWindow
    );
    console.debug("Sticky transparent open cleanup", {
      fileKey: identity.key,
      removedStaleWindows:
        cleanup.removedStaleWindows + removedStaleTrackedController,
      reusedExisting: Boolean(reusable),
      stoppedDragSessions: cleanup.stoppedDragSessions
    });

    if (reusable) {
      reusable.focus();
      this.plugin.scheduleDelayedTransparentDuplicateCleanup(
        identity,
        BrowserWindow,
        reusable.getBrowserWindow()
      );
      return true;
    }

    try {
      const controller = await TransparentStickyWindowController.create(
        this.plugin,
        file,
        BrowserWindow,
        identity,
        () => {
          this.unregister(identity.key);
        }
      );
      this.register(identity, controller);
      const didOpen = await controller.open();

      if (didOpen) {
        if (options.showNotice !== false) {
          new Notice("Transparent sticky window opened.");
        }
        this.plugin.scheduleDelayedTransparentDuplicateCleanup(
          identity,
          BrowserWindow,
          controller.getBrowserWindow()
        );
        return true;
      } else {
        this.unregister(identity.key);
        return false;
      }
    } catch (error) {
      console.error("Failed to open transparent sticky window", error);
      this.unregister(identity.key);
      new Notice("Failed to open transparent sticky window.");
      return false;
    }
  }

  async focus(file: TFile): Promise<boolean> {
    const context = this.resolveOpenContext(file, false);

    if (!context) {
      return false;
    }

    const reusable = await this.findReusableController(
      file,
      context.identity,
      context.BrowserWindow
    );

    if (!reusable) {
      return false;
    }

    reusable.focus();
    return true;
  }

  async closeAll(): Promise<void> {
    const controllers = new Map<string, TransparentStickyWindowController>();

    for (const [key, controller] of this.windows) {
      controllers.set(key, controller);
    }

    const BrowserWindow = getBrowserWindowConstructor();

    if (BrowserWindow) {
      for (const browserWindow of await findAllTransparentWindows(BrowserWindow)) {
        const key = await getTransparentWindowKeyFromBrowserWindow(browserWindow);
        const controller = TransparentStickyWindowController.fromExisting(
          this.plugin,
          null,
          browserWindow,
          key ? buildTransparentWindowIdentityFromKey(key) : null,
          () => {
            if (key) {
              this.unregister(key);
            }
          }
        );

        controllers.set(key ?? `window-${controllers.size}`, controller);
      }
    }

    const registry = getTransparentWindowRegistry();

    for (const [key, entry] of registry) {
      if (isBrowserWindowAlive(entry.browserWindow)) {
        const controller = TransparentStickyWindowController.fromExisting(
          this.plugin,
          null,
          entry.browserWindow,
          buildTransparentWindowIdentityFromKey(key),
          () => {
            this.unregister(key);
          }
        );
        controllers.set(key, controller);
      }
    }

    this.windows.clear();
    registry.clear();

    for (const controller of controllers.values()) {
      await controller.close();
    }
  }

  private resolveOpenContext(
    file: TFile,
    showUnsupportedNotice = true
  ): { BrowserWindow: any; identity: TransparentWindowIdentity } | null {
    const identity = getTransparentWindowIdentity(this.plugin, file);

    if (!identity) {
      console.warn("Vault base path is not available for transparent window.");

      if (showUnsupportedNotice) {
        new Notice(
          "Transparent BrowserWindow is not available in this Obsidian environment."
        );
      }

      return null;
    }

    const BrowserWindow = getBrowserWindowConstructor();

    if (!BrowserWindow) {
      if (showUnsupportedNotice) {
        new Notice(
          "Transparent BrowserWindow is not available in this Obsidian environment."
        );
      }

      return null;
    }

    return { BrowserWindow, identity };
  }

  private async findReusableController(
    file: TFile,
    identity: TransparentWindowIdentity,
    BrowserWindow: any
  ): Promise<TransparentStickyWindowController | null> {
    const tracked = this.windows.get(identity.key);

    if (tracked && !tracked.isDestroyed()) {
      this.register(identity, tracked);
      return tracked;
    }

    this.windows.delete(identity.key);

    const registeredWindow = getRegisteredTransparentWindow(identity);

    if (registeredWindow) {
      return this.wrapExisting(file, identity, registeredWindow);
    }

    const scannedWindow = await findExistingTransparentWindow(
      BrowserWindow,
      identity
    );

    return scannedWindow ? this.wrapExisting(file, identity, scannedWindow) : null;
  }

  private wrapExisting(
    file: TFile,
    identity: TransparentWindowIdentity,
    browserWindow: any
  ): TransparentStickyWindowController {
    const controller = TransparentStickyWindowController.fromExisting(
      this.plugin,
      file,
      browserWindow,
      identity,
      () => {
        this.unregister(identity.key);
      }
    );
    this.register(identity, controller);
    return controller;
  }

  private register(
    identity: TransparentWindowIdentity,
    controller: TransparentStickyWindowController
  ): void {
    this.windows.set(identity.key, controller);
    registerTransparentWindow(identity, controller.getBrowserWindow());
  }

  private unregister(key: string): void {
    this.windows.delete(key);
    unregisterTransparentWindow(key);
  }
}

class TransparentStickyWindowController {
  private isTrackingClosed = false;

  private constructor(
    private readonly plugin: StickyPopoutNotesPlugin,
    private readonly file: TFile | null,
    private readonly browserWindow: any,
    private readonly html: string,
    private readonly identity: TransparentWindowIdentity | null,
    private readonly onClosed: () => void
  ) {}

  static fromExisting(
    plugin: StickyPopoutNotesPlugin,
    file: TFile | null,
    browserWindow: any,
    identity: TransparentWindowIdentity | null,
    onClosed: () => void
  ): TransparentStickyWindowController {
    const controller = new TransparentStickyWindowController(
      plugin,
      file,
      browserWindow,
      "",
      identity,
      onClosed
    );

    if (identity) {
      callBrowserWindowMethod(browserWindow, "setTitle", identity.title);
    }

    controller.trackClosed();
    return controller;
  }

  static async create(
    plugin: StickyPopoutNotesPlugin,
    file: TFile,
    BrowserWindow: any,
    identity: TransparentWindowIdentity,
    onClosed: () => void
  ): Promise<TransparentStickyWindowController> {
    const raw = await plugin.app.vault.read(file);
    const parts = splitFrontmatter(raw);
    const bodyParts = extractStickyControlsBlocks(parts.body);
    const appearance = getStickyNoteAppearance(parts.frontmatter);
    const alwaysOnTop = getStickyNoteTransparentAlwaysOnTop(parts.frontmatter);
    const options = getTransparentWindowOptions(parts.frontmatter);
    const html = buildTransparentStickyHtml({
      absoluteFilePath: identity.absoluteFilePath,
      appearance,
      alwaysOnTop,
      alwaysOnTopIpcChannel: TRANSPARENT_WINDOW_ALWAYS_ON_TOP_IPC_CHANNEL,
      closeCurrentWindowIpcChannel: TRANSPARENT_WINDOW_CLOSE_CURRENT_IPC_CHANNEL,
      defaultFrontmatter: DEFAULT_FRONTMATTER,
      dragStartIpcChannel: TRANSPARENT_WINDOW_DRAG_START_IPC_CHANNEL,
      dragStopIpcChannel: TRANSPARENT_WINDOW_DRAG_STOP_IPC_CHANNEL,
      fileKey: identity.key,
      filePath: file.path,
      frontmatter: parts.frontmatter,
      hiddenStickyControlsBlocks: bodyParts.hiddenBlocks,
      ipcChannel: TRANSPARENT_WINDOW_IPC_CHANNEL,
      renderMarkdownIpcChannel: TRANSPARENT_WINDOW_RENDER_MARKDOWN_IPC_CHANNEL,
      renderMarkdownResultIpcChannel:
        TRANSPARENT_WINDOW_RENDER_MARKDOWN_RESULT_IPC_CHANNEL,
      title: getBasename(file.path),
      visibleBody: bodyParts.visibleBody,
      windowTitle: identity.title
    });
    const browserWindow = new BrowserWindow({
      alwaysOnTop,
      backgroundColor: "#00000000",
      frame: false,
      height: options.height,
      resizable: true,
      show: false,
      skipTaskbar: false,
      title: identity.title,
      transparent: true,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      },
      width: options.width
    });
    applyTransparentBrowserWindowAlwaysOnTop(browserWindow, alwaysOnTop);

    const controller = new TransparentStickyWindowController(
      plugin,
      file,
      browserWindow,
      html,
      identity,
      onClosed
    );

    callBrowserWindowMethod(browserWindow, "setTitle", identity.title);

    return controller;
  }

  async open(): Promise<boolean> {
    this.trackClosed();

    try {
      const didLoad = await callBrowserWindowMethodAsync(
        this.browserWindow,
        "loadURL",
        createDataUrl(this.html, this.identity?.key)
      );

      if (!didLoad) {
        throw new Error("Transparent BrowserWindow loadURL is unavailable.");
      }

      if (this.identity) {
        callBrowserWindowMethod(this.browserWindow, "setTitle", this.identity.title);
      }

      callBrowserWindowMethod(this.browserWindow, "show");
      callBrowserWindowMethod(this.browserWindow, "focus");
      return true;
    } catch (error) {
      console.error("Failed to load transparent sticky window HTML", error);
      callBrowserWindowMethod(this.browserWindow, "close");
      new Notice("Failed to load transparent sticky window.");
      return false;
    }
  }

  focus(): void {
    callBrowserWindowMethod(this.browserWindow, "restore");
    callBrowserWindowMethod(this.browserWindow, "show");
    callBrowserWindowMethod(this.browserWindow, "focus");
  }

  getBrowserWindow(): any {
    return this.browserWindow;
  }

  isDestroyed(): boolean {
    return !isBrowserWindowAlive(this.browserWindow);
  }

  async close(): Promise<void> {
    if (this.isDestroyed()) {
      return;
    }

    await flushTransparentBrowserWindowPendingSave(this.browserWindow);
    callBrowserWindowMethod(this.browserWindow, "close");
  }

  private trackClosed(): void {
    if (this.isTrackingClosed) {
      return;
    }

    this.isTrackingClosed = true;
    callBrowserWindowMethod(this.browserWindow, "once", "closed", this.onClosed);
  }
}

class StickyNoteAppearanceModal extends Modal {
  private isSaving = false;
  private selectedColor = DEFAULT_COLOR_HEX;
  private selectedOpacity = DEFAULT_BACKGROUND_OPACITY;
  private selectedTextTone = DEFAULT_TEXT_TONE;
  private selectedUseTransparentWindow = DEFAULT_USE_TRANSPARENT_WINDOW;
  private selectedWindowOpacity = DEFAULT_WINDOW_OPACITY;
  private colorInput: HTMLInputElement | null = null;
  private opacityInput: HTMLInputElement | null = null;
  private opacityValueEl: HTMLElement | null = null;
  private textToneInput: HTMLInputElement | null = null;
  private textToneValueEl: HTMLElement | null = null;
  private useTransparentWindowInput: HTMLInputElement | null = null;
  private useTransparentWindowValueEl: HTMLElement | null = null;
  private windowOpacityInput: HTMLInputElement | null = null;
  private windowOpacityValueEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private previewModeEl: HTMLElement | null = null;
  private swatchButtons: HTMLButtonElement[] = [];

  constructor(
    private readonly plugin: StickyPopoutNotesPlugin,
    private readonly file: TFile,
    private readonly onApply?: (appearance: StickyNoteAppearance) => void
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.titleEl.setText("设置便签外观");
    this.contentEl.empty();
    this.contentEl.addClass("sticky-appearance-modal");

    const palette = this.contentEl.createDiv({
      cls: "sticky-appearance-palette"
    });

    this.previewEl = palette.createDiv({
      cls: "sticky-appearance-preview"
    });
    this.previewEl.createDiv({
      cls: "sticky-appearance-preview-text",
      text: "预览"
    });
    this.previewModeEl = this.previewEl.createDiv({
      cls: "sticky-appearance-preview-mode",
      text: "透明窗口"
    });

    this.colorInput = palette.createEl("input", {
      cls: "sticky-appearance-color-input",
      attr: {
        type: "color",
        value: this.selectedColor
      }
    });

    this.colorInput.addEventListener("input", () => {
      this.setSelectedColor(this.colorInput?.value ?? DEFAULT_COLOR_HEX);
    });

    const swatchGrid = palette.createDiv({
      cls: "sticky-appearance-swatch-grid"
    });

    for (const color of STICKY_APPEARANCE_PRESET_COLORS) {
      const button = swatchGrid.createEl("button", {
        cls: "sticky-appearance-swatch",
        attr: {
          "aria-label": color,
          type: "button"
        }
      });

      button.dataset.color = color;
      button.style.backgroundColor = color;
      button.addEventListener("click", () => {
        this.setSelectedColor(color);
      });
      this.swatchButtons.push(button);
    }

    const opacitySection = this.contentEl.createDiv({
      cls: "sticky-appearance-opacity"
    });
    const opacityLabel = opacitySection.createEl("label");
    opacityLabel.setText("内容背景透明度");

    this.opacityValueEl = opacityLabel.createEl("span", {
      text: `${this.selectedOpacity}%`
    });

    this.opacityInput = opacitySection.createEl("input", {
      attr: {
        max: "100",
        min: "0",
        step: "1",
        type: "range",
        value: String(this.selectedOpacity)
      }
    });

    this.opacityInput.addEventListener("input", () => {
      this.setSelectedOpacity(
        this.opacityInput?.value ?? DEFAULT_BACKGROUND_OPACITY
      );
    });

    opacitySection.createDiv({
      cls: "sticky-appearance-note",
      text:
        "在透明窗口中，0 会透出桌面或后方窗口；在旧 Pop-out 中，只会透出 Obsidian 窗口背景。"
    });

    const textToneSection = this.contentEl.createDiv({
      cls: "sticky-appearance-opacity sticky-appearance-text-tone"
    });
    const textToneLabel = textToneSection.createEl("label");
    textToneLabel.setText("字体颜色/透明度");

    this.textToneValueEl = textToneLabel.createEl("span", {
      text: describeTextTone(this.selectedTextTone)
    });

    this.textToneInput = textToneSection.createEl("input", {
      attr: {
        max: "100",
        min: "-100",
        step: "1",
        type: "range",
        value: String(this.selectedTextTone)
      }
    });

    const toneLabels = textToneSection.createDiv({
      cls: "sticky-appearance-tone-labels"
    });
    toneLabels.createSpan({ text: "白" });
    toneLabels.createSpan({ text: "透明" });
    toneLabels.createSpan({ text: "黑" });

    this.textToneInput.addEventListener("input", () => {
      this.setSelectedTextTone(
        this.textToneInput?.value ?? DEFAULT_TEXT_TONE
      );
    });

    const transparentWindowSection = this.contentEl.createDiv({
      cls: "sticky-appearance-transparent-window"
    });
    const transparentWindowLabel = transparentWindowSection.createEl("label", {
      cls: "sticky-appearance-switch-label"
    });

    this.useTransparentWindowInput = transparentWindowLabel.createEl("input", {
      attr: {
        type: "checkbox"
      }
    });
    transparentWindowLabel.createSpan({
      text: "使用透明窗口"
    });
    this.useTransparentWindowValueEl = transparentWindowLabel.createEl("span", {
      cls: "sticky-appearance-switch-value",
      text: this.selectedUseTransparentWindow ? "开启" : "关闭"
    });
    this.useTransparentWindowInput.addEventListener("change", () => {
      this.setSelectedUseTransparentWindow(
        this.useTransparentWindowInput?.checked
      );
    });
    transparentWindowSection.createDiv({
      cls: "sticky-appearance-note",
      text:
        "开启时，普通“打开为便签”会优先使用 independent transparent BrowserWindow；关闭时使用旧 Obsidian Pop-out。"
    });

    const windowOpacitySection = this.contentEl.createDiv({
      cls: "sticky-appearance-opacity sticky-appearance-window-opacity"
    });
    const windowOpacityLabel = windowOpacitySection.createEl("label");
    windowOpacityLabel.setText("旧 Pop-out 整窗透明");

    this.windowOpacityValueEl = windowOpacityLabel.createEl("span", {
      text: `${this.selectedWindowOpacity}%`
    });

    this.windowOpacityInput = windowOpacitySection.createEl("input", {
      attr: {
        max: "100",
        min: String(MIN_WINDOW_OPACITY),
        step: "1",
        type: "range",
        value: String(this.selectedWindowOpacity)
      }
    });

    this.windowOpacityInput.addEventListener("input", () => {
      this.setSelectedWindowOpacity(
        this.windowOpacityInput?.value ?? DEFAULT_WINDOW_OPACITY
      );
    });

    windowOpacitySection.createDiv({
      cls: "sticky-appearance-note",
      text:
        "这是兼容旧 Pop-out 的 legacy 设置，会让文字和按钮一起透明；transparent BrowserWindow 路线不会使用它影响文字清晰度。"
    });

    const actions = this.contentEl.createDiv({
      cls: "sticky-appearance-actions"
    });

    const applyButton = actions.createEl("button", {
      text: "应用",
      attr: {
        type: "button"
      }
    });

    applyButton.addEventListener("click", () => {
      void this.applyAppearance();
    });

    this.updatePreview();
    void this.loadAppearance();
  }

  onClose(): void {
    this.contentEl.empty();
    this.isSaving = false;
    this.colorInput = null;
    this.opacityInput = null;
    this.opacityValueEl = null;
    this.textToneInput = null;
    this.textToneValueEl = null;
    this.useTransparentWindowInput = null;
    this.useTransparentWindowValueEl = null;
    this.windowOpacityInput = null;
    this.windowOpacityValueEl = null;
    this.previewEl = null;
    this.previewModeEl = null;
    this.swatchButtons = [];
  }

  private async loadAppearance(): Promise<void> {
    try {
      const raw = await this.plugin.app.vault.read(this.file);
      const appearance = getStickyNoteAppearance(splitFrontmatter(raw).frontmatter);
      this.setSelectedColor(appearance.color);
      this.setSelectedOpacity(appearance.backgroundOpacity);
      this.setSelectedTextTone(appearance.textTone);
      this.setSelectedUseTransparentWindow(appearance.useTransparentWindow);
      this.setSelectedWindowOpacity(appearance.windowOpacity);
    } catch (error) {
      console.error("Failed to read sticky note appearance", error);
    }
  }

  private setSelectedColor(color: unknown): void {
    this.selectedColor = normalizeStickyNoteColor(color);

    if (this.colorInput) {
      this.colorInput.value = this.selectedColor;
    }

    for (const button of this.swatchButtons) {
      button.classList.toggle(
        "is-selected",
        normalizeStickyNoteColor(button.dataset.color) === this.selectedColor
      );
    }

    this.updatePreview();
  }

  private setSelectedOpacity(opacity: unknown): void {
    this.selectedOpacity = normalizeStickyNoteBackgroundOpacity(opacity);

    if (this.opacityInput) {
      this.opacityInput.value = String(this.selectedOpacity);
    }

    if (this.opacityValueEl) {
      this.opacityValueEl.setText(`${this.selectedOpacity}%`);
    }

    this.updatePreview();
  }

  private setSelectedTextTone(textTone: unknown): void {
    this.selectedTextTone = normalizeStickyNoteTextTone(textTone);

    if (this.textToneInput) {
      this.textToneInput.value = String(this.selectedTextTone);
    }

    if (this.textToneValueEl) {
      this.textToneValueEl.setText(describeTextTone(this.selectedTextTone));
    }

    this.updatePreview();
  }

  private setSelectedUseTransparentWindow(value: unknown): void {
    this.selectedUseTransparentWindow =
      normalizeStickyNoteUseTransparentWindow(value);

    if (this.useTransparentWindowInput) {
      this.useTransparentWindowInput.checked = this.selectedUseTransparentWindow;
    }

    if (this.useTransparentWindowValueEl) {
      this.useTransparentWindowValueEl.setText(
        this.selectedUseTransparentWindow ? "开启" : "关闭"
      );
    }

    this.updatePreview();
  }

  private setSelectedWindowOpacity(opacity: unknown): void {
    this.selectedWindowOpacity = normalizeStickyNoteWindowOpacity(opacity);

    if (this.windowOpacityInput) {
      this.windowOpacityInput.value = String(this.selectedWindowOpacity);
    }

    if (this.windowOpacityValueEl) {
      this.windowOpacityValueEl.setText(`${this.selectedWindowOpacity}%`);
    }
  }

  private updatePreview(): void {
    if (!this.previewEl) {
      return;
    }

    this.previewEl.style.setProperty(
      "--sticky-appearance-preview-background",
      buildStickyNoteBackground(this.selectedColor, this.selectedOpacity)
    );
    this.previewEl.style.setProperty(
      "--sticky-appearance-preview-text-color",
      buildStickyNoteTextColorFromTone(this.selectedTextTone)
    );
    this.previewEl.style.setProperty(
      "--sticky-appearance-preview-text-shadow",
      buildTextReadabilityShadowFromTone(this.selectedTextTone)
    );

    if (this.previewModeEl) {
      this.previewModeEl.setText(
        this.selectedUseTransparentWindow ? "透明窗口模式" : "旧 Pop-out 模式"
      );
    }
  }

  private async applyAppearance(): Promise<void> {
    if (this.isSaving) {
      return;
    }

    this.isSaving = true;

    try {
      await this.plugin.app.fileManager.processFrontMatter(
        this.file,
        (frontmatter) => {
          frontmatter.color = this.selectedColor;
          frontmatter.backgroundOpacity = this.selectedOpacity;
          frontmatter.textTone = this.selectedTextTone;
          frontmatter.textOpacity = Math.abs(this.selectedTextTone);
          frontmatter.textColor = buildStickyNoteTextColorHexFromTone(
            this.selectedTextTone
          );
          frontmatter.useTransparentWindow = this.selectedUseTransparentWindow;
          frontmatter.sticky = true;
          frontmatter.width = frontmatter.width ?? DEFAULT_WIDTH;
          frontmatter.height = frontmatter.height ?? DEFAULT_HEIGHT;
          frontmatter.windowOpacity = this.selectedWindowOpacity;
        }
      );
      this.onApply?.(
        buildStickyNoteAppearance(
          this.selectedColor,
          this.selectedOpacity,
          this.selectedTextTone,
          this.selectedWindowOpacity,
          this.selectedUseTransparentWindow
        )
      );
      new Notice("Sticky note appearance updated.");
      this.close();
    } catch (error) {
      console.error("Failed to set sticky note appearance", error);
      new Notice("Failed to update sticky note appearance.");
      this.isSaving = false;
    }
  }
}

class StickyNoteView extends ItemView {
  private filePath = "";
  private rootEl: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private hiddenStickyControlsBlocks: string[] = [];
  private statusEl: HTMLElement | null = null;
  private inputListener: (() => void) | null = null;
  private saveTimer: number | null = null;
  private statusTimer: number | null = null;
  private ownerWindow: Window | null = null;
  private pendingBody: string | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private nativeOpacityWarningShown = false;
  private isClosed = false;
  private isSwitchingToTransparent = false;
  private didPrepareTransparentSwitchCleanup = false;
  private renderGeneration = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: StickyPopoutNotesPlugin
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_STICKY_NOTE;
  }

  getDisplayText(): string {
    return this.filePath ? getBasename(this.filePath) : "Sticky Note";
  }

  getIcon(): string {
    return "sticky-note";
  }

  async setState(
    state: StickyNoteViewState,
    result: ViewStateResult
  ): Promise<void> {
    await super.setState(state, result);
    this.isClosed = false;
    this.isSwitchingToTransparent = false;
    this.didPrepareTransparentSwitchCleanup = false;
    this.filePath = state.filePath ?? "";
    await this.render();
  }

  getState(): StickyNoteViewState {
    return {
      filePath: this.filePath
    };
  }

  async onOpen(): Promise<void> {
    this.isClosed = false;
    this.isSwitchingToTransparent = false;
    this.didPrepareTransparentSwitchCleanup = false;
    await this.render();
  }

  async onClose(): Promise<void> {
    const canSkipSave =
      this.isSwitchingToTransparent &&
      this.didPrepareTransparentSwitchCleanup;
    this.isClosed = true;
    this.renderGeneration += 1;
    this.clearTimers();
    this.removeInputListener();

    if (!canSkipSave) {
      await this.flushPendingSave();
      await this.saveQueue;
    }

    this.rootEl = null;
    this.statusEl = null;
    this.hiddenStickyControlsBlocks = [];
    this.ownerWindow = null;
    this.pendingBody = null;
    this.isSwitchingToTransparent = false;
    this.didPrepareTransparentSwitchCleanup = false;
  }

  private async render(): Promise<void> {
    if (this.isClosed || this.isSwitchingToTransparent) {
      return;
    }

    const renderGeneration = this.renderGeneration + 1;
    this.renderGeneration = renderGeneration;
    this.clearTimers();
    this.removeInputListener();
    this.hiddenStickyControlsBlocks = [];

    const doc = this.containerEl.ownerDocument;
    this.ownerWindow = doc.defaultView;
    this.contentEl.empty();

    const root = this.contentEl.createDiv({
      cls: "sticky-popout-root"
    });
    this.rootEl = root;

    const titlebar = root.createDiv({
      cls: "sticky-popout-titlebar"
    });

    titlebar.createDiv({
      cls: "sticky-popout-title",
      text: this.filePath ? getBasename(this.filePath) : "Sticky Note"
    });

    if (!this.filePath) {
      root.createDiv({
        cls: "sticky-popout-empty",
        text: "No sticky note file selected."
      });
      return;
    }

    const file = this.getFile();

    if (!file) {
      root.createDiv({
        cls: "sticky-popout-empty",
        text: "Sticky note file not found."
      });
      return;
    }

    const raw = await this.plugin.app.vault.read(file);

    if (this.isClosed || renderGeneration !== this.renderGeneration) {
      return;
    }

    const parts = splitFrontmatter(raw);
    const bodyParts = extractStickyControlsBlocks(parts.body);
    this.hiddenStickyControlsBlocks = bodyParts.hiddenBlocks;
    const appearance = getStickyNoteAppearance(parts.frontmatter);
    this.applyAppearance(appearance);

    const toolbar = titlebar.createDiv({
      cls: "sticky-popout-toolbar"
    });

    const appearanceButton = toolbar.createEl("button", {
      cls: "sticky-popout-appearance-button",
      text: "外观",
      attr: {
        type: "button"
      }
    });

    appearanceButton.addEventListener("click", () => {
      new StickyNoteAppearanceModal(this.plugin, file, (updatedAppearance) => {
        if (updatedAppearance.useTransparentWindow) {
          void this.switchToTransparentWindow(file);
          return;
        }

        this.applyAppearance(updatedAppearance);
      }).open();
    });

    this.textarea = root.createEl("textarea", {
      cls: "sticky-popout-body",
      attr: {
        spellcheck: "true"
      }
    });
    this.textarea.value = bodyParts.visibleBody;

    this.statusEl = root.createDiv({
      cls: "sticky-popout-status",
      text: "Saved"
    });

    this.inputListener = () => {
      if (!this.textarea) {
        return;
      }

      this.setStatus("Saving...");
      this.scheduleSave(this.textarea.value);
    };

    this.textarea.addEventListener("input", this.inputListener);
  }

  private applyAppearance(appearance: StickyNoteAppearance): void {
    if (this.isClosed || this.isSwitchingToTransparent || !this.rootEl) {
      return;
    }

    this.rootEl.style.setProperty(
      "--sticky-popout-background",
      appearance.background
    );
    this.rootEl.style.setProperty(
      "--sticky-popout-text-color",
      appearance.textColor
    );
    this.rootEl.style.setProperty(
      "--sticky-popout-caret-color",
      appearance.caretColor
    );

    if (
      !applyNativeWindowOpacity(appearance.windowOpacity, this.ownerWindow) &&
      !this.nativeOpacityWarningShown
    ) {
      this.nativeOpacityWarningShown = true;
      new Notice("Current environment does not support native window opacity.");
    }
  }

  private async switchToTransparentWindow(file: TFile): Promise<void> {
    if (this.isClosed || this.isSwitchingToTransparent) {
      return;
    }

    try {
      console.debug("Sticky Pop-out to transparent switch started", {
        filePath: file.path
      });
      await this.flushPendingSave();
      await this.saveQueue;
      if (this.isClosed) {
        return;
      }

      this.clearTimers();
      this.removeInputListener();
      this.isSwitchingToTransparent = true;
      this.didPrepareTransparentSwitchCleanup = true;
      const didOpen = await this.plugin.openTransparentStickyWindow(file, {
        showNotice: false
      });

      if (!didOpen) {
        await this.recoverFailedTransparentSwitch();
        new Notice("Transparent sticky window is unavailable.");
        return;
      }

      console.debug(
        "Sticky Pop-out to transparent opened transparent window",
        { filePath: file.path }
      );
      await this.plugin.focusTransparentStickyWindow(file);
      this.closeSourcePopoutAfterTransparentSwitch(file);
    } catch (error) {
      await this.recoverFailedTransparentSwitch();
      console.error("Failed to switch Pop-out sticky note to transparent window", error);
    }
  }

  private closeSourcePopoutAfterTransparentSwitch(file: TFile): void {
    const leaf = this.leaf;
    const sourceDomWindow = this.getSourcePopoutDomWindow();
    let didLogRefocus = false;
    const refocusTransparent = () => {
      void this.plugin.focusTransparentStickyWindow(file).then(() => {
        if (didLogRefocus) {
          return;
        }

        didLogRefocus = true;
        console.debug(
          "Sticky Pop-out to transparent refocused transparent window"
        );
      });
    };
    const scheduleRefocusTransparent = () => {
      setTimeout(refocusTransparent, 50);
      setTimeout(refocusTransparent, 150);
    };

    setTimeout(() => {
      void (async () => {
        const closeResult = await this.closeSourcePopoutWindow(sourceDomWindow);

        if (closeResult.closed) {
          console.debug(
            "Sticky Pop-out to transparent source close completed",
            { method: closeResult.method }
          );
          scheduleRefocusTransparent();
          return;
        }

        console.warn(
          "Sticky Pop-out to transparent source close fell back to leaf.detach",
          closeResult.error
        );

        try {
          await leaf.detach();
        } catch (error) {
          console.warn(
            "Failed to detach source Pop-out after transparent switch",
            error
          );
        } finally {
          scheduleRefocusTransparent();
        }
      })();
    }, 50);
  }

  private getSourcePopoutDomWindow(): Window | null {
    const leafView = this.leaf.view as
      | { containerEl?: HTMLElement }
      | null
      | undefined;
    const candidates = [
      this.ownerWindow,
      this.containerEl?.ownerDocument?.defaultView ?? null,
      leafView?.containerEl?.ownerDocument?.defaultView ?? null
    ];

    for (const candidate of candidates) {
      if (this.isSafeSourcePopoutDomWindow(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private isSafeSourcePopoutDomWindow(
    candidate: Window | null | undefined
  ): candidate is Window {
    if (!candidate || candidate.closed === true) {
      return false;
    }

    try {
      if (candidate === window || candidate.document === window.document) {
        return false;
      }

      if (typeof candidate.close !== "function") {
        return false;
      }

      return candidate.document.querySelector(".sticky-popout-root") !== null;
    } catch (error) {
      console.warn("Failed to inspect source Pop-out window.", error);
      return false;
    }
  }

  private async closeSourcePopoutWindow(
    sourceDomWindow: Window | null
  ): Promise<StickyPopoutSourceCloseResult> {
    if (!sourceDomWindow) {
      console.debug("Sticky Pop-out to transparent source close started", {
        method: "unavailable"
      });
      return {
        closed: false,
        error: "Source Pop-out DOM window was not found.",
        method: "unavailable"
      };
    }

    const browserWindow =
      await this.getSafeSourcePopoutBrowserWindow(sourceDomWindow);

    if (browserWindow) {
      const method: StickyPopoutSourceCloseMethod = "browserWindow";
      console.debug("Sticky Pop-out to transparent source close started", {
        method
      });
      const closeResult = await closeBrowserWindowWithFallback(browserWindow);

      return {
        closed: closeResult.closed,
        destroyedFallback: closeResult.destroyedFallback,
        error: closeResult.error,
        method
      };
    }

    try {
      const method: StickyPopoutSourceCloseMethod = "domWindow";
      console.debug("Sticky Pop-out to transparent source close started", {
        method
      });
      sourceDomWindow.close();
      const closed = await waitForDomWindowClosed(sourceDomWindow, 600);

      return {
        closed,
        error: closed
          ? undefined
          : "Source Pop-out DOM window close did not complete.",
        method
      };
    } catch (error) {
      return {
        closed: false,
        error: formatUnknownError(error),
        method: "domWindow"
      };
    }
  }

  private async getSafeSourcePopoutBrowserWindow(
    sourceDomWindow: Window
  ): Promise<any | null> {
    let browserWindow: any | null = null;

    try {
      const electron = getElectronModule(sourceDomWindow);
      browserWindow = electron?.remote?.getCurrentWindow?.() ?? null;
    } catch (error) {
      console.warn("Failed to resolve source Pop-out BrowserWindow.", error);
      return null;
    }

    if (!isBrowserWindowAlive(browserWindow)) {
      return null;
    }

    if (!(await browserWindowIsSourceStickyPopout(browserWindow))) {
      return null;
    }

    return browserWindow;
  }

  private async recoverFailedTransparentSwitch(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isSwitchingToTransparent = false;
    this.didPrepareTransparentSwitchCleanup = false;
    await this.render();
  }

  private getFile(): TFile | null {
    const abstractFile = this.plugin.app.vault.getAbstractFileByPath(
      this.filePath
    );

    return abstractFile instanceof TFile ? abstractFile : null;
  }

  private scheduleSave(body: string): void {
    if (this.isClosed || this.isSwitchingToTransparent || !this.ownerWindow) {
      return;
    }

    this.pendingBody = body;

    if (this.saveTimer !== null) {
      this.ownerWindow.clearTimeout(this.saveTimer);
    }

    this.saveTimer = this.ownerWindow.setTimeout(() => {
      this.saveTimer = null;
      void this.flushPendingSave();
    }, SAVE_DELAY_MS);
  }

  private async flushPendingSave(): Promise<void> {
    const bodyToSave = this.pendingBody;

    if (bodyToSave === null) {
      return;
    }

    this.pendingBody = null;

    const savePromise = this.saveQueue.then(() => this.saveBody(bodyToSave));
    this.saveQueue = savePromise.catch(() => undefined);
    await savePromise;
  }

  private async saveBody(body: string): Promise<void> {
    const file = this.getFile();

    if (!file) {
      this.setStatus("File missing");
      return;
    }

    try {
      const raw = await this.plugin.app.vault.read(file);
      const parts = splitFrontmatter(raw);
      const bodyParts = splitFrontmatter(body);
      const visibleBodyToSave = bodyParts.frontmatter ? bodyParts.body : body;
      const bodyToSave = restoreStickyControlsBlocks(
        visibleBodyToSave,
        this.hiddenStickyControlsBlocks
      );
      await this.plugin.app.vault.modify(
        file,
        `${parts.frontmatter || DEFAULT_FRONTMATTER}${bodyToSave}`
      );
      this.setStatus("Saved", true);
    } catch (error) {
      console.error("Failed to save sticky note", error);
      this.setStatus("Save failed");
    }
  }

  private setStatus(text: string, clearLater = false): void {
    if (this.isClosed || this.isSwitchingToTransparent || !this.statusEl) {
      return;
    }

    this.statusEl.setText(text);

    if (!clearLater || !this.ownerWindow) {
      return;
    }

    if (this.statusTimer !== null) {
      this.ownerWindow.clearTimeout(this.statusTimer);
    }

    this.statusTimer = this.ownerWindow.setTimeout(() => {
      this.statusTimer = null;
      this.statusEl?.setText("Saved");
    }, 1500);
  }

  private removeInputListener(): void {
    if (this.textarea && this.inputListener) {
      this.textarea.removeEventListener("input", this.inputListener);
    }

    this.textarea = null;
    this.inputListener = null;
  }

  private clearTimers(): void {
    if (!this.ownerWindow) {
      this.saveTimer = null;
      this.statusTimer = null;
      return;
    }

    if (this.saveTimer !== null) {
      this.ownerWindow.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.statusTimer !== null) {
      this.ownerWindow.clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }
  }
}

function splitFrontmatter(raw: string): MarkdownParts {
  const contentStart = raw.startsWith(UTF8_BOM) ? UTF8_BOM.length : 0;
  const content = raw.slice(contentStart);

  if (!content.startsWith("---")) {
    return {
      frontmatter: "",
      body: content
    };
  }

  const lineEnding = getPreferredLineEnding(content);
  const match = content.match(
    /^---(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)---[ \t]*(?:\r\n|\n|\r|$)/
  );

  if (!match) {
    return {
      frontmatter: "",
      body: content
    };
  }

  let bodyStart = match[0].length;
  const separator = getLineBreakAt(content, bodyStart);

  if (separator) {
    bodyStart += separator.length;
  }

  const absoluteBodyStart = contentStart + bodyStart;
  const frontmatter = raw.slice(0, absoluteBodyStart);
  const body = raw.slice(absoluteBodyStart);

  return {
    frontmatter: body ? frontmatter : ensureFrontmatterBodySeparator(
      frontmatter,
      lineEnding
    ),
    body
  };
}

function extractStickyControlsBlocks(body: string): {
  visibleBody: string;
  hiddenBlocks: string[];
} {
  const lines = splitLinesPreserveEndings(body);
  const visibleLines: string[] = [];
  const hiddenBlocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const openingFence = getStickyControlsOpeningFence(lines[index]);

    if (!openingFence) {
      visibleLines.push(lines[index]);
      index += 1;
      continue;
    }

    const blockLines = [lines[index]];
    let cursor = index + 1;
    let foundClosingFence = false;

    while (cursor < lines.length) {
      blockLines.push(lines[cursor]);

      if (isClosingFenceLine(lines[cursor], openingFence)) {
        foundClosingFence = true;
        break;
      }

      cursor += 1;
    }

    if (!foundClosingFence) {
      visibleLines.push(...blockLines);
      index = cursor;
      continue;
    }

    hiddenBlocks.push(blockLines.join(""));
    index = cursor + 1;
  }

  return {
    visibleBody: visibleLines.join(""),
    hiddenBlocks
  };
}

function restoreStickyControlsBlocks(
  visibleBody: string,
  hiddenBlocks: string[]
): string {
  if (hiddenBlocks.length === 0) {
    return visibleBody;
  }

  const lineEnding = getPreferredLineEnding(
    visibleBody || hiddenBlocks.join("") || "\n"
  );
  const hiddenBody = hiddenBlocks
    .map((block) => ensureTrailingLineEnding(block, lineEnding))
    .join("");

  if (!visibleBody) {
    return hiddenBody;
  }

  return `${hiddenBody}${
    startsWithLineEnding(visibleBody) ? "" : lineEnding
  }${visibleBody}`;
}

function splitLinesPreserveEndings(value: string): string[] {
  const lines = value.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function getStickyControlsOpeningFence(line: string): string | null {
  const content = stripTrailingLineEnding(line);
  const match = content.match(/^[ \t]*(`{3,}|~{3,})[ \t]*sticky-controls(?:[ \t].*)?$/i);
  return match?.[1] ?? null;
}

function isClosingFenceLine(line: string, openingFence: string): boolean {
  const content = stripTrailingLineEnding(line);
  const fenceChar = openingFence[0];
  const fenceLength = openingFence.length;
  const pattern = new RegExp(
    `^[ \\t]*${escapeRegExp(fenceChar)}{${fenceLength},}[ \\t]*$`
  );

  return pattern.test(content);
}

function stripTrailingLineEnding(value: string): string {
  return value.replace(/\r\n$|\n$|\r$/, "");
}

function ensureTrailingLineEnding(value: string, lineEnding: string): string {
  return value.match(/\r\n$|\n$|\r$/) ? value : `${value}${lineEnding}`;
}

function startsWithLineEnding(value: string): boolean {
  return value.startsWith("\r\n") || value.startsWith("\n") || value.startsWith("\r");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseFrontmatterRecord(frontmatter: string): Record<string, unknown> {
  const content = frontmatter.startsWith(UTF8_BOM)
    ? frontmatter.slice(UTF8_BOM.length)
    : frontmatter;

  if (!content) {
    return {};
  }

  const match = content.match(
    /^---(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)---[ \t]*(?:\r\n|\n|\r|$)/
  );

  if (!match) {
    return {};
  }

  const yaml = match[1] ?? "";

  if (!yaml.trim()) {
    return {};
  }

  try {
    const parsed = parseYaml(yaml);
    return isRecord(parsed) ? parsed : {};
  } catch (error) {
    console.error("Failed to parse sticky note frontmatter", error);
    return {};
  }
}

function getStickyNoteAppearance(frontmatter: string): StickyNoteAppearance {
  const record = parseFrontmatterRecord(frontmatter);
  const color = normalizeStickyNoteColor(record.color);
  const backgroundOpacity = getStickyNoteBackgroundOpacity(frontmatter);
  const textTone = getStickyNoteTextTone(frontmatter);
  const windowOpacity = getStickyNoteWindowOpacity(frontmatter);
  const useTransparentWindow = getStickyNoteUseTransparentWindow(frontmatter);

  return buildStickyNoteAppearance(
    color,
    backgroundOpacity,
    textTone,
    windowOpacity,
    useTransparentWindow
  );
}

function buildStickyNoteAppearance(
  color: unknown,
  backgroundOpacity: unknown,
  textTone: unknown = DEFAULT_TEXT_TONE,
  windowOpacity: unknown = DEFAULT_WINDOW_OPACITY,
  useTransparentWindow: unknown = DEFAULT_USE_TRANSPARENT_WINDOW
): StickyNoteAppearance {
  const normalizedColor = normalizeStickyNoteColor(color);
  const normalizedOpacity =
    normalizeStickyNoteBackgroundOpacity(backgroundOpacity);
  const normalizedTextTone = normalizeStickyNoteTextTone(textTone);
  const normalizedWindowOpacity = normalizeStickyNoteWindowOpacity(windowOpacity);
  const normalizedUseTransparentWindow =
    normalizeStickyNoteUseTransparentWindow(useTransparentWindow);
  const textColorHex = buildStickyNoteTextColorHexFromTone(normalizedTextTone);

  return {
    color: normalizedColor,
    backgroundOpacity: normalizedOpacity,
    textOpacity: Math.abs(normalizedTextTone),
    textTone: normalizedTextTone,
    windowOpacity: normalizedWindowOpacity,
    useTransparentWindow: normalizedUseTransparentWindow,
    background: buildStickyNoteBackground(normalizedColor, normalizedOpacity),
    textColor: buildStickyNoteTextColorFromTone(normalizedTextTone),
    caretColor: buildStickyNoteCaretColorFromTone(normalizedTextTone),
    textColorHex
  };
}

function normalizeStickyNoteColor(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_COLOR_HEX;
  }

  const normalized = value.trim().toLowerCase();

  if (isStickyNoteColor(normalized)) {
    return LEGACY_STICKY_NOTE_COLORS[normalized];
  }

  return normalizeHexColor(value) ?? DEFAULT_COLOR_HEX;
}

function getStickyNoteBackgroundOpacity(frontmatter: string): number {
  return normalizeStickyNoteBackgroundOpacity(
    parseFrontmatterRecord(frontmatter).backgroundOpacity
  );
}

function normalizeStickyNoteBackgroundOpacity(value: unknown): number {
  const opacity = toNumber(value);

  if (!Number.isFinite(opacity)) {
    return DEFAULT_BACKGROUND_OPACITY;
  }

  return Math.min(100, Math.max(0, Math.round(opacity)));
}

function getStickyNoteTextOpacity(frontmatter: string): number {
  return normalizeStickyNoteTextOpacity(
    parseFrontmatterRecord(frontmatter).textOpacity
  );
}

function normalizeStickyNoteTextOpacity(value: unknown): number {
  const opacity = toNumber(value);

  if (!Number.isFinite(opacity)) {
    return DEFAULT_TEXT_OPACITY;
  }

  return Math.min(100, Math.max(0, Math.round(opacity)));
}

function getStickyNoteTextTone(frontmatter: string): number {
  const record = parseFrontmatterRecord(frontmatter);

  if (record.textTone !== undefined) {
    return normalizeStickyNoteTextTone(record.textTone);
  }

  return getStickyNoteTextToneFromLegacy(record);
}

function normalizeStickyNoteTextTone(value: unknown): number {
  const tone = toNumber(value);

  if (!Number.isFinite(tone)) {
    return DEFAULT_TEXT_TONE;
  }

  return Math.min(100, Math.max(-100, Math.round(tone)));
}

function getStickyNoteTextToneFromLegacy(
  frontmatter: Record<string, unknown>
): number {
  const textOpacity = normalizeStickyNoteTextOpacity(frontmatter.textOpacity);
  const textColor = normalizeStickyNoteTextColor(frontmatter.textColor);

  if (isLightTextColor(textColor)) {
    return -textOpacity;
  }

  return textOpacity;
}

function getStickyNoteTextColor(frontmatter: string): string {
  return normalizeStickyNoteTextColor(
    parseFrontmatterRecord(frontmatter).textColor
  );
}

function normalizeStickyNoteTextColor(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_TEXT_COLOR_HEX;
  }

  return normalizeHexColor(value) ?? DEFAULT_TEXT_COLOR_HEX;
}

function buildStickyNoteTextColorFromTone(textTone: unknown): string {
  const normalizedTone = normalizeStickyNoteTextTone(textTone);
  const opacity = Math.abs(normalizedTone) / 100;

  if (normalizedTone < 0) {
    return `rgba(255, 255, 255, ${formatAlpha(opacity)})`;
  }

  if (normalizedTone === 0) {
    return "rgba(0, 0, 0, 0)";
  }

  return `rgba(0, 0, 0, ${formatAlpha(opacity)})`;
}

function buildStickyNoteTextColorHexFromTone(textTone: unknown): string {
  return normalizeStickyNoteTextTone(textTone) < 0 ? "#FFFFFF" : "#000000";
}

function buildStickyNoteCaretColorFromTone(textTone: unknown): string {
  return normalizeStickyNoteTextTone(textTone) < 0 ? "#FFFFFF" : "#000000";
}

function describeTextTone(textTone: unknown): string {
  const normalizedTone = normalizeStickyNoteTextTone(textTone);

  if (normalizedTone < 0) {
    return `白色 ${Math.abs(normalizedTone)}%`;
  }

  if (normalizedTone === 0) {
    return "透明";
  }

  return `黑色 ${normalizedTone}%`;
}

function buildTextReadabilityShadowFromTone(textTone: unknown): string {
  const normalizedTone = normalizeStickyNoteTextTone(textTone);

  if (normalizedTone === 0) {
    return "none";
  }

  if (normalizedTone < 0) {
    return "0 1px 2px rgba(0, 0, 0, 0.75), 0 -1px 2px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.25)";
  }

  return "0 1px 2px rgba(255, 255, 255, 0.85), 0 -1px 2px rgba(255, 255, 255, 0.65), 0 0 1px rgba(0, 0, 0, 0.28)";
}

function isLightTextColor(hex: string): boolean {
  const rgb = hexToRgb(hex);

  if (!rgb) {
    return false;
  }

  return (rgb.r + rgb.g + rgb.b) / 3 >= 200;
}

function buildStickyNoteTextColor(
  textOpacity: unknown,
  textColor: unknown = DEFAULT_TEXT_COLOR_HEX
): string {
  const normalizedOpacity = normalizeStickyNoteTextOpacity(textOpacity);
  const normalizedTextColor = normalizeStickyNoteTextColor(textColor);
  const rgb = hexToRgb(normalizedTextColor) ?? hexToRgb(DEFAULT_TEXT_COLOR_HEX);

  if (!rgb) {
    return DEFAULT_TEXT_COLOR_HEX;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${formatAlpha(
    normalizedOpacity / 100
  )})`;
}

function getStickyNoteUseTransparentWindow(frontmatter: string): boolean {
  return normalizeStickyNoteUseTransparentWindow(
    parseFrontmatterRecord(frontmatter).useTransparentWindow
  );
}

function normalizeStickyNoteUseTransparentWindow(value: unknown): boolean {
  if (value === undefined || value === null) {
    return DEFAULT_USE_TRANSPARENT_WINDOW;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }

    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
  }

  return DEFAULT_USE_TRANSPARENT_WINDOW;
}

function getStickyNoteTransparentAlwaysOnTop(frontmatter: string): boolean {
  return normalizeStickyNoteTransparentAlwaysOnTop(
    parseFrontmatterRecord(frontmatter).transparentAlwaysOnTop
  );
}

function normalizeStickyNoteTransparentAlwaysOnTop(value: unknown): boolean {
  if (value === undefined || value === null) {
    return DEFAULT_TRANSPARENT_ALWAYS_ON_TOP;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }

    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
  }

  return DEFAULT_TRANSPARENT_ALWAYS_ON_TOP;
}

function getStickyNoteWindowOpacity(frontmatter: string): number {
  return normalizeStickyNoteWindowOpacity(
    parseFrontmatterRecord(frontmatter).windowOpacity
  );
}

function normalizeStickyNoteWindowOpacity(value: unknown): number {
  const opacity = toNumber(value);

  if (!Number.isFinite(opacity)) {
    return DEFAULT_WINDOW_OPACITY;
  }

  return Math.min(100, Math.max(MIN_WINDOW_OPACITY, Math.round(opacity)));
}

function buildStickyNoteBackground(color: string, opacity: number): string {
  const normalizedOpacity = normalizeStickyNoteBackgroundOpacity(opacity);

  if (normalizedOpacity === 0) {
    return "transparent";
  }

  const rgb = hexToRgb(color) ?? hexToRgb(DEFAULT_COLOR_HEX);

  if (!rgb) {
    return DEFAULT_COLOR_HEX;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${formatAlpha(
    normalizedOpacity / 100
  )})`;
}

function applyNativeWindowOpacity(
  opacityPercent: unknown,
  targetWindow: Window | null
): boolean {
  const normalizedOpacity = normalizeStickyNoteWindowOpacity(opacityPercent);

  try {
    const windowWithRequire = targetWindow as
      | (Window & { require?: (moduleName: string) => unknown })
      | null;
    const electron = windowWithRequire?.require?.("electron") as
      | {
          remote?: {
            getCurrentWindow?: () => {
              setOpacity?: (opacity: number) => void;
            };
          };
        }
      | undefined;
    const currentWindow = electron?.remote?.getCurrentWindow?.();

    if (!currentWindow?.setOpacity) {
      console.warn("Electron BrowserWindow.setOpacity is not available.");
      return false;
    }

    currentWindow.setOpacity(normalizedOpacity / 100);
    return true;
  } catch (error) {
    console.warn("Failed to apply Electron window opacity.", error);
    return false;
  }
}

function applyTransparentBrowserWindowAlwaysOnTop(
  browserWindow: any,
  alwaysOnTop: boolean
): boolean {
  if (!isBrowserWindowAlive(browserWindow)) {
    console.warn("Transparent BrowserWindow is unavailable for always-on-top.");
    return false;
  }

  try {
    const setAlwaysOnTop = browserWindow.setAlwaysOnTop;

    if (typeof setAlwaysOnTop !== "function") {
      console.warn("Electron BrowserWindow.setAlwaysOnTop is not available.");
      return false;
    }

    setAlwaysOnTop.call(browserWindow, alwaysOnTop);
    return true;
  } catch (error) {
    console.warn("Failed to set transparent BrowserWindow always-on-top.", error);
    return false;
  }
}

interface TransparentStickyHtmlData {
  absoluteFilePath: string;
  appearance: StickyNoteAppearance;
  alwaysOnTop: boolean;
  alwaysOnTopIpcChannel: string;
  closeCurrentWindowIpcChannel: string;
  defaultFrontmatter: string;
  dragStartIpcChannel: string;
  dragStopIpcChannel: string;
  fileKey: string;
  filePath: string;
  frontmatter: string;
  hiddenStickyControlsBlocks: string[];
  ipcChannel: string;
  renderMarkdownIpcChannel: string;
  renderMarkdownResultIpcChannel: string;
  title: string;
  visibleBody: string;
  windowTitle: string;
}

interface TransparentWindowIdentity {
  absoluteFilePath: string;
  key: string;
  title: string;
}

interface TransparentWindowRegistryEntry {
  absoluteFilePath: string;
  browserWindow: any;
  createdAt: number;
  key: string;
}

interface TransparentStickyWindowOpenOptions {
  showNotice?: boolean;
}

interface TransparentOpenCleanupResult {
  closedDuplicateWindows: number;
  duplicateCount: number;
  removedStaleWindows: number;
  stoppedDragSessions: number;
}

type TransparentWindowLookupMethod = "fromWebContents" | "registry" | "scan";

type TransparentWindowCloseMethod =
  | TransparentWindowLookupMethod
  | "remoteFallback";

type StickyPopoutSourceCloseMethod =
  | "browserWindow"
  | "domWindow"
  | "unavailable";

interface TransparentWindowCloseTarget {
  browserWindow: any;
  key: string | null;
  method: TransparentWindowLookupMethod;
}

interface TransparentWindowBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface TransparentWindowPoint {
  x: number;
  y: number;
}

interface TransparentWindowBridgeResult {
  appearance?: StickyNoteAppearance;
  closeSourceWindow?: boolean;
  error?: string;
  frontmatter?: string;
  ok: boolean;
  sourceCloseDestroyedFallback?: boolean;
  sourceCloseMethod?: TransparentWindowLookupMethod;
  switchBoundsPreserved?: boolean;
  switchToPopout?: boolean;
  warning?: string;
}

interface TransparentWindowCloseCurrentResult {
  closed: boolean;
  destroyedFallback: boolean;
  error?: string;
  method?: TransparentWindowCloseMethod;
  ok: boolean;
}

interface TransparentWindowAlwaysOnTopResult {
  alwaysOnTop?: boolean;
  error?: string;
  frontmatter?: string;
  ok: boolean;
  saveFailed?: boolean;
}

interface TransparentWindowRenderMarkdownAcceptResult {
  accepted?: boolean;
  error?: string;
  ok: boolean;
}

interface TransparentWindowRenderMarkdownResultPayload {
  error?: string;
  html?: string;
  ok: boolean;
  requestId: string;
}

interface TransparentSwitchSourceCloseResult {
  closed: boolean;
  destroyedFallback: boolean;
  error?: string;
  method?: TransparentWindowLookupMethod;
}

interface StickyPopoutSourceCloseResult {
  closed: boolean;
  destroyedFallback?: boolean;
  error?: string;
  method: StickyPopoutSourceCloseMethod;
}

interface TransparentWindowDragStartResult {
  error?: string;
  method?: TransparentWindowLookupMethod;
  ok: boolean;
}

interface TransparentWindowDragStopResult {
  ok: boolean;
}

interface TransparentWindowDragSession {
  browserWindow: any;
  closedListener: (() => void) | null;
  didMoveLog: boolean;
  didWarnSlowTick: boolean;
  didWarnLog: boolean;
  isMoving: boolean;
  key: string;
  lastMoveAt: number;
  lastTickAt: number;
  lastX: number;
  lastY: number;
  maxTickDelay: number;
  method: TransparentWindowLookupMethod;
  moveCount: number;
  screen: { getCursorScreenPoint?: () => unknown };
  startBounds: TransparentWindowBounds;
  startCursor: TransparentWindowPoint;
  timer: ReturnType<typeof setInterval> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

function getElectronModule(targetWindow: Window = window): any | null {
  try {
    const windowWithRequire = targetWindow as Window & {
      require?: (moduleName: string) => unknown;
    };
    return windowWithRequire.require?.("electron") ?? null;
  } catch (error) {
    console.warn("Failed to access Electron module.", error);
    return null;
  }
}

function getBrowserWindowConstructor(): any | null {
  let BrowserWindow: any | null = null;

  try {
    const electron = getElectronModule();
    BrowserWindow = electron?.remote?.BrowserWindow ?? null;
  } catch (error) {
    console.warn("Failed to access Electron remote BrowserWindow.", error);
    return null;
  }

  if (!BrowserWindow) {
    console.warn("Electron remote BrowserWindow is not available.");
    return null;
  }

  return BrowserWindow;
}

function getElectronScreenModule(): {
  getCursorScreenPoint?: () => unknown;
} | null {
  const electron = getElectronModule();
  const screen = electron?.remote?.screen ?? electron?.screen;

  if (!screen?.getCursorScreenPoint) {
    console.warn("Electron screen.getCursorScreenPoint is not available.");
    return null;
  }

  return screen;
}

function getBrowserWindowFromIpcEvent(event: unknown): any | null {
  if (!isRecord(event)) {
    return null;
  }

  try {
    const sender = event.sender;

    if (!sender || !isWebContentsAlive(sender)) {
      return null;
    }

    const BrowserWindow = getBrowserWindowConstructor();
    return BrowserWindow?.fromWebContents?.(sender) ?? null;
  } catch (error) {
    console.warn("Failed to resolve BrowserWindow from IPC event.", error);
    return null;
  }
}

function sendIpcEventPayload(
  event: unknown,
  channel: string,
  payload: unknown
): boolean {
  try {
    if (!isRecord(event) || !isRecord(event.sender)) {
      return false;
    }

    const sender = event.sender;

    if (!isWebContentsAlive(sender)) {
      return false;
    }

    const send = sender.send;

    if (typeof send !== "function") {
      return false;
    }

    send.call(sender, channel, payload);
    return true;
  } catch (error) {
    console.warn("Failed to send transparent IPC result.", error);
    return false;
  }
}

function getBrowserWindowBounds(
  browserWindow: any
): TransparentWindowBounds | null {
  if (!isBrowserWindowAlive(browserWindow)) {
    return null;
  }

  try {
    return normalizeTransparentWindowBounds(browserWindow?.getBounds?.());
  } catch (error) {
    console.warn("Failed to read transparent BrowserWindow bounds.", error);
    return null;
  }
}

function normalizeTransparentWindowBounds(
  value: unknown
): TransparentWindowBounds | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = getFiniteNumber(value.x, Number.NaN);
  const y = getFiniteNumber(value.y, Number.NaN);
  const width = getPositiveNumber(value.width, Number.NaN);
  const height = getPositiveNumber(value.height, Number.NaN);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return { height, width, x, y };
}

function getCursorScreenPoint(
  screen: { getCursorScreenPoint?: () => unknown }
): TransparentWindowPoint | null {
  try {
    return normalizeTransparentWindowPoint(screen.getCursorScreenPoint?.());
  } catch (error) {
    console.warn("Failed to read Electron cursor screen point.", error);
    return null;
  }
}

function normalizeTransparentWindowPoint(
  value: unknown
): TransparentWindowPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = getFiniteNumber(value.x, Number.NaN);
  const y = getFiniteNumber(value.y, Number.NaN);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

async function resolveCurrentTransparentWindowCloseTarget(
  event: unknown,
  expectedKey: string | null
): Promise<TransparentWindowCloseTarget | null> {
  const eventWindow = getBrowserWindowFromIpcEvent(event);
  const eventTarget = await buildTransparentWindowCloseTarget(
    eventWindow,
    expectedKey,
    "fromWebContents",
    true,
    false
  );

  if (eventTarget) {
    return eventTarget;
  }

  if (expectedKey) {
    const registryWindow = getRegisteredTransparentWindow(
      buildTransparentWindowIdentityFromKey(expectedKey)
    );
    const registryTarget = await buildTransparentWindowCloseTarget(
      registryWindow,
      expectedKey,
      "registry",
      false,
      true
    );

    if (registryTarget) {
      return registryTarget;
    }
  }

  const BrowserWindow = getBrowserWindowConstructor();

  if (!BrowserWindow) {
    return null;
  }

  return findTransparentWindowCloseTargetByScan(BrowserWindow, expectedKey);
}

async function buildTransparentWindowCloseTarget(
  browserWindow: any,
  expectedKey: string | null,
  method: TransparentWindowLookupMethod,
  allowRouteFallback: boolean,
  trustExpectedKey: boolean
): Promise<TransparentWindowCloseTarget | null> {
  if (!isBrowserWindowAlive(browserWindow)) {
    return null;
  }

  const key = await getTransparentWindowKeyFromBrowserWindow(browserWindow);

  if (expectedKey) {
    if (key === expectedKey || (trustExpectedKey && key === null)) {
      return {
        browserWindow,
        key: key ?? expectedKey,
        method
      };
    }

    if (key !== null) {
      return null;
    }

    if (
      allowRouteFallback &&
      (await browserWindowIsTransparentRoute(browserWindow))
    ) {
      return {
        browserWindow,
        key: expectedKey,
        method
      };
    }

    return null;
  }

  if (key !== null || (await browserWindowIsTransparentRoute(browserWindow))) {
    return {
      browserWindow,
      key,
      method
    };
  }

  return null;
}

async function findTransparentWindowCloseTargetByScan(
  BrowserWindow: any,
  expectedKey: string | null
): Promise<TransparentWindowCloseTarget | null> {
  const allWindows = getAllBrowserWindows(BrowserWindow);
  const routeFallbacks: any[] = [];

  for (const candidate of allWindows) {
    try {
      if (!isBrowserWindowAlive(candidate)) {
        continue;
      }

      const key = await getTransparentWindowKeyFromBrowserWindow(candidate);

      if (expectedKey) {
        if (key === expectedKey) {
          return {
            browserWindow: candidate,
            key,
            method: "scan"
          };
        }
      } else if (key !== null) {
        return {
          browserWindow: candidate,
          key,
          method: "scan"
        };
      }

      if (!expectedKey && (await browserWindowIsTransparentRoute(candidate))) {
        routeFallbacks.push(candidate);
      }
    } catch (error) {
      console.warn("Failed to inspect transparent window close target.", error);
    }
  }

  if (!expectedKey && routeFallbacks.length > 0) {
    const browserWindow = routeFallbacks[0];
    const key =
      (await getTransparentWindowKeyFromBrowserWindow(browserWindow)) ??
      expectedKey;

    return {
      browserWindow,
      key,
      method: "scan"
    };
  }

  return null;
}

async function closeBrowserWindowWithFallback(
  browserWindow: any,
  closeTimeoutMs = 600
): Promise<{
  closed: boolean;
  destroyedFallback: boolean;
  error?: string;
}> {
  const errors: string[] = [];

  if (!isBrowserWindowAlive(browserWindow)) {
    return {
      closed: true,
      destroyedFallback: false
    };
  }

  try {
    if (typeof browserWindow.close === "function") {
      const closedPromise = waitForBrowserWindowClosed(
        browserWindow,
        closeTimeoutMs
      );
      browserWindow.close();

      if (await closedPromise) {
        return {
          closed: true,
          destroyedFallback: false
        };
      }
    } else {
      errors.push("BrowserWindow.close is unavailable.");
    }
  } catch (error) {
    errors.push(formatUnknownError(error));
  }

  if (!isBrowserWindowAlive(browserWindow)) {
    return {
      closed: true,
      destroyedFallback: false,
      error: errors.join(" ")
    };
  }

  try {
    if (typeof browserWindow.destroy === "function") {
      const destroyedPromise = waitForBrowserWindowClosed(
        browserWindow,
        closeTimeoutMs
      );
      browserWindow.destroy();
      const closed = await destroyedPromise;

      return {
        closed,
        destroyedFallback: true,
        error: closed
          ? errors.join(" ") || undefined
          : [...errors, "BrowserWindow.destroy did not close the window."].join(
              " "
            )
      };
    }

    errors.push("BrowserWindow.destroy is unavailable.");
  } catch (error) {
    errors.push(formatUnknownError(error));
  }

  return {
    closed: !isBrowserWindowAlive(browserWindow),
    destroyedFallback: false,
    error: errors.join(" ") || "BrowserWindow close did not complete."
  };
}

function waitForBrowserWindowClosed(
  browserWindow: any,
  timeoutMs: number
): Promise<boolean> {
  if (!isBrowserWindowAlive(browserWindow)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let isSettled = false;

    const finish = (closed: boolean) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      clearTimeout(timer);
      try {
        browserWindow.removeListener?.("closed", onClosed);
      } catch (error) {
        logDeadTransparentBrowserWindow(error);
      }
      resolve(closed || !isBrowserWindowAlive(browserWindow));
    };
    const onClosed = () => finish(true);
    const timer = setTimeout(() => {
      finish(!isBrowserWindowAlive(browserWindow));
    }, timeoutMs);

    try {
      browserWindow.once?.("closed", onClosed);
    } catch (error) {
      logDeadTransparentBrowserWindow(error);
      finish(true);
    }
  });
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getStickyNoteWindowOptionsFromIpcEvent(
  event: unknown
): StickyNoteWindowOptions | null {
  const browserWindow = getBrowserWindowFromIpcEvent(event);
  return getStickyNoteWindowOptionsFromBrowserWindow(browserWindow);
}

function getStickyNoteWindowOptionsFromBrowserWindow(
  browserWindow: any
): StickyNoteWindowOptions | null {
  if (!isBrowserWindowAlive(browserWindow)) {
    return null;
  }

  try {
    return normalizeStickyNoteWindowOptions(browserWindow?.getBounds?.());
  } catch (error) {
    console.warn("Failed to read sticky note window bounds.", error);
    return null;
  }
}

function normalizeStickyNoteWindowOptions(
  value: unknown
): StickyNoteWindowOptions | null {
  if (!isRecord(value)) {
    return null;
  }

  const options: StickyNoteWindowOptions = {};
  const x = getFiniteNumber(value.x, Number.NaN);
  const y = getFiniteNumber(value.y, Number.NaN);
  const width = getPositiveNumber(value.width, Number.NaN);
  const height = getPositiveNumber(value.height, Number.NaN);

  if (Number.isFinite(x)) {
    options.x = x;
  }

  if (Number.isFinite(y)) {
    options.y = y;
  }

  if (Number.isFinite(width)) {
    options.width = width;
  }

  if (Number.isFinite(height)) {
    options.height = height;
  }

  return Object.keys(options).length > 0 ? options : null;
}

function getTransparentWindowIdentity(
  plugin: StickyPopoutNotesPlugin,
  file: TFile
): TransparentWindowIdentity | null {
  const basePath = getVaultBasePath(plugin);

  if (!basePath) {
    return null;
  }

  const absoluteFilePath = buildAbsoluteVaultFilePath(basePath, file.path);

  return {
    absoluteFilePath,
    key: absoluteFilePath,
    title: buildTransparentWindowTitle(absoluteFilePath)
  };
}

function buildTransparentWindowTitle(absoluteFilePath: string): string {
  return `${TRANSPARENT_WINDOW_TITLE_PREFIX}${absoluteFilePath}`;
}

function buildTransparentWindowIdentityFromKey(
  key: string
): TransparentWindowIdentity {
  return {
    absoluteFilePath: key,
    key,
    title: buildTransparentWindowTitle(key)
  };
}

function getTransparentWindowRegistry(): Map<
  string,
  TransparentWindowRegistryEntry
> {
  const host = window as Window & {
    __stickyPopoutTransparentWindowRegistry?: Map<
      string,
      TransparentWindowRegistryEntry
    >;
  };

  if (!(host.__stickyPopoutTransparentWindowRegistry instanceof Map)) {
    host.__stickyPopoutTransparentWindowRegistry = new Map();
  }

  return host.__stickyPopoutTransparentWindowRegistry;
}

function registerTransparentWindow(
  identity: TransparentWindowIdentity,
  browserWindow: any
): void {
  if (!isBrowserWindowAlive(browserWindow)) {
    unregisterTransparentWindow(identity.key);
    return;
  }

  getTransparentWindowRegistry().set(identity.key, {
    absoluteFilePath: identity.absoluteFilePath,
    browserWindow,
    createdAt: Date.now(),
    key: identity.key
  });
}

function unregisterTransparentWindow(key: string): void {
  getTransparentWindowRegistry().delete(key);
}

function unregisterTransparentWindowKeys(keys: Iterable<string>): number {
  const registry = getTransparentWindowRegistry();
  let count = 0;

  for (const key of keys) {
    if (registry.delete(key)) {
      count += 1;
    }
  }

  return count;
}

function pruneDestroyedTransparentWindowRegistryEntries(): number {
  const registry = getTransparentWindowRegistry();
  let count = 0;

  for (const [key, entry] of Array.from(registry.entries())) {
    if (!isBrowserWindowAlive(entry.browserWindow)) {
      registry.delete(key);
      count += 1;
    }
  }

  return count;
}

function getRegisteredTransparentWindow(
  identity: TransparentWindowIdentity
): any | null {
  const registry = getTransparentWindowRegistry();
  const entry = registry.get(identity.key);

  if (!entry) {
    return null;
  }

  if (isBrowserWindowAlive(entry.browserWindow)) {
    return entry.browserWindow;
  }

  registry.delete(identity.key);
  return null;
}

let didLogDeadTransparentBrowserWindow = false;

function logDeadTransparentBrowserWindow(error: unknown): void {
  if (didLogDeadTransparentBrowserWindow) {
    return;
  }

  didLogDeadTransparentBrowserWindow = true;
  console.debug(
    "Transparent BrowserWindow is no longer live",
    formatUnknownError(error)
  );
}

function isBrowserWindowAlive(browserWindow: any): boolean {
  if (!browserWindow) {
    return false;
  }

  try {
    const isDestroyed = browserWindow.isDestroyed;

    if (typeof isDestroyed === "function" && isDestroyed.call(browserWindow)) {
      return false;
    }
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return false;
  }

  try {
    return isWebContentsAlive(browserWindow.webContents);
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return false;
  }
}

function isWebContentsAlive(webContents: any): boolean {
  if (!webContents) {
    return true;
  }

  try {
    const isDestroyed = webContents.isDestroyed;
    return !(
      typeof isDestroyed === "function" && isDestroyed.call(webContents)
    );
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return false;
  }
}

function browserWindowsAreSame(firstWindow: any, secondWindow: any): boolean {
  if (!firstWindow || !secondWindow) {
    return false;
  }

  if (firstWindow === secondWindow) {
    return true;
  }

  let firstId: unknown = null;
  let secondId: unknown = null;

  try {
    firstId = firstWindow.id;
    secondId = secondWindow.id;
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return false;
  }

  return (
    typeof firstId === "number" &&
    typeof secondId === "number" &&
    firstId === secondId
  );
}

function getBrowserWindowId(browserWindow: any): number | null {
  try {
    const id = browserWindow?.id;
    return typeof id === "number" ? id : null;
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return null;
  }
}

function getAllBrowserWindows(BrowserWindow: any): any[] {
  try {
    const allWindows = BrowserWindow?.getAllWindows?.();
    return Array.isArray(allWindows) ? allWindows : [];
  } catch (error) {
    console.warn("Failed to list Electron BrowserWindows.", error);
    return [];
  }
}

function getBrowserWindowTitle(browserWindow: any): string | null {
  if (!isBrowserWindowAlive(browserWindow)) {
    return null;
  }

  try {
    const title = browserWindow.getTitle?.();
    return typeof title === "string" ? title : null;
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return null;
  }
}

function getBrowserWindowUrl(browserWindow: any): string | null {
  if (!isBrowserWindowAlive(browserWindow)) {
    return null;
  }

  try {
    const webContents = browserWindow.webContents;

    if (!isWebContentsAlive(webContents)) {
      return null;
    }

    const url = webContents?.getURL?.();
    return typeof url === "string" ? url : null;
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return null;
  }
}

async function executeBrowserWindowJavaScript(
  browserWindow: any,
  source: string
): Promise<unknown> {
  if (!isBrowserWindowAlive(browserWindow)) {
    return null;
  }

  try {
    const webContents = browserWindow.webContents;

    if (!isWebContentsAlive(webContents)) {
      return null;
    }

    const executeJavaScript = webContents?.executeJavaScript;

    if (typeof executeJavaScript !== "function") {
      return null;
    }

    return await executeJavaScript.call(webContents, source, true);
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return null;
  }
}

function callBrowserWindowMethod(
  browserWindow: any,
  methodName: string,
  ...args: unknown[]
): boolean {
  if (!isBrowserWindowAlive(browserWindow)) {
    return false;
  }

  try {
    const method = browserWindow?.[methodName];

    if (typeof method !== "function") {
      return false;
    }

    method.call(browserWindow, ...args);
    return true;
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return false;
  }
}

async function callBrowserWindowMethodAsync(
  browserWindow: any,
  methodName: string,
  ...args: unknown[]
): Promise<boolean> {
  if (!isBrowserWindowAlive(browserWindow)) {
    return false;
  }

  try {
    const method = browserWindow?.[methodName];

    if (typeof method !== "function") {
      return false;
    }

    await method.call(browserWindow, ...args);
    return true;
  } catch (error) {
    logDeadTransparentBrowserWindow(error);
    return false;
  }
}

function addUniqueBrowserWindow(targets: any[], candidate: any): void {
  if (
    !isBrowserWindowAlive(candidate) ||
    targets.some((target) => browserWindowsAreSame(target, candidate))
  ) {
    return;
  }

  targets.push(candidate);
}

async function flushTransparentBrowserWindowPendingSave(
  browserWindow: any
): Promise<void> {
  if (!isBrowserWindowAlive(browserWindow)) {
    return;
  }

  await executeBrowserWindowJavaScript(
    browserWindow,
    "window.stickyTransparentApi?.flushPendingSave?.()"
  );
}

async function findExistingTransparentWindow(
  BrowserWindow: any,
  identity: TransparentWindowIdentity
): Promise<any | null> {
  const matchingWindows = await findTransparentWindowsMatchingIdentity(
    BrowserWindow,
    identity
  );

  return matchingWindows[0] ?? null;
}

async function findTransparentWindowsMatchingIdentity(
  BrowserWindow: any,
  identity: TransparentWindowIdentity
): Promise<any[]> {
  const allWindows = getAllBrowserWindows(BrowserWindow);
  const matchingWindows: any[] = [];

  for (const candidate of allWindows) {
    try {
      if (!isBrowserWindowAlive(candidate)) {
        continue;
      }

      if (getBrowserWindowTitle(candidate) === identity.title) {
        addUniqueBrowserWindow(matchingWindows, candidate);
        continue;
      }

      const url = getBrowserWindowUrl(candidate);

      if (
        typeof url === "string" &&
        urlMatchesTransparentIdentity(url, identity)
      ) {
        addUniqueBrowserWindow(matchingWindows, candidate);
        continue;
      }

      if (await browserWindowMatchesTransparentIdentity(candidate, identity)) {
        addUniqueBrowserWindow(matchingWindows, candidate);
      }
    } catch (error) {
      console.warn("Failed to inspect Electron BrowserWindow.", error);
    }
  }

  return matchingWindows;
}

async function findAllTransparentWindows(BrowserWindow: any): Promise<any[]> {
  const allWindows = getAllBrowserWindows(BrowserWindow);
  const transparentWindows: any[] = [];

  for (const candidate of allWindows) {
    try {
      if (!isBrowserWindowAlive(candidate)) {
        continue;
      }

      const title = getBrowserWindowTitle(candidate);
      const url = getBrowserWindowUrl(candidate);

      if (
        (typeof title === "string" &&
          title.startsWith(TRANSPARENT_WINDOW_TITLE_PREFIX)) ||
        (typeof url === "string" &&
          url.includes("#sticky-popout-transparent=")) ||
        (await browserWindowIsTransparentRoute(candidate))
      ) {
        transparentWindows.push(candidate);
      }
    } catch (error) {
      console.warn("Failed to inspect transparent BrowserWindow.", error);
    }
  }

  return transparentWindows;
}

async function getTransparentWindowKeyFromBrowserWindow(
  browserWindow: any
): Promise<string | null> {
  if (!isBrowserWindowAlive(browserWindow)) {
    return null;
  }

  const title = getBrowserWindowTitle(browserWindow);

  if (
    typeof title === "string" &&
    title.startsWith(TRANSPARENT_WINDOW_TITLE_PREFIX)
  ) {
    return normalizeAbsoluteFilePath(
      title.slice(TRANSPARENT_WINDOW_TITLE_PREFIX.length)
    );
  }

  const url = getBrowserWindowUrl(browserWindow);
  const keyFromUrl =
    typeof url === "string" ? getTransparentKeyFromUrl(url) : null;

  if (keyFromUrl) {
    return keyFromUrl;
  }

  const key = await executeBrowserWindowJavaScript(
    browserWindow,
    "window.__stickyTransparentFileKey || null"
  );

  return typeof key === "string" ? key : null;
}

function urlMatchesTransparentIdentity(
  url: string,
  identity: TransparentWindowIdentity
): boolean {
  if (!url.startsWith("data:text/html")) {
    return false;
  }

  const keyFromUrl = getTransparentKeyFromUrl(url);

  if (keyFromUrl === identity.key) {
    return true;
  }

  const decodedUrl = safelyDecodeURIComponent(url).toLowerCase();
  return decodedUrl.includes(identity.key.toLowerCase());
}

function getTransparentKeyFromUrl(url: string): string | null {
  const hashMarker = "#sticky-popout-transparent=";
  const markerIndex = url.indexOf(hashMarker);

  if (markerIndex === -1) {
    return null;
  }

  const encodedKey = url.slice(markerIndex + hashMarker.length);

  return normalizeAbsoluteFilePath(safelyDecodeURIComponent(encodedKey));
}

async function browserWindowMatchesTransparentIdentity(
  browserWindow: any,
  identity: TransparentWindowIdentity
): Promise<boolean> {
  return (
    (await executeBrowserWindowJavaScript(
      browserWindow,
      `window.__stickyTransparentRoute === true && window.__stickyTransparentFileKey === ${serializeForInlineScript(
        identity.key
      )}`
    )) === true
  );
}

async function browserWindowIsTransparentRoute(
  browserWindow: any
): Promise<boolean> {
  return (
    (await executeBrowserWindowJavaScript(
      browserWindow,
      "window.__stickyTransparentRoute === true"
    )) === true
  );
}

async function browserWindowIsSourceStickyPopout(
  browserWindow: any
): Promise<boolean> {
  if (!isBrowserWindowAlive(browserWindow)) {
    return false;
  }

  if (
    (await getTransparentWindowKeyFromBrowserWindow(browserWindow)) !== null ||
    (await browserWindowIsTransparentRoute(browserWindow))
  ) {
    return false;
  }

  return (
    (await executeBrowserWindowJavaScript(
      browserWindow,
      "document.querySelector('.sticky-popout-root') !== null"
    )) === true
  );
}

function waitForDomWindowClosed(
  domWindow: Window,
  timeoutMs: number
): Promise<boolean> {
  if (domWindow.closed === true) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = () => {
      if (domWindow.closed === true) {
        resolve(true);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }

      setTimeout(poll, 50);
    };

    poll();
  });
}

function safelyDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getVaultBasePath(plugin: StickyPopoutNotesPlugin): string | null {
  const adapter = plugin.app.vault.adapter;

  if (adapter instanceof FileSystemAdapter) {
    return adapter.getBasePath();
  }

  const adapterWithBasePath = adapter as {
    getBasePath?: () => string;
  };

  return adapterWithBasePath.getBasePath?.() ?? null;
}

function buildAbsoluteVaultFilePath(basePath: string, filePath: string): string {
  return normalizeAbsoluteFilePath(
    `${basePath.replace(/[\\/]+$/, "")}/${filePath}`
  );
}

function normalizeAbsoluteFilePath(filePath: string): string {
  let normalized = filePath.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/, "");
  }

  if (/^[a-z]:\//i.test(normalized)) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

function getTransparentWindowOptions(frontmatter: string): {
  width: number;
  height: number;
} {
  const record = parseFrontmatterRecord(frontmatter);

  return {
    width: getPositiveNumber(record.width, DEFAULT_WIDTH),
    height: getPositiveNumber(record.height, DEFAULT_HEIGHT)
  };
}

function buildTransparentStickyHtml(data: TransparentStickyHtmlData): string {
  const serializedData = serializeForInlineScript(data);
  const textReadabilityShadow = buildTextReadabilityShadowFromTone(
    data.appearance.textTone
  );

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.windowTitle)}</title>
<style>
html,
body {
  background: transparent;
  margin: 0;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:root {
  --sticky-transparent-background: ${data.appearance.background};
  --sticky-transparent-text-color: ${data.appearance.textColor};
  --sticky-transparent-caret-color: ${data.appearance.caretColor};
  --sticky-transparent-text-shadow: ${textReadabilityShadow};
}

html,
body,
.sticky-transparent-root,
.sticky-transparent-navbar,
.sticky-transparent-nav-trigger,
.sticky-transparent-nav-drag-region,
.sticky-transparent-nav-actions,
.sticky-transparent-nav-button,
.sticky-transparent-nav-button *,
.sticky-transparent-titlebar,
.sticky-transparent-titlebar-drag-region,
.sticky-transparent-title,
.sticky-transparent-file-title,
.sticky-transparent-appearance-overlay,
.sticky-transparent-appearance-overlay *,
.sticky-transparent-body,
.sticky-transparent-preview,
.sticky-transparent-preview *,
input,
button,
textarea,
label {
  -webkit-app-region: no-drag !important;
  app-region: no-drag !important;
}

.sticky-transparent-nav-trigger {
  -webkit-app-region: no-drag;
  background: transparent;
  height: ${TRANSPARENT_NAVBAR_HOVER_ZONE_PX}px;
  left: 0;
  pointer-events: none;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 10;
}

.sticky-transparent-navbar {
  -webkit-app-region: no-drag !important;
  align-items: center;
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.72);
  box-sizing: border-box;
  display: flex;
  gap: 0;
  height: ${TRANSPARENT_NAVBAR_HEIGHT_PX}px;
  justify-content: stretch;
  left: 0;
  opacity: 0;
  padding: 4px 8px;
  pointer-events: none;
  position: fixed;
  right: 0;
  top: 0;
  transform: translateY(-100%);
  transition: opacity 120ms ease, transform 120ms ease;
  overflow: visible;
  z-index: 30;
}

body.is-navbar-visible .sticky-transparent-navbar,
.sticky-transparent-navbar:hover {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.sticky-transparent-nav-drag-region {
  -webkit-app-region: no-drag !important;
  app-region: no-drag !important;
  align-items: center;
  align-self: center;
  border-radius: 6px;
  cursor: move;
  display: flex;
  flex: 0 0 44px;
  height: ${TRANSPARENT_NAV_BUTTON_HEIGHT_PX}px;
  justify-content: center;
  margin-right: auto;
  min-width: 44px;
  pointer-events: auto;
  position: relative;
  user-select: none;
  width: 44px;
  z-index: 31;
}

.sticky-transparent-nav-drag-region::before {
  background:
    linear-gradient(#111111, #111111) 0 0 / 16px 2px no-repeat,
    linear-gradient(#111111, #111111) 0 6px / 16px 2px no-repeat,
    linear-gradient(#111111, #111111) 0 12px / 16px 2px no-repeat;
  content: "";
  height: 14px;
  opacity: 0.52;
  pointer-events: none;
  width: 16px;
}

.sticky-transparent-nav-actions {
  -webkit-app-region: no-drag !important;
  app-region: no-drag !important;
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  height: 100%;
  overflow: visible;
  pointer-events: auto;
  position: relative;
  z-index: 100;
}

.sticky-transparent-nav-button {
  -webkit-app-region: no-drag !important;
  app-region: no-drag !important;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(17, 17, 17, 0.32);
  border-radius: 6px;
  box-sizing: border-box;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  color: #111111;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  line-height: 1.2;
  min-width: 52px;
  min-height: ${TRANSPARENT_NAV_BUTTON_HEIGHT_PX}px;
  overflow: visible;
  padding: 3px 10px;
  pointer-events: auto;
  position: relative;
  z-index: 101;
}

.sticky-transparent-nav-button,
.sticky-transparent-nav-button * {
  -webkit-app-region: no-drag !important;
  app-region: no-drag !important;
  pointer-events: auto;
}

.sticky-transparent-root {
  -webkit-text-fill-color: var(--sticky-transparent-text-color);
  background: var(--sticky-transparent-background);
  box-sizing: border-box;
  color: var(--sticky-transparent-text-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100vh;
  padding: 10px;
  text-shadow: var(--sticky-transparent-text-shadow);
}

.sticky-transparent-titlebar {
  -webkit-app-region: no-drag;
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  min-height: 24px;
  user-select: none;
}

.sticky-transparent-titlebar-drag-region {
  -webkit-app-region: no-drag !important;
  app-region: no-drag !important;
  flex: 1 1 auto;
  min-width: 0;
}

.sticky-transparent-title {
  -webkit-app-region: no-drag !important;
  -webkit-text-fill-color: var(--sticky-transparent-text-color);
  color: var(--sticky-transparent-text-color);
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticky-transparent-file-title {
  -webkit-app-region: no-drag !important;
  -webkit-text-fill-color: var(--sticky-transparent-text-color);
  color: var(--sticky-transparent-text-color);
  font-size: 11px;
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sticky-transparent-route-label {
  -webkit-text-fill-color: var(--sticky-transparent-text-color);
  -webkit-app-region: no-drag;
  color: var(--sticky-transparent-text-color);
  font-size: 10px;
  letter-spacing: 0;
  line-height: 1.2;
}

.sticky-transparent-body {
  -webkit-text-fill-color: var(--sticky-transparent-text-color);
  -webkit-app-region: no-drag;
  appearance: none;
  background: var(--sticky-transparent-background);
  border: none;
  box-sizing: border-box;
  caret-color: var(--sticky-transparent-caret-color);
  color: var(--sticky-transparent-text-color);
  flex: 1;
  font: 15px/1.5 inherit;
  outline: none;
  resize: none;
  text-shadow: var(--sticky-transparent-text-shadow);
  width: 100%;
}

.sticky-transparent-body:hover,
.sticky-transparent-body:focus,
.sticky-transparent-body:active {
  -webkit-text-fill-color: var(--sticky-transparent-text-color);
  background: var(--sticky-transparent-background);
  color: var(--sticky-transparent-text-color);
}

.sticky-transparent-preview {
  -webkit-app-region: no-drag;
  -webkit-text-fill-color: var(--sticky-transparent-text-color);
  background: var(--sticky-transparent-background);
  box-sizing: border-box;
  color: var(--sticky-transparent-text-color);
  display: none;
  flex: 1;
  font: 15px/1.5 inherit;
  overflow: auto;
  padding: 0;
  text-shadow: var(--sticky-transparent-text-shadow);
  width: 100%;
}

.sticky-transparent-preview * {
  -webkit-app-region: no-drag;
  color: inherit;
  text-shadow: inherit;
}

.sticky-transparent-preview pre,
.sticky-transparent-preview code {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 4px;
}

.sticky-transparent-preview pre {
  overflow: auto;
  padding: 8px;
}

body.is-preview-mode .sticky-transparent-body {
  display: none;
}

body.is-preview-mode .sticky-transparent-preview {
  display: block;
}

.sticky-transparent-status {
  -webkit-text-fill-color: var(--sticky-transparent-text-color);
  color: var(--sticky-transparent-text-color);
  font-size: 11px;
  text-align: right;
}

.sticky-transparent-appearance-overlay {
  -webkit-app-region: no-drag;
  align-items: center;
  background: rgba(0, 0, 0, 0.24);
  bottom: 0;
  box-sizing: border-box;
  display: none;
  justify-content: center;
  left: 0;
  padding: 14px;
  pointer-events: auto;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 30;
}

.sticky-transparent-appearance-overlay.is-open {
  display: flex;
}

.sticky-transparent-appearance-panel {
  -webkit-app-region: no-drag;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(17, 17, 17, 0.24);
  border-radius: 8px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28);
  box-sizing: border-box;
  color: #111111;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(80vh, 360px);
  max-width: 280px;
  overflow: hidden;
  padding: 12px;
  text-shadow: none;
  width: 100%;
}

.sticky-transparent-appearance-title {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 800;
}

.sticky-transparent-appearance-content {
  -webkit-app-region: no-drag;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.sticky-transparent-appearance-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
}

.sticky-transparent-appearance-field input[type="range"],
.sticky-transparent-appearance-field input[type="color"] {
  width: 100%;
}

.sticky-transparent-tone-labels {
  color: rgba(17, 17, 17, 0.66);
  display: flex;
  font-size: 11px;
  justify-content: space-between;
}

.sticky-transparent-appearance-switch {
  align-items: center;
  display: flex;
  flex-direction: row;
  gap: 8px;
}

.sticky-transparent-appearance-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  justify-content: flex-end;
}

.sticky-transparent-appearance-actions button {
  border: 1px solid rgba(17, 17, 17, 0.28);
  border-radius: 6px;
  cursor: pointer;
  font-weight: 700;
  padding: 4px 10px;
}

.sticky-transparent-appearance-overlay input,
.sticky-transparent-appearance-overlay button {
  -webkit-app-region: no-drag;
}
</style>
</head>
<body>
<div class="sticky-transparent-nav-trigger"></div>
<div class="sticky-transparent-navbar">
  <div class="sticky-transparent-nav-drag-region" aria-label="拖动窗口" title="拖动窗口"></div>
  <div class="sticky-transparent-nav-actions">
    <button class="sticky-transparent-nav-button" data-action="appearance" type="button">外观</button>
    <button class="sticky-transparent-nav-button sticky-transparent-nav-pin-button" data-action="pin" type="button">未置顶</button>
    <button class="sticky-transparent-nav-button sticky-transparent-nav-preview-button" data-action="preview" type="button">预览</button>
    <button class="sticky-transparent-nav-button" data-action="close" type="button">关闭</button>
  </div>
</div>
<div class="sticky-transparent-appearance-overlay">
  <div class="sticky-transparent-appearance-panel">
    <div class="sticky-transparent-appearance-title">外观</div>
    <div class="sticky-transparent-appearance-content">
      <label class="sticky-transparent-appearance-field">
        颜色
        <input class="sticky-transparent-appearance-color" type="color">
      </label>
      <label class="sticky-transparent-appearance-field">
        内容背景透明度 <span class="sticky-transparent-background-value"></span>
        <input class="sticky-transparent-background-opacity" max="100" min="0" step="1" type="range">
      </label>
      <label class="sticky-transparent-appearance-field">
        字体颜色/透明度 <span class="sticky-transparent-text-tone-value"></span>
        <input class="sticky-transparent-text-tone" max="100" min="-100" step="1" type="range">
        <span class="sticky-transparent-tone-labels"><span>白</span><span>透明</span><span>黑</span></span>
      </label>
      <label class="sticky-transparent-appearance-field sticky-transparent-appearance-switch">
        <input class="sticky-transparent-use-transparent" type="checkbox">
        使用透明窗口
      </label>
    </div>
    <div class="sticky-transparent-appearance-actions">
      <button class="sticky-transparent-appearance-apply" type="button">应用</button>
      <button class="sticky-transparent-appearance-close" type="button">关闭</button>
    </div>
  </div>
</div>
<div class="sticky-transparent-root">
  <div class="sticky-transparent-titlebar">
    <div class="sticky-transparent-titlebar-drag-region">
      <div class="sticky-transparent-title">Transparent Sticky</div>
      <div class="sticky-transparent-file-title">${escapeHtml(data.title)}</div>
    </div>
  </div>
  <div class="sticky-transparent-route-label">v0.5 transparent window</div>
  <textarea class="sticky-transparent-body" spellcheck="true"></textarea>
  <div class="sticky-transparent-preview markdown-rendered"></div>
  <div class="sticky-transparent-status">Saved</div>
</div>
<script>
(() => {
  const data = ${serializedData};
  const saveDelay = ${TRANSPARENT_STICKY_SAVE_DELAY_MS};
  const navbarHoverZone = ${TRANSPARENT_NAVBAR_HOVER_ZONE_PX};
  const navbarHideDelay = ${TRANSPARENT_NAVBAR_HIDE_DELAY_MS};
  const root = document.documentElement;
  const textarea = document.querySelector(".sticky-transparent-body");
  const navbar = document.querySelector(".sticky-transparent-navbar");
  const dragHandle = document.querySelector(".sticky-transparent-nav-drag-region");
  const statusEl = document.querySelector(".sticky-transparent-status");
  const appearanceButton = document.querySelector('[data-action="appearance"]');
  const pinButton = document.querySelector('[data-action="pin"]');
  const previewButton = document.querySelector('[data-action="preview"]');
  const closeButton = document.querySelector('[data-action="close"]');
  const previewEl = document.querySelector(".sticky-transparent-preview");
  const appearanceOverlay = document.querySelector(".sticky-transparent-appearance-overlay");
  const appearanceColorInput = document.querySelector(".sticky-transparent-appearance-color");
  const backgroundOpacityInput = document.querySelector(".sticky-transparent-background-opacity");
  const backgroundOpacityValue = document.querySelector(".sticky-transparent-background-value");
  const textToneInput = document.querySelector(".sticky-transparent-text-tone");
  const textToneValue = document.querySelector(".sticky-transparent-text-tone-value");
  const useTransparentInput = document.querySelector(".sticky-transparent-use-transparent");
  const appearanceApplyButton = document.querySelector(".sticky-transparent-appearance-apply");
  const appearanceCloseButton = document.querySelector(".sticky-transparent-appearance-close");
  let appearanceState = {
    color: data.appearance.color,
    backgroundOpacity: data.appearance.backgroundOpacity,
    textTone: data.appearance.textTone,
    useTransparentWindow: data.appearance.useTransparentWindow
  };
  let alwaysOnTopState = Boolean(data.alwaysOnTop);
  let isAlwaysOnTopTogglePending = false;
  let isPreviewMode = false;
  let isPreviewTogglePending = false;
  let saveTimer = null;
  let appearanceSaveTimer = null;
  let hasPendingSave = false;
  let isNavbarPointerInside = false;
  let navbarHideTimer = null;
  let lastPointerY = Number.POSITIVE_INFINITY;
  let transparentDragState = null;

  window.__stickyTransparentRoute = true;
  window.__stickyTransparentFileKey = data.fileKey;
  textarea.value = data.visibleBody;
  applyAppearanceState();
  data.alwaysOnTop = alwaysOnTopState;
  setAlwaysOnTopButtonState(alwaysOnTopState);
  setPreviewMode(false);

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function isAppearanceOverlayOpen() {
    return appearanceOverlay.classList.contains("is-open");
  }

  function setNavbarVisible(isVisible) {
    document.body.classList.toggle("is-navbar-visible", isVisible);
  }

  function clearNavbarHideTimer() {
    if (navbarHideTimer !== null) {
      clearTimeout(navbarHideTimer);
      navbarHideTimer = null;
    }
  }

  function isPointerInNavbarHoverZone() {
    return lastPointerY >= 0 && lastPointerY <= navbarHoverZone;
  }

  function shouldKeepNavbarVisible() {
    return (
      isPointerInNavbarHoverZone() ||
      isNavbarPointerInside ||
      isAppearanceOverlayOpen()
    );
  }

  function showNavbar() {
    clearNavbarHideTimer();
    setNavbarVisible(true);
  }

  function hideNavbar() {
    clearNavbarHideTimer();
    setNavbarVisible(false);
  }

  function scheduleNavbarHide() {
    if (shouldKeepNavbarVisible()) {
      showNavbar();
      return;
    }

    clearNavbarHideTimer();
    navbarHideTimer = setTimeout(() => {
      navbarHideTimer = null;

      if (!shouldKeepNavbarVisible()) {
        setNavbarVisible(false);
      }
    }, navbarHideDelay);
  }

  function updateNavbarVisibility(clientY) {
    lastPointerY = clientY;

    if (shouldKeepNavbarVisible()) {
      showNavbar();
      return;
    }

    scheduleNavbarHide();
  }

  function stopNavbarButtonPointerEvent(event) {
    event.stopPropagation();
  }

  function pointIsInsideRect(x, y, rect) {
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  function logNavbarClickHitTest(event) {
    if (event.clientY > navbarHoverZone) {
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const appearanceRect = appearanceButton.getBoundingClientRect();
    const pinRect = pinButton.getBoundingClientRect();
    const previewRect = previewButton.getBoundingClientRect();
    const closeRect = closeButton.getBoundingClientRect();

    console.debug("Sticky navbar click hit-test", {
      x: event.clientX,
      y: event.clientY,
      targetClass: target?.className,
      targetTag: target?.tagName,
      inAppearanceButton: pointIsInsideRect(
        event.clientX,
        event.clientY,
        appearanceRect
      ),
      inPinButton: pointIsInsideRect(event.clientX, event.clientY, pinRect),
      inPreviewButton: pointIsInsideRect(event.clientX, event.clientY, previewRect),
      inCloseButton: pointIsInsideRect(event.clientX, event.clientY, closeRect)
    });
  }

  async function invokeTransparentDragSession(channel) {
    if (!channel) {
      return;
    }

    try {
      const electron = window.require("electron");

      if (!electron?.ipcRenderer?.invoke) {
        return;
      }

      await electron.ipcRenderer.invoke(channel, {
        fileKey: data.fileKey
      });
    } catch (error) {
      console.warn("Sticky transparent drag session failed", error);
    }
  }

  function getRemoteCurrentWindowForTransparentDrag() {
    try {
      const electron = window.require?.("electron");
      const currentWindow = electron?.remote?.getCurrentWindow?.();

      if (typeof currentWindow?.setPosition === "function") {
        return currentWindow;
      }
    } catch {
      // Remote access is optional; host-side drag remains the final fallback.
    }

    return null;
  }

  function getTransparentRendererDragMethod() {
    if (typeof window.moveTo === "function") {
      return "window.moveTo";
    }

    if (getRemoteCurrentWindowForTransparentDrag()) {
      return "remote.setPosition";
    }

    return "hostFallback";
  }

  function moveTransparentRendererWindow(state, nextX, nextY) {
    let moveError = null;

    if (typeof window.moveTo === "function") {
      try {
        window.moveTo(nextX, nextY);
        return "window.moveTo";
      } catch (error) {
        moveError = error;
      }
    } else {
      moveError = new Error("window.moveTo is unavailable.");
    }

    try {
      const currentWindow =
        state.remoteWindow || getRemoteCurrentWindowForTransparentDrag();

      if (typeof currentWindow?.setPosition === "function") {
        state.remoteWindow = currentWindow;
        currentWindow.setPosition(nextX, nextY);
        return "remote.setPosition";
      }
    } catch (error) {
      moveError = error;
    }

    throw moveError || new Error("Transparent renderer window move APIs are unavailable.");
  }

  function warnTransparentRendererDragFailure(state, error) {
    if (state.didWarnFailure) {
      return;
    }

    state.didWarnFailure = true;
    console.warn(
      "Sticky transparent renderer drag failed; falling back to host drag",
      error
    );
  }

  function startTransparentHostDragFallback(state, error) {
    if (state.hostFallbackStarted || state.moveCount > 0) {
      return;
    }

    state.hostFallbackStarted = true;
    state.method = "hostFallback";
    warnTransparentRendererDragFailure(state, error);
    console.warn("Sticky transparent drag using host fallback");
    state.hostFallbackStartPromise = invokeTransparentDragSession(
      data.dragStartIpcChannel
    );
  }

  function flushTransparentRendererDragMove() {
    const state = transparentDragState;

    if (!state || !state.isDragging) {
      return;
    }

    state.rafId = null;

    if (state.hostFallbackStarted) {
      return;
    }

    const nextX = state.pendingX;
    const nextY = state.pendingY;

    if (nextX === null || nextY === null) {
      return;
    }

    state.pendingX = null;
    state.pendingY = null;

    if (nextX === state.lastX && nextY === state.lastY) {
      return;
    }

    try {
      const method = moveTransparentRendererWindow(state, nextX, nextY);
      state.method = method;
      state.lastX = nextX;
      state.lastY = nextY;
      state.moveCount += 1;

      if (!state.didLogMoved) {
        state.didLogMoved = true;
        console.debug("Sticky transparent renderer drag moved", {
          method,
          x: nextX,
          y: nextY
        });
      }
    } catch (error) {
      startTransparentHostDragFallback(state, error);
    }
  }

  function scheduleTransparentRendererDragMove(event) {
    const state = transparentDragState;

    if (!state || !state.isDragging || state.hostFallbackStarted) {
      return;
    }

    const nextX = Math.round(
      state.startWindowScreenX + event.screenX - state.startMouseScreenX
    );
    const nextY = Math.round(
      state.startWindowScreenY + event.screenY - state.startMouseScreenY
    );

    state.pendingX = nextX;
    state.pendingY = nextY;

    if (nextX === state.lastX && nextY === state.lastY) {
      return;
    }

    if (state.rafId === null) {
      state.rafId = requestAnimationFrame(flushTransparentRendererDragMove);
    }
  }

  function requestTransparentDragStart(event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is best-effort; window movement can continue without it.
    }

    const startWindowScreenX = Math.round(window.screenX || 0);
    const startWindowScreenY = Math.round(window.screenY || 0);
    const method = getTransparentRendererDragMethod();

    transparentDragState = {
      didLogMoved: false,
      didWarnFailure: false,
      hostFallbackStarted: false,
      hostFallbackStartPromise: null,
      isDragging: true,
      lastX: startWindowScreenX,
      lastY: startWindowScreenY,
      method,
      moveCount: 0,
      pendingX: null,
      pendingY: null,
      pointerId: event.pointerId,
      rafId: null,
      remoteWindow: null,
      startMouseScreenX: event.screenX,
      startMouseScreenY: event.screenY,
      startWindowScreenX,
      startWindowScreenY
    };

    console.debug("Sticky transparent renderer drag started", { method });
  }

  function requestTransparentDragMove(event) {
    if (!transparentDragState?.isDragging) {
      return;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();
    scheduleTransparentRendererDragMove(event);
  }

  function requestTransparentDragStop(event) {
    const state = transparentDragState;

    if (!state) {
      return;
    }

    state.isDragging = false;
    transparentDragState = null;

    try {
      const pointerId =
        typeof event?.pointerId === "number" ? event.pointerId : state.pointerId;

      if (typeof pointerId === "number") {
        dragHandle?.releasePointerCapture?.(pointerId);
      }
    } catch {
      // Release is best-effort and can fail when capture was not acquired.
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (state.rafId !== null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    console.debug("Sticky transparent renderer drag stopped", {
      method: state.method,
      moveCount: state.moveCount
    });

    if (!state.hostFallbackStarted) {
      return;
    }

    const startPromise = state.hostFallbackStartPromise;
    const stop = () => invokeTransparentDragSession(data.dragStopIpcChannel);

    if (startPromise) {
      void Promise.resolve(startPromise).finally(() => {
        void stop();
      });
      return;
    }

    void stop();
  }

  function normalizeHexColor(value) {
    const raw = String(value || "").trim();
    const shortMatch = raw.match(/^#?([0-9a-fA-F]{3})$/);

    if (shortMatch) {
      const chars = shortMatch[1].split("");
      return ("#" + chars.map((char) => char + char).join("")).toUpperCase();
    }

    const longMatch = raw.match(/^#?([0-9a-fA-F]{6})$/);
    return longMatch ? ("#" + longMatch[1]).toUpperCase() : "${DEFAULT_COLOR_HEX}";
  }

  function normalizeOpacity(value) {
    const opacity = Number(value);
    return Number.isFinite(opacity)
      ? Math.min(100, Math.max(0, Math.round(opacity)))
      : ${DEFAULT_BACKGROUND_OPACITY};
  }

  function normalizeTextTone(value) {
    const tone = Number(value);
    return Number.isFinite(tone)
      ? Math.min(100, Math.max(-100, Math.round(tone)))
      : ${DEFAULT_TEXT_TONE};
  }

  function formatAlpha(value) {
    return value.toFixed(2).replace(/0+$/, "").replace(/\\.$/, "");
  }

  function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex);
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16)
    };
  }

  function buildBackground(color, opacity) {
    const normalizedOpacity = normalizeOpacity(opacity);

    if (normalizedOpacity === 0) return "transparent";

    const rgb = hexToRgb(color);
    return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " +
      formatAlpha(normalizedOpacity / 100) + ")";
  }

  function buildTextColor(textTone) {
    const tone = normalizeTextTone(textTone);
    const opacity = Math.abs(tone) / 100;

    if (tone < 0) return "rgba(255, 255, 255, " + formatAlpha(opacity) + ")";
    if (tone === 0) return "rgba(0, 0, 0, 0)";
    return "rgba(0, 0, 0, " + formatAlpha(opacity) + ")";
  }

  function buildCaretColor(textTone) {
    return normalizeTextTone(textTone) < 0 ? "#FFFFFF" : "#000000";
  }

  function buildTextShadow(textTone) {
    const tone = normalizeTextTone(textTone);

    if (tone === 0) return "none";
    if (tone < 0) {
      return "0 1px 2px rgba(0, 0, 0, 0.75), 0 -1px 2px rgba(0, 0, 0, 0.55), 0 0 1px rgba(255, 255, 255, 0.25)";
    }
    return "0 1px 2px rgba(255, 255, 255, 0.85), 0 -1px 2px rgba(255, 255, 255, 0.65), 0 0 1px rgba(0, 0, 0, 0.28)";
  }

  function describeTextTone(textTone) {
    const tone = normalizeTextTone(textTone);

    if (tone < 0) return "白色 " + Math.abs(tone) + "%";
    if (tone === 0) return "透明";
    return "黑色 " + tone + "%";
  }

  function applyAppearanceState(options = {}) {
    appearanceState = {
      color: normalizeHexColor(appearanceState.color),
      backgroundOpacity: normalizeOpacity(appearanceState.backgroundOpacity),
      textTone: normalizeTextTone(appearanceState.textTone),
      useTransparentWindow: Boolean(appearanceState.useTransparentWindow)
    };

    root.style.setProperty(
      "--sticky-transparent-background",
      buildBackground(appearanceState.color, appearanceState.backgroundOpacity)
    );
    root.style.setProperty(
      "--sticky-transparent-text-color",
      buildTextColor(appearanceState.textTone)
    );
    root.style.setProperty(
      "--sticky-transparent-caret-color",
      buildCaretColor(appearanceState.textTone)
    );
    root.style.setProperty(
      "--sticky-transparent-text-shadow",
      buildTextShadow(appearanceState.textTone)
    );

    if (options.updateInputs !== false) {
      appearanceColorInput.value = appearanceState.color;
      backgroundOpacityInput.value = String(appearanceState.backgroundOpacity);
      textToneInput.value = String(appearanceState.textTone);
      useTransparentInput.checked = appearanceState.useTransparentWindow;
    }

    backgroundOpacityValue.textContent = appearanceState.backgroundOpacity + "%";
    textToneValue.textContent = describeTextTone(appearanceState.textTone);
  }

  function readCurrentWindowBounds() {
    try {
      const electron = window.require("electron");
      const bounds = electron?.remote?.getCurrentWindow?.()?.getBounds?.();

      if (!bounds) {
        return null;
      }

      return {
        height: bounds.height,
        width: bounds.width,
        x: bounds.x,
        y: bounds.y
      };
    } catch (error) {
      console.warn("Failed to read transparent sticky window bounds.", error);
      return null;
    }
  }

  async function closeCurrentTransparentWindow() {
    let electron = null;
    let ipcFailure = null;

    try {
      electron = window.require("electron");
    } catch (error) {
      console.warn("Failed to access Electron for transparent sticky close.", error);
      ipcFailure = error;
    }

    if (electron?.ipcRenderer?.invoke && data.closeCurrentWindowIpcChannel) {
      try {
        const closeResult = await electron.ipcRenderer.invoke(
          data.closeCurrentWindowIpcChannel,
          {
            fileKey: data.fileKey,
            filePath: data.filePath
          }
        );

        if (
          closeResult?.ok === true &&
          closeResult.closed === true
        ) {
          return closeResult;
        }

        console.warn(
          "Transparent sticky close-current IPC did not close the window.",
          closeResult?.error || closeResult
        );
        ipcFailure = closeResult;
      } catch (error) {
        console.warn(
          "Failed to close transparent sticky window through IPC.",
          error
        );
        ipcFailure = error;
      }
    }

    try {
      const currentWindow = electron?.remote?.getCurrentWindow?.();

      if (currentWindow?.close) {
        currentWindow.close();
        await waitForCloseFallback(600);

        if (currentWindow.isDestroyed?.() === true) {
          return {
            ok: true,
            closed: true,
            destroyedFallback: false,
            method: "remoteFallback"
          };
        }

        if (currentWindow.destroy) {
          currentWindow.destroy();
          await waitForCloseFallback(600);

          return {
            ok: true,
            closed: currentWindow.isDestroyed?.() === true,
            destroyedFallback: true,
            method: "remoteFallback",
            error:
              currentWindow.isDestroyed?.() === true
                ? undefined
                : "Electron remote destroy did not close the window."
          };
        }

        return {
          ok: true,
          closed: false,
          destroyedFallback: false,
          method: "remoteFallback",
          error: "Electron remote close did not close the window."
        };
      }
    } catch (error) {
      console.warn("Failed to close transparent sticky window via remote.", error);
      ipcFailure = error;
    }

    try {
      window.close();
      return {
        ok: true,
        closed: false,
        destroyedFallback: false,
        method: "remoteFallback",
        error:
          "window.close fallback was requested, but BrowserWindow closure could not be confirmed."
      };
    } catch (error) {
      console.warn("Failed to close transparent sticky browser window.", error);
      return {
        ok: false,
        closed: false,
        destroyedFallback: false,
        method: "remoteFallback",
        error: String(error || ipcFailure || "Transparent sticky close failed.")
      };
    }
  }

  function waitForCloseFallback(delayMs) {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  async function saveAppearance(switchMode) {
    if (appearanceSaveTimer !== null) {
      clearTimeout(appearanceSaveTimer);
      appearanceSaveTimer = null;
    }

    try {
      setStatus("Saving...");
      const electron = window.require("electron");
      const result = await electron.ipcRenderer.invoke(data.ipcChannel, {
        appearance: appearanceState,
        fileKey: data.fileKey,
        filePath: data.filePath,
        sourceWindowBounds: readCurrentWindowBounds(),
        switchMode
      });

      if (!result || result.ok !== true) {
        throw new Error(result?.error || "Failed to save appearance.");
      }

      if (typeof result.frontmatter === "string") {
        data.frontmatter = result.frontmatter;
      }

      if (result.appearance) {
        appearanceState = {
          color: result.appearance.color,
          backgroundOpacity: result.appearance.backgroundOpacity,
          textTone: result.appearance.textTone,
          useTransparentWindow: result.appearance.useTransparentWindow
        };
        applyAppearanceState();
      }

      if (result.switchToPopout === true) {
        console.debug("Sticky transparent switch to popout acknowledged", {
          closeSourceWindow: result.closeSourceWindow,
          sourceCloseMethod: result.sourceCloseMethod,
          switchBoundsPreserved: result.switchBoundsPreserved
        });

        if (result.switchBoundsPreserved === false) {
          console.warn(
            "Transparent sticky window bounds were not available; opened Pop-out with fallback geometry."
          );
        }

        if (result.closeSourceWindow === false || result.warning) {
          console.warn(
            "Transparent sticky switched to Pop-out, but source close needs attention.",
            result.warning || result
          );
        }

        setStatus("Switched");
        return true;
      }

      setStatus("Saved");
      return true;
    } catch (error) {
      console.error("Failed to save transparent sticky appearance", error);
      setStatus("Error");
      return false;
    }
  }

  function setAlwaysOnTopButtonState(alwaysOnTop) {
    alwaysOnTopState = Boolean(alwaysOnTop);
    data.alwaysOnTop = alwaysOnTopState;
    pinButton.textContent = alwaysOnTopState ? "已置顶" : "未置顶";
    pinButton.setAttribute("aria-pressed", alwaysOnTopState ? "true" : "false");
    pinButton.title = alwaysOnTopState ? "已置顶" : "未置顶";
  }

  function upsertTransparentAlwaysOnTopFrontmatter(frontmatter, alwaysOnTop) {
    const value = "transparentAlwaysOnTop: " + (alwaysOnTop ? "true" : "false");
    const source = String(frontmatter || "");

    if (!source) {
      return value;
    }

    const lineEnding = source.includes("\\r\\n")
      ? "\\r\\n"
      : source.includes("\\r")
        ? "\\r"
        : "\\n";
    const lines = source.split(/\\r\\n|\\n|\\r/);
    const existingIndex = lines.findIndex((line) =>
      /^\\s*transparentAlwaysOnTop\\s*:/.test(line)
    );

    if (existingIndex !== -1) {
      const indent = lines[existingIndex].match(/^\\s*/)?.[0] || "";
      lines[existingIndex] = indent + value;
      return lines.join(lineEnding);
    }

    const closingIndex = lines.findIndex(
      (line, index) => index > 0 && line.trim() === "---"
    );

    if (closingIndex > 0) {
      lines.splice(closingIndex, 0, value);
      return lines.join(lineEnding);
    }

    return source.endsWith(lineEnding)
      ? source + value
      : source + lineEnding + value;
  }

  function invokeTransparentAlwaysOnTopWithTimeout(nextAlwaysOnTop) {
    return new Promise((resolve, reject) => {
      let didSettle = false;
      const timeoutMs = 2000;
      const timer = setTimeout(() => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        resolve({ timedOut: true });
      }, timeoutMs);

      const finish = (callback) => {
        if (didSettle) {
          return;
        }

        didSettle = true;
        clearTimeout(timer);
        callback();
      };

      try {
        const electron = window.require("electron");

        if (!electron?.ipcRenderer?.invoke || !data.alwaysOnTopIpcChannel) {
          throw new Error("Transparent always-on-top IPC is unavailable.");
        }

        Promise.resolve(
          electron.ipcRenderer.invoke(data.alwaysOnTopIpcChannel, {
            alwaysOnTop: nextAlwaysOnTop,
            fileKey: data.fileKey,
            filePath: data.filePath
          })
        )
          .then((result) => {
            finish(() => resolve({ result, timedOut: false }));
          })
          .catch((error) => {
            finish(() => reject(error));
          });
      } catch (error) {
        finish(() => reject(error));
      }
    });
  }

  async function toggleAlwaysOnTop() {
    if (isAlwaysOnTopTogglePending) {
      return false;
    }

    const previousStatus = statusEl.textContent || "Saved";
    const previousAlwaysOnTop = alwaysOnTopState;
    const nextAlwaysOnTop = !previousAlwaysOnTop;
    const previousFrontmatter = data.frontmatter;
    isAlwaysOnTopTogglePending = true;
    pinButton.disabled = true;
    setAlwaysOnTopButtonState(nextAlwaysOnTop);
    data.frontmatter = upsertTransparentAlwaysOnTopFrontmatter(
      data.frontmatter,
      nextAlwaysOnTop
    );
    console.debug("Sticky transparent always-on-top optimistic update", {
      previousAlwaysOnTop,
      nextAlwaysOnTop
    });

    try {
      flushPendingSave();
    } catch {
      setStatus("Error");
      setAlwaysOnTopButtonState(previousAlwaysOnTop);
      data.frontmatter = previousFrontmatter;
      isAlwaysOnTopTogglePending = false;
      pinButton.disabled = false;
      return false;
    }

    try {
      setStatus("Saving...");
      const ipcResult = await invokeTransparentAlwaysOnTopWithTimeout(
        nextAlwaysOnTop
      );

      if (ipcResult.timedOut === true) {
        console.warn(
          "Transparent always-on-top IPC timed out after optimistic update",
          {
            requestedAlwaysOnTop: nextAlwaysOnTop
          }
        );
        setStatus("Saved");
        return true;
      }

      const result = ipcResult.result;
      const hasOkField =
        result !== null &&
        typeof result === "object" &&
        Object.prototype.hasOwnProperty.call(result, "ok");

      if (result === undefined || result === null || !hasOkField) {
        console.warn(
          "Transparent always-on-top IPC returned no result after optimistic update; keeping optimistic state",
          {
            requestedAlwaysOnTop: nextAlwaysOnTop,
            result
          }
        );
        setStatus("Saved");
        return true;
      }

      if (result.ok === false) {
        console.warn(
          "Sticky transparent always-on-top optimistic update rolled back",
          {
            requestedAlwaysOnTop: nextAlwaysOnTop,
            result
          }
        );
        setStatus(result?.saveFailed ? "Error" : previousStatus);
        setAlwaysOnTopButtonState(previousAlwaysOnTop);
        data.frontmatter = previousFrontmatter;
        return false;
      }

      if (result.ok !== true) {
        console.warn(
          "Transparent always-on-top IPC returned no result after optimistic update; keeping optimistic state",
          {
            requestedAlwaysOnTop: nextAlwaysOnTop,
            result
          }
        );
        setStatus("Saved");
        return true;
      }

      if (typeof result.frontmatter === "string") {
        data.frontmatter = result.frontmatter;
      }

      const confirmedAlwaysOnTop =
        typeof result.alwaysOnTop === "boolean"
          ? result.alwaysOnTop
          : nextAlwaysOnTop;
      setAlwaysOnTopButtonState(confirmedAlwaysOnTop);

      if (typeof result.frontmatter !== "string") {
        data.frontmatter = upsertTransparentAlwaysOnTopFrontmatter(
          data.frontmatter,
          confirmedAlwaysOnTop
        );
      }

      console.debug("Sticky transparent always-on-top IPC confirmed", {
        requestedAlwaysOnTop: nextAlwaysOnTop,
        confirmedAlwaysOnTop
      });
      setStatus("Saved");
      return true;
    } catch (error) {
      console.warn(
        "Sticky transparent always-on-top optimistic update rolled back",
        error
      );
      setStatus(previousStatus);
      setAlwaysOnTopButtonState(previousAlwaysOnTop);
      data.frontmatter = previousFrontmatter;
      return false;
    } finally {
      isAlwaysOnTopTogglePending = false;
      pinButton.disabled = false;
    }
  }

  function setPreviewMode(isPreview) {
    isPreviewMode = Boolean(isPreview);
    document.body.classList.toggle("is-preview-mode", isPreviewMode);
    previewButton.textContent = isPreviewMode ? "编辑" : "预览";
    previewButton.title = isPreviewMode ? "编辑" : "预览";
    previewButton.setAttribute("aria-pressed", isPreviewMode ? "true" : "false");
  }

  async function renderMarkdownPreview() {
    if (isPreviewTogglePending) {
      return false;
    }

    if (isPreviewMode) {
      setPreviewMode(false);
      return true;
    }

    const previousStatus = statusEl.textContent || "Saved";
    isPreviewTogglePending = true;
    previewButton.disabled = true;

    try {
      try {
        flushPendingSave();
      } catch (error) {
        console.warn("Failed to flush transparent sticky note before preview", error);
        setStatus("Error");
        return false;
      }

      setStatus("Rendering...");
      const electron = window.require("electron");
      const ipcRenderer = electron?.ipcRenderer;

      if (
        !ipcRenderer?.invoke ||
        !ipcRenderer?.on ||
        !(ipcRenderer.removeListener || ipcRenderer.off) ||
        !data.renderMarkdownIpcChannel ||
        !data.renderMarkdownResultIpcChannel
      ) {
        throw new Error("Transparent Markdown preview IPC is unavailable.");
      }

      const requestId =
        "preview-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2);
      console.debug("Sticky transparent Markdown preview requested", {
        requestId,
        filePath: data.filePath
      });

      return await new Promise((resolve) => {
        let isSettled = false;
        let timeoutId = null;
        const cleanup = (result) => {
          if (isSettled) {
            return;
          }

          isSettled = true;

          if (timeoutId !== null) {
            clearTimeout(timeoutId);
          }

          if (ipcRenderer.removeListener) {
            ipcRenderer.removeListener(data.renderMarkdownResultIpcChannel, onResult);
          } else {
            ipcRenderer.off(data.renderMarkdownResultIpcChannel, onResult);
          }

          resolve(result);
        };
        const onResult = (_event, payload) => {
          if (!payload || payload.requestId !== requestId) {
            return;
          }

          if (payload.ok === true && typeof payload.html === "string") {
            previewEl.innerHTML = payload.html;
            setPreviewMode(true);
            setStatus("Saved");
            console.debug("Sticky transparent Markdown preview received", {
              requestId,
              htmlLength: payload.html.length
            });
            cleanup(true);
            return;
          }

          console.warn(
            "Failed to render transparent Markdown preview",
            payload.error || payload
          );
          setPreviewMode(false);
          setStatus(previousStatus);
          cleanup(false);
        };

        timeoutId = setTimeout(() => {
          console.warn("Transparent Markdown preview IPC timed out", {
            requestId
          });
          setPreviewMode(false);
          setStatus(previousStatus);
          cleanup(false);
        }, 5000);

        ipcRenderer.on(data.renderMarkdownResultIpcChannel, onResult);

        try {
          void ipcRenderer.invoke(data.renderMarkdownIpcChannel, {
            requestId,
            fileKey: data.fileKey,
            filePath: data.filePath
          }).catch((error) => {
            console.warn("Failed to request transparent Markdown preview", error);
            setPreviewMode(false);
            setStatus(previousStatus);
            cleanup(false);
          });
        } catch (error) {
          console.warn("Failed to request transparent Markdown preview", error);
          setPreviewMode(false);
          setStatus(previousStatus);
          cleanup(false);
        }
      });
    } catch (error) {
      console.warn("Failed to render transparent Markdown preview", error);
      setPreviewMode(false);
      setStatus(previousStatus);
      return false;
    } finally {
      isPreviewTogglePending = false;
      previewButton.disabled = false;
    }
  }

  function scheduleAppearanceSave() {
    if (appearanceSaveTimer !== null) {
      clearTimeout(appearanceSaveTimer);
    }

    appearanceSaveTimer = setTimeout(() => {
      void saveAppearance(false);
    }, 250);
  }

  function openAppearanceOverlay() {
    applyAppearanceState();
    appearanceOverlay.classList.add("is-open");
    showNavbar();
  }

  function closeAppearanceOverlay() {
    appearanceOverlay.classList.remove("is-open");
    updateNavbarVisibility(lastPointerY);
  }

  function ensureTrailingLineEnding(value, lineEnding) {
    return /\\r\\n$|\\n$|\\r$/.test(value) ? value : value + lineEnding;
  }

  function getPreferredLineEnding(value) {
    if (value.includes("\\r\\n")) return "\\r\\n";
    if (value.includes("\\r")) return "\\r";
    return "\\n";
  }

  function startsWithLineEnding(value) {
    return value.startsWith("\\r\\n") || value.startsWith("\\n") || value.startsWith("\\r");
  }

  function restoreStickyControlsBlocks(visibleBody, hiddenBlocks) {
    if (hiddenBlocks.length === 0) return visibleBody;

    const lineEnding = getPreferredLineEnding(
      visibleBody || hiddenBlocks.join("") || "\\n"
    );
    const hiddenBody = hiddenBlocks
      .map((block) => ensureTrailingLineEnding(block, lineEnding))
      .join("");

    if (!visibleBody) return hiddenBody;
    return hiddenBody + (startsWithLineEnding(visibleBody) ? "" : lineEnding) + visibleBody;
  }

  function saveNow() {
    if (!hasPendingSave) return true;

    try {
      const fs = window.require("fs");
      const body = restoreStickyControlsBlocks(
        textarea.value,
        data.hiddenStickyControlsBlocks
      );
      const frontmatter = data.frontmatter || data.defaultFrontmatter;
      fs.writeFileSync(data.absoluteFilePath, frontmatter + body, "utf8");
      hasPendingSave = false;
      setStatus("Saved");
      return true;
    } catch (error) {
      console.error("Failed to save transparent sticky note", error);
      setStatus("Error");
      throw error;
    }
  }

  function scheduleSave() {
    hasPendingSave = true;
    setStatus("Saving...");

    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        saveNow();
      } catch {
        // saveNow already reports the error and updates the visible status.
      }
    }, saveDelay);
  }

  function flushPendingSave() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    return saveNow();
  }

  document.addEventListener("click", logNavbarClickHitTest, true);
  dragHandle?.addEventListener("pointerdown", requestTransparentDragStart);
  window.addEventListener("pointermove", requestTransparentDragMove);
  dragHandle?.addEventListener("pointerup", requestTransparentDragStop);
  dragHandle?.addEventListener("pointercancel", requestTransparentDragStop);
  window.addEventListener("pointerup", requestTransparentDragStop);
  window.addEventListener("pointercancel", requestTransparentDragStop);
  window.addEventListener("blur", requestTransparentDragStop);
  appearanceButton.addEventListener("pointerdown", stopNavbarButtonPointerEvent);
  pinButton.addEventListener("pointerdown", stopNavbarButtonPointerEvent);
  previewButton.addEventListener("pointerdown", stopNavbarButtonPointerEvent);
  closeButton.addEventListener("pointerdown", stopNavbarButtonPointerEvent);
  textarea.addEventListener("input", scheduleSave);
  document.addEventListener("mousemove", (event) => {
    updateNavbarVisibility(event.clientY);
  });
  document.addEventListener("mouseleave", () => {
    lastPointerY = Number.POSITIVE_INFINITY;
    scheduleNavbarHide();
  });
  navbar.addEventListener("mouseenter", () => {
    isNavbarPointerInside = true;
    showNavbar();
  });
  navbar.addEventListener("mouseleave", (event) => {
    isNavbarPointerInside = false;
    updateNavbarVisibility(event.clientY);
  });
  appearanceButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.debug("Sticky transparent navbar appearance button clicked.");
    openAppearanceOverlay();
  });
  pinButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleAlwaysOnTop();
  });
  previewButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void renderMarkdownPreview();
  });
  appearanceCloseButton.addEventListener("click", closeAppearanceOverlay);
  appearanceColorInput.addEventListener("input", () => {
    appearanceState.color = appearanceColorInput.value;
    applyAppearanceState({ updateInputs: false });
    scheduleAppearanceSave();
  });
  backgroundOpacityInput.addEventListener("input", () => {
    appearanceState.backgroundOpacity = backgroundOpacityInput.value;
    applyAppearanceState({ updateInputs: false });
    scheduleAppearanceSave();
  });
  textToneInput.addEventListener("input", () => {
    appearanceState.textTone = textToneInput.value;
    applyAppearanceState({ updateInputs: false });
    scheduleAppearanceSave();
  });
  useTransparentInput.addEventListener("change", () => {
    appearanceState.useTransparentWindow = useTransparentInput.checked;
    applyAppearanceState({ updateInputs: false });
  });
  appearanceApplyButton.addEventListener("click", () => {
    try {
      flushPendingSave();
    } catch {
      return;
    }
    void saveAppearance(true).then((didSave) => {
      if (didSave && appearanceState.useTransparentWindow) {
        closeAppearanceOverlay();
      }
    });
  });
  closeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.debug("Sticky transparent navbar close button clicked.");
    try {
      flushPendingSave();
      void closeCurrentTransparentWindow();
    } catch {
      // Keep the window open so the failed save can be addressed.
    }
  });
  window.addEventListener("beforeunload", flushPendingSave);
  window.stickyTransparentApi = {
    flushPendingSave,
    saveAppearance
  };
})();
</script>
</body>
</html>`;
}

function createDataUrl(html: string, key?: string): string {
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  if (!key) {
    return dataUrl;
  }

  return `${dataUrl}#sticky-popout-transparent=${encodeURIComponent(key)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const shortMatch = trimmed.match(/^#?([0-9a-fA-F]{3})$/);

  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  const longMatch = trimmed.match(/^#?([0-9a-fA-F]{6})$/);

  if (longMatch) {
    return `#${longMatch[1]}`.toUpperCase();
  }

  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);

  if (!normalized) {
    return null;
  }

  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  };
}

function isStickyNoteColor(value: string): value is StickyNoteColor {
  return Object.prototype.hasOwnProperty.call(LEGACY_STICKY_NOTE_COLORS, value);
}

function formatAlpha(value: number): string {
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function getPreferredLineEnding(value: string): string {
  if (value.includes("\r\n")) {
    return "\r\n";
  }

  if (value.includes("\r")) {
    return "\r";
  }

  return "\n";
}

function getLineBreakAt(value: string, index: number): string | null {
  if (value.startsWith("\r\n", index)) {
    return "\r\n";
  }

  if (value.startsWith("\n", index)) {
    return "\n";
  }

  if (value.startsWith("\r", index)) {
    return "\r";
  }

  return null;
}

function ensureFrontmatterBodySeparator(
  frontmatter: string,
  lineEnding: string
): string {
  if (frontmatter.endsWith(`${lineEnding}${lineEnding}`)) {
    return frontmatter;
  }

  if (frontmatter.endsWith(lineEnding)) {
    return `${frontmatter}${lineEnding}`;
  }

  return `${frontmatter}${lineEnding}${lineEnding}`;
}

function getFiniteNumber(value: unknown, fallback: number): number {
  const numberValue = toNumber(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getPositiveNumber(value: unknown, fallback: number): number {
  const numberValue = toNumber(value);
  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return Number.NaN;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `${year}-${month}-${day}-${hour}${minute}${second}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function getBasename(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? filePath;
  return fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
}
