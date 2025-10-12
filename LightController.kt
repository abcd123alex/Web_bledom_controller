package com.yourpackage.lightcontroller

import java.util.Calendar

/**
 * Contains pre-programmed pattern names for LED light control.
 */
class PatternData {
    val pattern: List<String> = listOf(
        "Static Red",
        "Static Blue",
        "Static Green",
        "Static Cyan",
        "Static Yellow",
        "Static Purple",
        "Static White",
        "Three Color Jumping Change",
        "Seven Color Jumping Change",
        "Three Color Cross Fade",
        "Seven Color Cross Fade",
        "Red Gradual Change",
        "Green Gradual Change",
        "Blue Gradual Change",
        "Yellow Gradual Change",
        "Cyan Gradual Change",
        "Purple Gradual Change",
        "White Gradual Change",
        "Red Green Cross Fade",
        "Red Blue Cross Fade",
        "Green Blue Cross Fade",
        "Seven color Strobe Flash",
        "Red Strobe Flash",
        "Green Strobe Flash",
        "Blue Strobe Flash",
        "Yellow Strobe Flash",
        "Cyan Strobe Flash",
        "Purple Strobe Flash",
        "White Strobe Flash"
    )
}

/**
 * Provides utilities for creating LED controller command byte arrays.
 */
class CommandUtils {

    /** Powers lights on/off. */
    fun createOnOffCommand(isOn: Boolean): ByteArray = byteArrayOf(
        0x7E,
        0x04,
        0x04,
        if (isOn) 1 else 0,
        0x00,
        if (isOn) 1 else 0,
        0xFF.toByte(),
        0x00,
        0xEF.toByte()
    )

    /** Sets RGB color. */
    fun createColorCommand(redValue: Int, greenValue: Int, blueValue: Int): ByteArray = byteArrayOf(
        0x7E,
        0x07,
        0x05,
        0x03,
        redValue.toByte(),
        greenValue.toByte(),
        blueValue.toByte(),
        0x10,
        0xEF.toByte()
    )

    /** Selects a pattern from 0..28. */
    fun createPatternCommand(pattern: Int): ByteArray = byteArrayOf(
        0x7E,
        0x05,
        0x03,
        (pattern.coerceIn(0..28) + 128).toByte(),
        0x03,
        0xFF.toByte(),
        0xFF.toByte(),
        0x00,
        0xEF.toByte()
    )

    /** Sets pattern speed (0–100). */
    fun createSpeedCommand(speed: Int): ByteArray = byteArrayOf(
        0x7E,
        0x04,
        0x02,
        speed.coerceIn(0..100).toByte(),
        0xFF.toByte(),
        0xFF.toByte(),
        0xFF.toByte(),
        0x00,
        0xEF.toByte()
    )

    /** Sets brightness (0–100). */
    fun createBrightnessCommand(brightness: Int): ByteArray = byteArrayOf(
        0x7E,
        0x04,
        0x01,
        brightness.coerceIn(0..100).toByte(),
        0xFF.toByte(),
        0xFF.toByte(),
        0xFF.toByte(),
        0x00,
        0xEF.toByte()
    )

    /** Turns the built-in microphone on/off. */
    fun createMicOnOffCommand(isOn: Boolean): ByteArray = byteArrayOf(
        0x7E,
        0x04,
        0x07,
        if (isOn) 1 else 0,
        0xFF.toByte(),
        0xFF.toByte(),
        0xFF.toByte(),
        0x00,
        0xEF.toByte()
    )

    /** Sets microphone EQ mode (0=Classic, 1=Soft, 2=Dynamic, 3=Disco). */
    fun createMicEqCommand(eqMode: Int): ByteArray = byteArrayOf(
        0x7E,
        0x05,
        0x03,
        (eqMode.coerceIn(0..3) + 128).toByte(),
        0x04,
        0xFF.toByte(),
        0xFF.toByte(),
        0x00,
        0xEF.toByte()
    )

    /** Sets microphone sensitivity (0–100). */
    fun createMicSensitivityCommand(sensitivity: Int): ByteArray = byteArrayOf(
        0x7E,
        0x04,
        0x06,
        sensitivity.coerceIn(0..100).toByte(),
        0xFF.toByte(),
        0xFF.toByte(),
        0xFF.toByte(),
        0x00,
        0xEF.toByte()
    )

    /** Syncs controller clock to current system time. */
    fun createSyncTimeCommand(): ByteArray {
        val calendar = Calendar.getInstance()
        return byteArrayOf(
            0x7E,
            0x07,
            0x83.toByte(),
            calendar.get(Calendar.HOUR_OF_DAY).toByte(),
            calendar.get(Calendar.MINUTE).toByte(),
            calendar.get(Calendar.SECOND).toByte(),
            (calendar.get(Calendar.DAY_OF_WEEK) - 1).toByte(),
            0xFF.toByte(),
            0xEF.toByte()
        )
    }

    /** Creates scheduling command. */
    fun createTimingCommand(
        hour: Int,
        minute: Int,
        second: Int,
        weekdays: List<Boolean>,
        isOn: Boolean,
        isSet: Boolean
    ): ByteArray {
        val setOrClearMask = if (isSet) 128 else 0
        val packedWeekdays = packWeekdays(weekdays)
        return byteArrayOf(
            0x7E,
            0x08,
            0x82.toByte(),
            hour.toByte(),
            minute.toByte(),
            second.toByte(),
            if (isOn) 0x00 else 0x01,
            (setOrClearMask or packedWeekdays).toByte(),
            0xEF.toByte()
        )
    }

    private fun packWeekdays(weekdays: List<Boolean>): Int {
        var packed = 0
        for (i in 0..6) {
            if (weekdays[i]) packed = packed or (1 shl i)
        }
        return packed
    }

    /** Changes RGB wire order (1=Red, 2=Green, 3=Blue). */
    fun createOrderChangeCommand(firstWire: Int, secondWire: Int, thirdWire: Int): ByteArray =
        byteArrayOf(
            0x7E,
            0x06,
            0x81.toByte(),
            firstWire.toByte(),
            secondWire.toByte(),
            thirdWire.toByte(),
            0xFF.toByte(),
            0x00,
            0xEF.toByte()
        )
}
