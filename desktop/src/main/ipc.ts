import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type { DesktopStore } from "./store";

export function registerIpc(store: DesktopStore) {
  ipcMain.handle(IPC_CHANNELS.bootstrap, () => store.getWorkbenchSnapshot());
}
