import {
  makeStyles,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Badge,
  tokens,
} from "@fluentui/react-components";
import type { ConfigurationItem } from "../types";

const useStyles = makeStyles({
  container: {
    overflowY: "auto",
    flex: 1,
  },
  clickable: {
    cursor: "pointer",
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  name: {
    fontWeight: tokens.fontWeightSemibold,
  },
  empty: {
    textAlign: "center",
    padding: "48px",
    color: tokens.colorNeutralForeground3,
  },
});

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "operational" || s === "1")
    return <Badge appearance="filled" color="success" size="small">Operational</Badge>;
  if (s === "non-operational" || s === "2")
    return <Badge appearance="filled" color="danger" size="small">Non-Operational</Badge>;
  if (s === "repair in progress" || s === "3")
    return <Badge appearance="filled" color="warning" size="small">Repair</Badge>;
  if (s === "retired" || s === "6")
    return <Badge appearance="filled" color="subtle" size="small">Retired</Badge>;
  return <Badge appearance="tint" color="informative" size="small">{status || "—"}</Badge>;
}

interface Props {
  items: ConfigurationItem[];
  selectedId: string | null;
  onSelect: (ci: ConfigurationItem) => void;
}

export function CITable({ items, selectedId, onSelect }: Props) {
  const classes = useStyles();

  if (items.length === 0) {
    return (
      <div className={classes.empty}>
        <Text italic>No configuration items found.</Text>
      </div>
    );
  }

  return (
    <div className={classes.container}>
      <Table aria-label="Configuration Items" size="small">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell>Class</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Environment</TableHeaderCell>
            <TableHeaderCell>Owner</TableHeaderCell>
            <TableHeaderCell>Support Group</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((ci) => (
            <TableRow
              key={ci.sys_id}
              className={classes.clickable}
              onClick={() => onSelect(ci)}
              aria-selected={ci.sys_id === selectedId}
              appearance={ci.sys_id === selectedId ? "brand" : "none"}
            >
              <TableCell>
                <Text className={classes.name}>{ci.name || "—"}</Text>
              </TableCell>
              <TableCell>{ci.sys_class_name || "—"}</TableCell>
              <TableCell>{statusBadge(ci.operational_status)}</TableCell>
              <TableCell>{ci.environment || "—"}</TableCell>
              <TableCell>{ci.owned_by || "—"}</TableCell>
              <TableCell>{ci.support_group || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
