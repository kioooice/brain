import type { WorkbenchSnapshot } from "./shared/types";

declare global {
  interface Window {
    brainDesktop: {
      bootstrap(): Promise<WorkbenchSnapshot>;
    };
  }
}

export {};
