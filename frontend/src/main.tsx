import { AppProviders } from "./app/providers/AppProviders";
import { AppRoutes } from "./app/router/routes";

export default function Main() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}
