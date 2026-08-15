import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C, FONT } from "../theme";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err) {
    console.error("CogniMath render error", err);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <View style={styles.wrap} accessibilityRole="alert">
        <Text style={styles.ico}>📘</Text>
        <Text style={styles.title}>That page hit a snag</Text>
        <Text style={styles.body}>Finished quizzes are saved. This page had a problem — try again.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => this.setState({ err: null })}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.btnTxt}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: C.panel, gap: 10 },
  ico: { fontSize: 42, marginBottom: 6 },
  title: { fontFamily: FONT.headBold, fontSize: 22, color: C.ink, textAlign: "center" },
  body: { fontFamily: FONT.body, fontSize: 15, color: C.muted, textAlign: "center", lineHeight: 22, maxWidth: 320 },
  btn: { marginTop: 12, backgroundColor: C.gold, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 12 },
  btnTxt: { fontFamily: FONT.headBold, fontSize: 16, color: C.darkInk },
});
