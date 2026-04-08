import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./shared/ipc";
import type { WorkbenchSnapshot } from "./shared/types";

contextBridge.exposeInMainWorld("brainDesktop", {
  bootstrap(): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.bootstrap);
  },
  captureTextOrLink(input: string): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureTextOrLink, input);
  },
  captureDroppedPaths(paths: string[]): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureDroppedPaths, paths);
  },
  enrichLinkTitle(itemId: number, url: string): Promise<WorkbenchSnapshot | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.enrichLinkTitle, itemId, url);
  },
});
