import type { ReactNode } from "react";

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  numeric?: boolean;
  render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  caption?: ReactNode;
  columns: ReadonlyArray<TableColumn<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row, index: number) => string;
  className?: string;
}

/** Semantic data table (thead/tbody, scope="col"). Numeric cells use tabular figures. */
export function Table<Row>({ caption, columns, rows, rowKey, className }: TableProps<Row>) {
  return (
    <div className={["bf-table-wrap", className].filter(Boolean).join(" ")}>
      <table className="bf-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" data-numeric={col.numeric ? "true" : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)}>
              {columns.map((col) => (
                <td key={col.key} data-numeric={col.numeric ? "true" : undefined}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
