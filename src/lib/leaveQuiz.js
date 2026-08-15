import { Alert, Platform } from "react-native";

export function confirmLeaveQuiz(onLeave) {
  const title = "Leave this quiz?";
  const msg = "Progress on this round will be lost.";
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && window.confirm(`${title}\n${msg}`)) onLeave();
    } catch (e) {
      onLeave();
    }
    return;
  }
  Alert.alert(title, msg, [
    { text: "Stay", style: "cancel" },
    { text: "Leave", style: "destructive", onPress: onLeave },
  ]);
}
