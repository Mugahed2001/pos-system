import { StyleSheet, Text, View } from "react-native";

interface TableProps {
  headers: string[];
  rows: string[][];
  emptyLabel?: string;
}

export function Table({ headers, rows, emptyLabel = "No rows" }: TableProps) {
  return (
    <View style={styles.table}>
      <View style={styles.row}>
        {headers.map((header) => (
          <Text key={header} style={[styles.cell, styles.headCell]}>
            {header}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        rows.map((row, index) => (
          <View key={`${row.join("-")}-${index}`} style={styles.row}>
            {row.map((cell, cellIndex) => (
              <Text key={`${index}-${cellIndex}`} style={styles.cell}>
                {cell}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  row: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  cell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    textAlign: "right",
    color: "#1F2937",
  },
  headCell: {
    fontWeight: "900",
    backgroundColor: "#F9FAFB",
  },
  empty: {
    padding: 12,
    textAlign: "center",
    color: "#6B7280",
  },
});
