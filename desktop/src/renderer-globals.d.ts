import type { WorkbenchSnapshot } from "./shared/types";

declare global {
  interface Window {
    brainDesktop: {
      bootstrap(): Promise<WorkbenchSnapshot>;
      captureTextOrLink(input: string): Promise<WorkbenchSnapshot>;
      enrichLinkTitle(itemId: number, url: string): Promise<WorkbenchSnapshot | null>;
    };
  }
}

export {};
