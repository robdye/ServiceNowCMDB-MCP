/**
 * hostBridge.ts — host/SDK interactions for the CI Explorer widget.
 *
 * Mirrors the pattern from AlphaAnalyzerMCP, guarding all
 * window.openai access so the widget works standalone and inside
 * MCP Apps hosts.
 */

import type { ExplorerPayload, WidgetState } from "./types";

interface OpenAIAppsSDK {
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  getToolInput?: () => unknown;
  getToolOutput?: () => unknown;
  setWidgetState?: (state: Record<string, unknown>) => void;
  getWidgetState?: () => unknown;
}

declare global {
  interface Window {
    openai?: OpenAIAppsSDK;
  }
}

function sdkPresent(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.openai !== "undefined" &&
    window.openai !== null
  );
}

export const capabilities = Object.freeze({
  get callTool(): boolean {
    return sdkPresent() && typeof window.openai!.callTool === "function";
  },
  get toolInput(): boolean {
    return sdkPresent() && typeof window.openai!.getToolInput === "function";
  },
  get toolResult(): boolean {
    return sdkPresent() && typeof window.openai!.getToolOutput === "function";
  },
  get widgetState(): boolean {
    return (
      sdkPresent() &&
      typeof window.openai!.setWidgetState === "function" &&
      typeof window.openai!.getWidgetState === "function"
    );
  },
  get connected(): boolean {
    return sdkPresent();
  },
});

export function getToolInput(): Record<string, unknown> | null {
  if (!capabilities.toolInput) return null;
  try {
    const raw = window.openai!.getToolInput!();
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  } catch (err) {
    console.warn("[hostBridge] getToolInput failed:", err);
  }
  return null;
}

export function getToolResult(): ExplorerPayload | null {
  if (!capabilities.toolResult) return null;
  try {
    const raw = window.openai!.getToolOutput!();
    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (
        "structuredContent" in obj &&
        obj.structuredContent &&
        typeof obj.structuredContent === "object"
      ) {
        const sc = obj.structuredContent as Record<string, unknown>;
        if ("items" in sc) return sc as unknown as ExplorerPayload;
      }
      if ("items" in obj) return obj as unknown as ExplorerPayload;
    }
  } catch (err) {
    console.warn("[hostBridge] getToolResult failed:", err);
  }
  return null;
}

export class HostUnavailableError extends Error {
  constructor() {
    super(
      "The host does not support calling tools from the widget. " +
        "Please rerun the show_ci_explorer command in chat."
    );
    this.name = "HostUnavailableError";
  }
}

export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (!capabilities.callTool) throw new HostUnavailableError();
  return window.openai!.callTool!(name, args);
}

export function setWidgetState(state: WidgetState): void {
  if (!capabilities.widgetState) return;
  try {
    window.openai!.setWidgetState!(state as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn("[hostBridge] setWidgetState failed:", err);
  }
}

export function getWidgetState(): WidgetState | null {
  if (!capabilities.widgetState) return null;
  try {
    const raw = window.openai!.getWidgetState!();
    if (raw && typeof raw === "object") return raw as WidgetState;
  } catch (err) {
    console.warn("[hostBridge] getWidgetState failed:", err);
  }
  return null;
}
