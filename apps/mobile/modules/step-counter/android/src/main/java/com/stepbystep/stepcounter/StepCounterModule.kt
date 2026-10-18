package com.stepbystep.stepcounter

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener2
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Humble Object : lit le capteur matériel TYPE_STEP_COUNTER (pas cumulés depuis le démarrage)
 * et le numéro de démarrage Android, sans aucune logique métier. La validation et les calculs
 * sont faits en TypeScript par @stepbystep/domain.
 */
class StepCounterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StepCounter")

    AsyncFunction("readAsync") { promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      if (sensor == null) {
        promise.reject("ERR_NO_STEP_COUNTER", "Ce téléphone n'a pas de capteur TYPE_STEP_COUNTER", null)
        return@AsyncFunction
      }
      // -1 si la valeur est absente : le domaine refusera le relevé (InvalidBootCount).
      val bootCount = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)

      // Le compteur est tenu par une puce basse consommation (sensor hub) qui transmet les pas
      // par paquets (batching). À l'abonnement, Android renvoie la DERNIÈRE valeur qu'il a reçue,
      // qui peut dater de plusieurs minutes. On demande donc à la puce de vider sa mémoire
      // (flush) et on ne répond qu'à onFlushCompleted, avec la valeur la plus récente reçue.
      // Tout se passe sur le même Looper : événements, fin du flush et délai sont traités l'un
      // après l'autre, sans concurrence.
      val handler = Handler(Looper.getMainLooper())
      var settled = false
      var latest: Int? = null
      var flushPending = true

      lateinit var listener: SensorEventListener2
      fun settle(steps: Int) {
        if (settled) return
        settled = true
        sensorManager.unregisterListener(listener)
        handler.removeCallbacksAndMessages(null)
        promise.resolve(mapOf("stepsSinceBoot" to steps, "bootCount" to bootCount))
      }

      listener = object : SensorEventListener2 {
        override fun onSensorChanged(event: SensorEvent) {
          val steps = event.values[0].toInt()
          latest = steps
          if (!flushPending) settle(steps)
        }

        override fun onFlushCompleted(sensor: Sensor) {
          flushPending = false
          // Rien reçu avant la fin du flush : on répondra au premier événement.
          latest?.let(::settle)
        }

        override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
      }

      handler.post {
        sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, handler)
        // false : flush non pris en charge (capteur sans batching) → la première valeur suffit.
        if (!sensorManager.flush(listener)) {
          flushPending = false
          latest?.let(::settle)
        }
      }

      // Sans la permission ACTIVITY_RECOGNITION, le capteur ne signale rien : on ne laisse pas
      // la promesse en attente pour toujours. Si une valeur est arrivée mais pas la fin du flush,
      // elle vaut mieux qu'une erreur.
      handler.postDelayed({
        if (settled) return@postDelayed
        latest?.let(::settle) ?: run {
          settled = true
          sensorManager.unregisterListener(listener)
          promise.reject("ERR_STEP_COUNTER_TIMEOUT", "Aucune valeur du capteur de pas en $TIMEOUT_MS ms", null)
        }
      }, TIMEOUT_MS)
    }
  }

  private companion object {
    const val TIMEOUT_MS = 5_000L
  }
}
