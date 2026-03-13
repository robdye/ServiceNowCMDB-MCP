import {
  makeStyles,
  Input,
  Select,
  Button,
  tokens,
} from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  root: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "16px",
    flexWrap: "wrap",
  },
  input: {
    flex: 1,
    minWidth: "200px",
  },
  select: {
    minWidth: "160px",
  },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    width: "100%",
    marginTop: "4px",
  },
});

interface Props {
  query: string;
  field: string;
  loading: boolean;
  canSearch: boolean;
  onQueryChange: (q: string) => void;
  onFieldChange: (f: string) => void;
  onSearch: () => void;
}

export function SearchBar({
  query,
  field,
  loading,
  canSearch,
  onQueryChange,
  onFieldChange,
  onSearch,
}: Props) {
  const classes = useStyles();

  return (
    <div className={classes.root}>
      <Input
        className={classes.input}
        placeholder="Search configuration items…"
        value={query}
        onChange={(_, data) => onQueryChange(data.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSearch) onSearch();
        }}
        contentBefore={<SearchRegular />}
        disabled={loading}
      />
      <Select
        className={classes.select}
        value={field}
        onChange={(_, data) => onFieldChange(data.value)}
        disabled={loading}
      >
        <option value="name">Name</option>
        <option value="owned_by">Owner</option>
        <option value="managed_by">Manager</option>
        <option value="support_group">Support Group</option>
        <option value="sys_class_name">CI Class</option>
        <option value="category">Category</option>
        <option value="ip_address">IP Address</option>
        <option value="fqdn">FQDN</option>
      </Select>
      <Button
        appearance="primary"
        icon={<SearchRegular />}
        onClick={onSearch}
        disabled={loading || !canSearch}
      >
        {loading ? "Searching…" : "Search"}
      </Button>
    </div>
  );
}
