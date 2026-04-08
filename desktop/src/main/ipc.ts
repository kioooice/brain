import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type { DesktopStore } from "./store";

export function registerIpc(store: DesktopStore) {
  ipcMain.handle(IPC_CHANNELS.bootstrap, () => store.getWorkbenchSnapshot());
  ipcMain.handle(IPC_CHANNELS.captureTextOrLink, (_event, input: string) => store.captureTextOrLink(input));
  ipcMain.handle(IPC_CHANNELS.enrichLinkTitle, async (_event, itemId: number, url: string) => {
    try {
      const response = await fetch(url);
      const html = await response.text();
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (!match) return null;
      const title = match[1].replace(/\s+/g, " ").trim();
      return title ? store.updateLinkTitle(itemId, title) : null;
    } catch {
      return null;
    }
  });
}
