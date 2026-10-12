package com.stepbystep.stepcounter

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

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

      // Le capteur envoie sa valeur courante dès l'abonnement : on garde la première et on se
      // désabonne. Le drapeau évite de répondre deux fois si un second événement arrive avant.
      val settled = AtomicBoolean(false)
      val handler = Handler(Looper.getMainLooper())
      val listener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
          if (!settled.compareAndSet(false, true)) return
          sensorManager.unregisterListener(this)
          handler.removeCallbacksAndMessages(null)
          promise.resolve(mapOf("stepsSinceBoot" to event.values[0].toInt(), "bootCount" to bootCount))
        }

        override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit
      }
      sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, handler)

      // Sans la permission ACTIVITY_RECOGNITION, le capteur ne signale rien : on ne laisse pas
      // la promesse en attente pour toujours.
      handler.postDelayed({
        if (settled.compareAndSet(false, true)) {
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
