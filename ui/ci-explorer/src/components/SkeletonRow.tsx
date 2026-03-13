import { Card, makeStyles, SkeletonItem } from "@fluentui/react-components";

const useStyles = makeStyles({
  card: {
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  row: {
    display: "flex",
    gap: "12px",
  },
});

export function SkeletonRow() {
  const classes = useStyles();
  return (
    <Card size="small" className={classes.card}>
      <div className={classes.row}>
        <SkeletonItem shape="rectangle" size={16} style={{ width: 120 }} />
        <SkeletonItem shape="rectangle" size={16} style={{ width: 80 }} />
        <SkeletonItem shape="rectangle" size={16} style={{ width: 80 }} />
        <SkeletonItem shape="rectangle" size={16} style={{ width: 60 }} />
        <SkeletonItem shape="rectangle" size={16} style={{ width: 80 }} />
        <SkeletonItem shape="rectangle" size={16} style={{ width: 100 }} />
      </div>
    </Card>
  );
}
