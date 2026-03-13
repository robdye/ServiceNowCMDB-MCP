/** A Configuration Item from the CMDB. */
export interface ConfigurationItem {
  sys_id: string;
  name: string;
  sys_class_name: string;
  category: string;
  subcategory: string;
  operational_status: string;
  install_status: string;
  environment: string;
  assigned_to: string;
  owned_by: string;
  managed_by: string;
  support_group: string;
  ip_address: string;
  fqdn: string;
  os: string;
  os_version: string;
  manufacturer: string;
  model_id: string;
  serial_number: string;
  asset_tag: string;
  location: string;
  department: string;
  company: string;
  short_description: string;
  comments: string;
  sys_updated_on: string;
  sys_created_on: string;
}

/** A relationship edge in the dependency graph. */
export interface RelationshipEdge {
  from: string;
  to: string;
  type: string;
}

/** A node in the dependency graph (minimal CI info). */
export interface GraphNode {
  sys_id: string;
  name: string;
  sys_class_name?: string;
  operational_status?: string;
}

/** The dependency graph returned by get_ci_dependencies. */
export interface DependencyGraph {
  root: GraphNode;
  upstream: {
    nodes: Record<string, GraphNode>;
    edges: RelationshipEdge[];
  };
  downstream: {
    nodes: Record<string, GraphNode>;
    edges: RelationshipEdge[];
  };
}

/** The structuredContent from show_ci_explorer. */
export interface ExplorerPayload {
  items: ConfigurationItem[];
  query: string;
  field: string;
}

/** Widget state persisted via the host. */
export interface WidgetState {
  selectedCiId: string | null;
  searchQuery: string;
  searchField: string;
}
