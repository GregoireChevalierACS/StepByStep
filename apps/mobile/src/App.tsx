import type { StepCounterReading } from '@stepbystep/domain';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ReadingSync, type ApiResponse } from './application/ReadingSync';
import { readStepCounter } from './infrastructure/readStepCounter';
import { checkHealth, registerDevice, sendReadings } from './infrastructure/stepByStepApi';
import { describeResponse } from './presentation/describeResponse';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatReading(reading: StepCounterReading): string {
  return (
    `Pas depuis le démarrage : ${String(reading.stepsSinceBoot.value)}\n` +
    `Démarrage n° ${String(reading.bootCount)}\n` +
    `Relevé à ${new Date(reading.takenAt).toISOString()}`
  );
}

function formatResponse(response: ApiResponse): string {
  return `HTTP ${String(response.status)}\n${JSON.stringify(response.body, null, 2)}`;
}

export function App() {
  const [output, setOutput] = useState('Aucune action pour l’instant.');
  const [lastReading, setLastReading] = useState<StepCounterReading>();
  // Composition root : une seule instance pour la durée de vie de l'écran (l'initialiseur
  // paresseux de useState n'est appelé qu'au premier rendu).
  const [sync] = useState(
    () =>
      new ReadingSync({
        registerDevice,
        sendReadings,
        currentTimeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
  );

  async function send(reading: StepCounterReading) {
    setOutput(`${formatReading(reading)}\n\nEnvoi…`);
    try {
      const response = await sync.send(reading);
      setOutput(`${formatReading(reading)}\n\n${describeResponse(response)}`);
    } catch (error) {
      setOutput(`${formatReading(reading)}\n\nEnvoi impossible : ${describe(error)}`);
    }
  }

  async function onSendReading() {
    setOutput('Lecture du capteur…');
    let reading;
    try {
      reading = await readStepCounter();
    } catch (error) {
      setOutput(`Erreur du capteur : ${describe(error)}`);
      return;
    }
    if (!reading.ok) {
      setOutput(`Relevé refusé par le domaine : ${JSON.stringify(reading.error)}`);
      return;
    }
    setLastReading(reading.value);
    await send(reading.value);
  }

  async function onCheckHealth() {
    setOutput('Appel de GET /v1/health…');
    try {
      setOutput(formatResponse(await checkHealth()));
    } catch (error) {
      setOutput(`API injoignable : ${describe(error)}`);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>StepByStep</Text>
      <View style={styles.actions}>
        <Button title="Envoyer un relevé" onPress={() => void onSendReading()} />
        <Button
          title="Renvoyer le même relevé"
          disabled={lastReading === undefined}
          onPress={() => {
            if (lastReading !== undefined) void send(lastReading);
          }}
        />
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
