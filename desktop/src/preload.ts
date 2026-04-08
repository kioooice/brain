import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./shared/ipc";
import type { WorkbenchSnapshot } from "./shared/types";

contextBridge.exposeInMainWorld("brainDesktop", {
  bootstrap(): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.bootstrap);
  },
});
