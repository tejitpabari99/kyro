import { StyleSheet, Text, View } from 'react-native';

// Placeholder home screen for M0-01 (repo scaffold). The real (tabs) shell
// (workout/history/exercises/profile) lands in M0-08 per
// docs/plan/06-architecture.md §3.
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kyro</Text>
      <Text style={styles.subtitle}>Scaffold OK — tabs shell lands in M0-08.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
});
