import { Alert, Platform } from "react-native";

/** Cross-platform confirm for destructive actions (Alert has no buttons on web). */
export function confirmAction(message: string, confirmLabel: string, cancelLabel: string, onConfirm: () => void, destructive = true) {
  if (Platform.OS === "web") {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert(message, undefined, [
    { text: cancelLabel, style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}

export function notify(title: string, message?: string) {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
