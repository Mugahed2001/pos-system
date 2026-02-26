import { useCallback, useEffect } from "react";
import { Modal as NativeModal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function blurActiveElementOnWeb() {
  if (Platform.OS !== "web") {
    return;
  }
  const active = document.activeElement as HTMLElement | null;
  if (active && typeof active.blur === "function") {
    active.blur();
  }
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) {
      blurActiveElementOnWeb();
    }
  }, [open]);

  const handleClose = useCallback(() => {
    blurActiveElementOnWeb();
    onClose();
  }, [onClose]);

  return (
    <NativeModal visible={open} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {children}
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </NativeModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(13, 21, 39, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  box: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: "#f4f7fd",
    borderWidth: 1,
    borderColor: "#ccd6ea",
    padding: 18,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "right",
    color: "#203356",
  },
  closeButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: "#d9e3f7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: {
    color: "#33496f",
    fontWeight: "700",
  },
});
