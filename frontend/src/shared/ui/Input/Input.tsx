import { StyleSheet, TextInput, type TextInputProps } from "react-native";

export function Input(props: TextInputProps) {
  return <TextInput style={[styles.input, props.style]} placeholderTextColor="#6B7280" {...props} />;
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    color: "#1F2937",
    paddingHorizontal: 14,
    textAlign: "right",
  },
});
