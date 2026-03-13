import { useCallback, useEffect, useRef, useState } from "react";
import type { ExplorerPayload, DependencyGraph, ConfigurationItem } from "../types";
import {
  callTool,
  capabilities,
  getToolResult,
  getWidgetState,
  HostUnavailableError,
  setWidgetState,
} from "../hostBridge";

export interface HostState {
  data: ExplorerPayload | null;
  selectedCi: ConfigurationItem | null;
  dependencyGraph: DependencyGraph | null;
  loading: boolean;
  graphLoading: boolean;
  error: string | null;
  canRefresh: boolean;
  searchQuery: string;
  searchField: string;
  setSearchQuery: (q: string) => void;
  setSearchField: (f: string) => void;
  selectCi: (ci: ConfigurationItem | null) => void;
  search: () => void;
  loadDependencies: (sysId: string) => void;
}

export function useHostIntegration(): HostState {
  const [data, setData] = useState<ExplorerPayload | null>(null);
  const [selectedCi, setSelectedCi] = useState<ConfigurationItem | null>(null);
  const [dependencyGraph, setDependencyGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [graphLoading, setGraphLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchField, setSearchField] = useState("name");

  const queryRef = useRef(searchQuery);
  queryRef.current = searchQuery;
  const fieldRef = useRef(searchField);
  fieldRef.current = searchField;

  useEffect(() => {
    const hostResult = getToolResult();
    if (hostResult) {
      setData(hostResult);
      setSearchQuery(hostResult.query || "");
      setSearchField(hostResult.field || "name");
    }

    const saved = getWidgetState();
    if (saved) {
      if (saved.searchQuery) setSearchQuery(saved.searchQuery);
      if (saved.searchField) setSearchField(saved.searchField);
    }
  }, []);

  const selectCi = useCallback((ci: ConfigurationItem | null) => {
    setSelectedCi(ci);
    setDependencyGraph(null);
    setWidgetState({
      selectedCiId: ci?.sys_id ?? null,
      searchQuery: queryRef.current,
      searchField: fieldRef.current,
    });
  }, []);

  const search = useCallback(() => {
    if (!capabilities.callTool) {
      setError("Host does not support calling tools. Rerun show_ci_explorer in chat.");
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedCi(null);
    setDependencyGraph(null);

    callTool("show_ci_explorer", {
      query: queryRef.current,
      field: fieldRef.current,
      limit: 25,
    })
      .then((result) => {
        if (result && typeof result === "object") {
          const obj = result as Record<string, unknown>;
          // Extract from structuredContent or direct
          const payload =
            "structuredContent" in obj
              ? (obj.structuredContent as ExplorerPayload)
              : "items" in obj
              ? (obj as unknown as ExplorerPayload)
              : null;
          if (payload) {
            setData(payload);
          } else {
            setError("Unexpected response format.");
          }
        }
      })
      .catch((err: unknown) => {
        if (err instanceof HostUnavailableError) setError(err.message);
        else setError(err instanceof Error ? err.message : "Search failed.");
      })
      .finally(() => setLoading(false));
  }, []);

  const loadDependencies = useCallback((sysId: string) => {
    if (!capabilities.callTool) return;

    setGraphLoading(true);
    callTool("get_ci_dependencies", { sys_id: sysId, depth: 2 })
      .then((result) => {
        if (result && typeof result === "object") {
          const obj = result as Record<string, unknown>;
          // The tool returns a JSON string via content, and structuredContent
          // Try parsing it
          if ("root" in obj) {
            setDependencyGraph(obj as unknown as DependencyGraph);
          } else if ("content" in obj && Array.isArray(obj.content)) {
            const textItem = (obj.content as Array<Record<string, unknown>>).find(
              (c) => c.type === "text"
            );
            if (textItem && typeof textItem.text === "string") {
              setDependencyGraph(JSON.parse(textItem.text) as DependencyGraph);
            }
          }
        }
      })
      .catch(() => {
        // Graph loading is best-effort
      })
      .finally(() => setGraphLoading(false));
  }, []);

  return {
    data,
    selectedCi,
    dependencyGraph,
    loading,
    graphLoading,
    error,
    canRefresh: capabilities.callTool,
    searchQuery,
    searchField,
    setSearchQuery,
    setSearchField,
    selectCi,
    search,
    loadDependencies,
  };
}
