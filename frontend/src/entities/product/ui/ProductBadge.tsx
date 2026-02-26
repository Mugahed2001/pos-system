import { StyleSheet, Text, View } from "react-native";

export function ProductBadge({ name }: { name: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#e6edfb",
    borderWidth: 1,
    borderColor: "#c7d3ec",
    alignSelf: "flex-start",
  },
  text: {
    color: "#2e436c",
    fontWeight: "700",
  },
});
