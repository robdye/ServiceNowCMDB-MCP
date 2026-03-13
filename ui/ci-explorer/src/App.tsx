import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
  makeStyles,
  Text,
  tokens,
  Badge,
  Card,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  DatabaseRegular,
} from "@fluentui/react-icons";
import { SearchBar } from "./components/SearchBar";
import { CITable } from "./components/CITable";
import { CIDetailPanel } from "./components/CIDetailPanel";
import { SkeletonRow } from "./components/SkeletonRow";
import { useHostIntegration } from "./hooks/useHostIntegration";

const useStyles = makeStyles({
  page: {
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    fontFamily: tokens.fontFamilyBase,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "16px",
  },
  titleIcon: {
    fontSize: "24px",
    color: tokens.colorBrandForeground1,
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "10px",
    marginBottom: "16px",
  },
  kpiCard: {
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  kpiLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  kpiValue: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightBold,
  },
  body: {
    display: "flex",
    flex: 1,
    gap: "0",
    overflow: "hidden",
    minHeight: "400px",
  },
  tableArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: "12px",
    padding: "48px",
    textAlign: "center",
  },
  skeletons: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "8px 0",
  },
});

export default function App() {
  const classes = useStyles();
  const {
    data,
    selectedCi,
    dependencyGraph,
    loading,
    graphLoading,
    error,
    canRefresh,
    searchQuery,
    searchField,
    setSearchQuery,
    setSearchField,
    selectCi,
    search,
    loadDependencies,
  } = useHostIntegration();

  const hostTheme =
    typeof window !== "undefined" && (window as unknown as Record<string, unknown>).openai
      ? ((window as unknown as Record<string, unknown>).openai as Record<string, unknown>)?.theme
      : undefined;
  const theme = hostTheme === "light" ? webLightTheme : webDarkTheme;

  const items = data?.items ?? [];

  // Compute KPIs
  const totalCIs = items.length;
  const operational = items.filter(
    (ci) => ci.operational_status === "Operational" || ci.operational_status === "1"
  ).length;
  const classBreakdown = items.reduce<Record<string, number>>((acc, ci) => {
    const cls = ci.sys_class_name || "Other";
    acc[cls] = (acc[cls] || 0) + 1;
    return acc;
  }, {});
  const topClass =
    Object.entries(classBreakdown).sort((a, b) => b[1] - a[1])[0];

  return (
    <FluentProvider theme={theme}>
      <div className={classes.page}>
        {/* Header */}
        <div className={classes.header}>
          <DatabaseRegular className={classes.titleIcon} />
          <Text as="h1" size={500} weight="semibold">
            CMDB Configuration Item Explorer
          </Text>
          {data && (
            <Badge appearance="tint" color="informative" size="medium">
              {totalCIs} CI{totalCIs !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Search */}
        <SearchBar
          query={searchQuery}
          field={searchField}
          loading={loading}
          canSearch={canRefresh}
          onQueryChange={setSearchQuery}
          onFieldChange={setSearchField}
          onSearch={search}
        />

        {/* Error */}
        {error && (
          <MessageBar intent="error" style={{ marginBottom: 12 }}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {/* Empty state */}
        {!data && !loading && (
          <div className={classes.empty}>
            <DatabaseRegular style={{ fontSize: 48, opacity: 0.3 }} />
            <Text size={400} italic>
              Waiting for CMDB data…
            </Text>
            <Text size={200}>
              Ask Copilot to show CI explorer, or search above.
            </Text>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && !data && (
          <div className={classes.skeletons}>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {/* Main content */}
        {data && (
          <>
            {/* KPI row */}
            <div className={classes.kpiRow}>
              <Card size="small" className={classes.kpiCard}>
                <Text className={classes.kpiLabel}>Total CIs</Text>
                <Text className={classes.kpiValue}>{totalCIs}</Text>
              </Card>
              <Card size="small" className={classes.kpiCard}>
                <Text className={classes.kpiLabel}>Operational</Text>
                <Text className={classes.kpiValue} style={{ color: tokens.colorPaletteGreenForeground1 }}>
                  {operational}
                </Text>
              </Card>
              {topClass && (
                <Card size="small" className={classes.kpiCard}>
                  <Text className={classes.kpiLabel}>Top Class</Text>
                  <Text className={classes.kpiValue}>
                    {topClass[0]}{" "}
                    <span style={{ fontSize: "0.75em", opacity: 0.7 }}>
                      ({topClass[1]})
                    </span>
                  </Text>
                </Card>
              )}
              {data.query && (
                <Card size="small" className={classes.kpiCard}>
                  <Text className={classes.kpiLabel}>Search</Text>
                  <Text className={classes.kpiValue} style={{ fontSize: tokens.fontSizeBase300 }}>
                    "{data.query}" in {data.field}
                  </Text>
                </Card>
              )}
            </div>

            {/* Table + Detail Panel */}
            <div className={classes.body}>
              <div className={classes.tableArea}>
                <CITable
                  items={items}
                  selectedId={selectedCi?.sys_id ?? null}
                  onSelect={selectCi}
                />
              </div>
              <CIDetailPanel
                ci={selectedCi}
                graph={dependencyGraph}
                graphLoading={graphLoading}
                canLoadGraph={canRefresh}
                onLoadGraph={loadDependencies}
                onDismiss={() => selectCi(null)}
              />
            </div>
          </>
        )}
      </div>
    </FluentProvider>
  );
}
