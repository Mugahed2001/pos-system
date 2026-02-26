import { useEffect } from "react";
import { Platform } from "react-native";

export function useHotkeys(key: string, callback: () => void) {
  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === key.toLowerCase()) {
        callback();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, callback]);
}
