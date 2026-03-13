import {
  Button,
  Card,
  Divider,
  makeStyles,
  Spinner,
  Text,
  tokens,
  Badge,
  Tab,
  TabList,
} from "@fluentui/react-components";
import {
  DismissRegular,
  PlugConnectedRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import type { ConfigurationItem, DependencyGraph } from "../types";
import { DependencyGraphView } from "./DependencyGraphView";

const useStyles = makeStyles({
  root: {
    width: "420px",
    minWidth: "420px",
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
  },
  detailFull: {
    gridColumn: "span 2",
  },
  label: {
    color: tokens.colorNeutralForeground3,
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  value: {
    fontWeight: tokens.fontWeightSemibold,
    wordBreak: "break-word",
  },
  graphContainer: {
    flex: 1,
    minHeight: "300px",
    display: "flex",
    flexDirection: "column",
  },
});

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "operational" || s === "1")
    return <Badge appearance="filled" color="success">Operational</Badge>;
  if (s === "non-operational" || s === "2")
    return <Badge appearance="filled" color="danger">Non-Operational</Badge>;
  if (s === "repair in progress" || s === "3")
    return <Badge appearance="filled" color="warning">Repair</Badge>;
  if (s === "retired" || s === "6")
    return <Badge appearance="filled" color="subtle">Retired</Badge>;
  return <Badge appearance="tint" color="informative">{status || "Unknown"}</Badge>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  const classes = useStyles();
  if (!value) return null;
  return (
    <div>
      <Text className={classes.label} block>{label}</Text>
      <Text className={classes.value}>{value}</Text>
    </div>
  );
}

interface Props {
  ci: ConfigurationItem | null;
  graph: DependencyGraph | null;
  graphLoading: boolean;
  canLoadGraph: boolean;
  onLoadGraph: (sysId: string) => void;
  onDismiss: () => void;
}

export function CIDetailPanel({
  ci,
  graph,
  graphLoading,
  canLoadGraph,
  onLoadGraph,
  onDismiss,
}: Props) {
  const classes = useStyles();
  const [activeTab, setActiveTab] = useState<string>("details");

  if (!ci) return null;

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Text size={500} weight="bold">
          {ci.name}
        </Text>
        <Button
          icon={<DismissRegular />}
          appearance="subtle"
          size="small"
          onClick={onDismiss}
          aria-label="Close details"
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {statusBadge(ci.operational_status)}
        <Badge appearance="outline" size="medium">
          {ci.sys_class_name || "cmdb_ci"}
        </Badge>
      </div>

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => setActiveTab(d.value as string)}
        size="small"
      >
        <Tab value="details">Details</Tab>
        <Tab value="dependencies">
          Dependencies
        </Tab>
      </TabList>

      <Divider />

      {activeTab === "details" && (
        <div className={classes.detailGrid}>
          <DetailField label="Category" value={ci.category} />
          <DetailField label="Subcategory" value={ci.subcategory} />
          <DetailField label="Environment" value={ci.environment} />
          <DetailField label="Owner" value={ci.owned_by} />
          <DetailField label="Manager" value={ci.managed_by} />
          <DetailField label="Assigned To" value={ci.assigned_to} />
          <DetailField label="Support Group" value={ci.support_group} />
          <DetailField label="IP Address" value={ci.ip_address} />
          <DetailField label="FQDN" value={ci.fqdn} />
          <DetailField label="OS" value={ci.os ? `${ci.os} ${ci.os_version}` : ""} />
          <DetailField label="Manufacturer" value={ci.manufacturer} />
          <DetailField label="Location" value={ci.location} />
          <DetailField label="Department" value={ci.department} />
          <DetailField label="Company" value={ci.company} />
          <DetailField label="Serial Number" value={ci.serial_number} />
          <DetailField label="Asset Tag" value={ci.asset_tag} />
          <div className={classes.detailFull}>
            <DetailField label="Description" value={ci.short_description} />
          </div>
          <DetailField label="Created" value={ci.sys_created_on} />
          <DetailField label="Updated" value={ci.sys_updated_on} />
        </div>
      )}

      {activeTab === "dependencies" && (
        <div className={classes.graphContainer}>
          {!graph && !graphLoading && (
            <Card size="small" style={{ padding: 24, textAlign: "center" }}>
              <PlugConnectedRegular style={{ fontSize: 36, opacity: 0.4, display: "block", margin: "0 auto 8px" }} />
              <Text block>View upstream and downstream dependencies</Text>
              <Button
                appearance="primary"
                size="small"
                style={{ marginTop: 12 }}
                onClick={() => onLoadGraph(ci.sys_id)}
                disabled={!canLoadGraph}
              >
                Load Dependencies
              </Button>
            </Card>
          )}
          {graphLoading && (
            <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
              <Spinner size="medium" label="Loading dependency graph…" />
            </div>
          )}
          {graph && !graphLoading && (
            <DependencyGraphView graph={graph} />
          )}
        </div>
      )}
    </div>
  );
}
