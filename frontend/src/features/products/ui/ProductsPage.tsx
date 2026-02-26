import { View } from "react-native";
import { ProductForm } from "./components/ProductForm";
import { ProductTable } from "./components/ProductTable";

export function ProductsPage() {
  return (
    <View style={{ gap: 10 }}>
      <ProductForm />
      <ProductTable />
    </View>
  );
}
