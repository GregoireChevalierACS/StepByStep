import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { readStepCounter } from './infrastructure/readStepCounter';
import { checkHealth } from './infrastructure/stepByStepApi';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const [output, setOutput] = useState('Aucune action pour l’instant.');

  async function onReadStepCounter() {
    setOutput('Lecture du capteur…');
    try {
      const reading = await readStepCounter();
      setOutput(
        reading.ok
          ? `Pas depuis le démarrage : ${String(reading.value.stepsSinceBoot.value)}\n` +
              `Démarrage n° ${String(reading.value.bootCount)}\n` +
              `Relevé à ${new Date(reading.value.takenAt).toISOString()}`
          : `Relevé refusé : ${JSON.stringify(reading.error)}`,
      );
    } catch (error) {
      setOutput(`Erreur du capteur : ${describe(error)}`);
    }
  }

  async function onCheckHealth() {
    setOutput('Appel de GET /v1/health…');
    try {
      const response = await checkHealth();
      setOutput(`HTTP ${String(response.status)}\n${JSON.stringify(response.body, null, 2)}`);
    } catch (error) {
      setOutput(`API injoignable : ${describe(error)}`);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>StepByStep</Text>
      <View style={styles.actions}>
        <Button title="Lire le compteur de pas" onPress={() => void onReadStepCounter()} />
        <Button title="Tester la connexion à l’API" onPress={() => void onCheckHealth()} />
      </View>
      <ScrollView style={styles.output}>
        <Text selectable>{output}</Text>
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, paddingTop: 64, gap: 24 },
  title: { fontSize: 28, fontWeight: 'bold' },
  actions: { gap: 12 },
  output: { flex: 1, backgroundColor: '#f2f4f7', borderRadius: 8, padding: 12 },
});
