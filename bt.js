// bt.js — fixed & cleaned up

// Feature detection & UI hints
const supportsWebBluetooth = !!navigator.bluetooth;
if (supportsWebBluetooth) {
    const el = document.getElementById("yesyes");
    if (el) el.style.display = "block";
} else {
    const el = document.getElementById("nosupport");
    if (el) el.style.display = "block";
}

// Global state
let brightness = [0, 0, 0];
let rgbColor = { r: 255, g: 0, b: 0 };
let char = null; // BluetoothRemoteGATTCharacteristic
let gattServer = null;
let commandInProgress = false;
let attackIntervalId = null;

// Keyboard / MIDI flags & state (defaults so attackRelease won't blow up)
let useKbd = true;
let midiEnabled = false;
let onlyOneKey = false;
let keysPressed = [];

// Utility helpers
function clampByte(v) {
    const n = Number(v) || 0;
    return Math.max(0, Math.min(255, Math.floor(n)));
}
function clampPercent(v) {
    const n = Number(v) || 0;
    return Math.max(0, Math.min(100, Math.floor(n)));
}
function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    hex = hex.replace(/^#/, '').trim();
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const parsed = parseInt(hex, 16);
    return {
        r: (parsed >> 16) & 0xff,
        g: (parsed >> 8) & 0xff,
        b: parsed & 0xff
    };
}
function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => clampByte(x).toString(16).padStart(2, '0')).join('');
}

// Device disconnected handler
function onDisconnected(event) {
    const device = event?.target;
    console.log(`Device ${device?.name ?? '(unknown)'} disconnected.`);
    char = null;
    gattServer = null;

    const controls = document.getElementById("controls");
    if (controls) controls.style.display = "none";

    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.style.display = "block";

    // stop attack-release polling
    if (attackIntervalId !== null) {
        clearInterval(attackIntervalId);
        attackIntervalId = null;
    }
}

// Connect to a BLE device
async function searchBLEDom() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb']
        });
        console.log("Selected device:", device.name);

        device.addEventListener('gattserverdisconnected', onDisconnected);

        const server = await device.gatt.connect();
        gattServer = server;
        console.log("GATT server connected:", server);

        const service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
        console.log("Service obtained:", service);

        char = await service.getCharacteristic('0000fff3-0000-1000-8000-00805f9b34fb');
        console.log("Characteristic obtained:", char);

        const searchBtn = document.getElementById("searchBtn");
        if (searchBtn) searchBtn.style.display = "none";

        const controls = document.getElementById("controls");
        if (controls) controls.style.display = "block";

        // Start attack-release loop (only one interval instance)
        if (attackIntervalId === null) {
            attackIntervalId = setInterval(attackRelease, 75);
        }

        if (navigator.requestMIDIAccess) {
            const midiBtn = document.getElementById("midiBtn");
            if (midiBtn) midiBtn.style.display = "inline-block";
        }

        // Restore current color on connect
        setColor(rgbColor.r, rgbColor.g, rgbColor.b);

    } catch (err) {
        console.error("Connection failed:", err);
    }
}

// Send a command to the device safely (serializes writes)
function sendCommand(commandSource, onSuccess) {
    if (!char) {
        console.warn("No connected characteristic!");
        return;
    }

    // Accept ArrayBuffer, Uint8Array, or Array
    let u8;
    if (commandSource instanceof ArrayBuffer) {
        u8 = new Uint8Array(commandSource);
    } else if (commandSource instanceof Uint8Array) {
        u8 = commandSource;
    } else if (Array.isArray(commandSource)) {
        u8 = new Uint8Array(commandSource);
    } else {
        console.error("Unsupported command type:", commandSource);
        return;
    }

    if (!commandInProgress) {
        commandInProgress = true;
        // Use writeValue (returns Promise). Some devices require write without response;
        // change to writeValueWithoutResponse if appropriate.
        char.writeValue(u8)
            .then(() => {
                commandInProgress = false;
                if (typeof onSuccess === 'function') onSuccess();
            })
            .catch(err => {
                commandInProgress = false;
                console.error("Write error:", err);
            });
    } else {
        // If you want, implement a small queue here. For now, we drop extra commands.
        console.warn("Command in progress, dropped a command.");
    }
}

// --------- Commands (aligned with CommandUtils Kotlin you provided) ---------

// Power on/off — matches Kotlin: [0x7E, 0x04, 0x04, on?1:0, 0x00, on?1:0, 0xFF, 0x00, 0xEF]
function setPower(on, onSuccess) {
    const cmd = new Uint8Array([
        0x7E, 0x04, 0x04,
        on ? 0x01 : 0x00,
        0x00,
        on ? 0x01 : 0x00,
        0xFF, 0x00,
        0xEF
    ]);
    sendCommand(cmd, onSuccess);
}

// Off (set color to black)
function off() {
    setColor(0, 0, 0);
}

// On (restore last color)
function on() {
    setColor(rgbColor.r, rgbColor.g, rgbColor.b);
}

// Color command — matches Kotlin: [0x7E,0x07,0x05,0x03,r,g,b,0x10,0xEF]
function setColor(r, g, b, onSuccess) {
    r = clampByte(r); g = clampByte(g); b = clampByte(b);

    const colorInput = document.getElementById("customColorInput");
    if (colorInput) colorInput.value = rgbToHex(r, g, b);

    const modeSelect = document.getElementById("modeSelect");
    if (modeSelect) modeSelect.value = "null";
    const dynSelect = document.getElementById("dynamicSelect");
    if (dynSelect) dynSelect.value = "null";

    rgbColor = { r, g, b };
    const cmd = new Uint8Array([
        0x7E, 0x07, 0x05, 0x03,
        r, g, b,
        0x10,
        0xEF
    ]);
    sendCommand(cmd, onSuccess);
}

function setColorHex(hexColor, onSuccess) {
    if (!hexColor || !hexColor.trim()) {
        console.warn("Hex color is empty!");
        return;
    }
    rgbColor = hexToRgb(hexColor);
    setColor(rgbColor.r, rgbColor.g, rgbColor.b, onSuccess);
}

// Brightness — matches Kotlin: [0x7E,0x04,0x01,brightness,0xFF,0xFF,0xFF,0x00,0xEF]
function setBrightness(value, onSuccess) {
    const b = clampPercent(value);
    const cmd = new Uint8Array([
        0x7E, 0x04, 0x01,
        b,
        0xFF, 0xFF, 0xFF,
        0x00,
        0xEF
    ]);
    sendCommand(cmd, onSuccess);
}

// Speed — matches Kotlin: [0x7E,0x04,0x02,speed,0xFF,0xFF,0xFF,0x00,0xEF]
function setEffectSpeed(speed, onSuccess) {
    const s = clampPercent(speed);
    const cmd = new Uint8Array([
        0x7E, 0x04, 0x02,
        s,
        0xFF, 0xFF, 0xFF,
        0x00,
        0xEF
    ]);
    sendCommand(cmd, onSuccess);
}

// Pattern list & codes
const patternData = [
    "Static Red", "Static Blue", "Static Green", "Static Cyan", "Static Yellow",
    "Static Purple", "Static White", "Three Color Jumping Change", "Seven Color Jumping Change",
    "Three Color Cross Fade", "Seven Color Cross Fade", "Red Gradual Change",
    "Green Gradual Change", "Blue Gradual Change", "Yellow Gradual Change",
    "Cyan Gradual Change", "Purple Gradual Change", "White Gradual Change",
    "Red Green Cross Fade", "Red Blue Cross Fade", "Green Blue Cross Fade",
    "Seven color Strobe Flash", "Red Strobe Flash", "Green Strobe Flash",
    "Blue Strobe Flash", "Yellow Strobe Flash", "Cyan Strobe Flash",
    "Purple Strobe Flash", "White Strobe Flash"
];

const patternCodes = {
    "Static Red": 0x80, "Static Blue": 0x81, "Static Green": 0x82, "Static Cyan": 0x83,
    "Static Yellow": 0x84, "Static Purple": 0x85, "Static White": 0x86,
    "Three Color Jumping Change": 0x87, "Seven Color Jumping Change": 0x88,
    "Three Color Cross Fade": 0x89, "Seven Color Cross Fade": 0x8a,
    "Red Gradual Change": 0x8b, "Green Gradual Change": 0x8c, "Blue Gradual Change": 0x8d,
    "Yellow Gradual Change": 0x8e, "Cyan Gradual Change": 0x8f, "Purple Gradual Change": 0x90,
    "White Gradual Change": 0x91, "Red Green Cross Fade": 0x92,
    "Red Blue Cross Fade": 0x93, "Green Blue Cross Fade": 0x94,
    "Seven color Strobe Flash": 0x95, "Red Strobe Flash": 0x96,
    "Green Strobe Flash": 0x97, "Blue Strobe Flash": 0x98,
    "Yellow Strobe Flash": 0x99, "Cyan Strobe Flash": 0x9a,
    "Purple Strobe Flash": 0x9b, "White Strobe Flash": 0x9c
};

// Set pattern by name — matches Kotlin createPatternCommand layout:
// [0x7E,0x05,0x03, patternCode, 0x03, 0xFF,0xFF,0x00,0xEF]
function setModeEffectByName(effectName, onSuccess) {
    if (!(effectName in patternCodes)) {
        console.warn(`${effectName} is not a valid pattern`);
        return;
    }
    const code = patternCodes[effectName];
    const cmd = new Uint8Array([
        0x7E, 0x05, 0x03,
        code,
        0x03,
        0xFF, 0xFF,
        0x00,
        0xEF
    ]);
    sendCommand(cmd, onSuccess);

    const dynSelect = document.getElementById("dynamicSelect");
    if (dynSelect) dynSelect.value = "null";
}

// Dynamic mode (mic eq) — aligns to Kotlin mic EQ: [0x7E,0x05,0x03, (eq+128), 0x04, 0xFF,0xFF,0x00,0xEF]
function setModeDynamic(eqMode, onSuccess) {
    const eq = Math.max(0, Math.min(3, Number(eqMode) || 0)); // 0..3
    const cmd = new Uint8Array([
        0x7E, 0x05, 0x03,
        (0x80 + eq), // +128
        0x04,
        0xFF, 0xFF,
        0x00,
        0xEF
    ]);
    sendCommand(cmd, onSuccess);

    const modeSelect = document.getElementById("modeSelect");
    if (modeSelect) modeSelect.value = "null";
}

// Mic sensitivity — Kotlin: [0x7E,0x04,0x06,sensitivity,0xFF,0xFF,0xFF,0x00,0xEF]
function setSensitivityForDynamicMode(sensitivity, onSuccess) {
    const s = clampPercent(sensitivity);
    const cmd = new Uint8Array([
        0x7E, 0x04, 0x06,
        s,
        0xFF, 0xFF, 0xFF,
        0x00,
        0xEF
    ]);
    sendCommand(cmd, onSuccess);
}

// Attack-release logic for keyboard control
function attackRelease() {
    if (!useKbd || midiEnabled || !char) return;

    // local safe reads
    const attackElem = document.getElementById("attack");
    const releaseElem = document.getElementById("release");
    const attack = attackElem ? parseFloat(attackElem.value || 0.01) : 0.01;
    const release = releaseElem ? parseFloat(releaseElem.value || 1000) : 1000;

    // target per-channel
    const target = [0, 0, 0];
    const time = [release, release, release];

    if (!onlyOneKey) {
        if (keysPressed.includes(65)) { target[0] = 255; time[0] = attack; }
        if (keysPressed.includes(83)) { target[1] = 255; time[1] = attack; }
        if (keysPressed.includes(68)) { target[2] = 255; time[2] = attack; }
    } else if (keysPressed.length > 0) {
        const last = keysPressed[keysPressed.length - 1];
        switch (last) {
            case 65: target[0] = 255; time[0] = attack; brightness[1] = 0; brightness[2] = 0; break;
            case 83: target[1] = 255; time[1] = attack; brightness[0] = 0; brightness[2] = 0; break;
            case 68: target[2] = 255; time[2] = attack; brightness[0] = 0; brightness[1] = 0; break;
        }
    }

    // prevent too-small times — avoid divide-by-zero
    const safeTime = time.map(t => Math.max(0.0001, Number(t)));

    // The original code used: coeff = (1/threshold)^(-1/(t*44100*0.001))
    // We'll keep that formula but guard against weird values.
    const threshold = 0.001;
    const coeff = safeTime.map(t => Math.pow(1.0 / threshold, -1.0 / (t * 44100 * 0.001)));

    brightness = brightness.map((b, i) => {
        const newVal = Math.floor((coeff[i] * b) + ((1 - coeff[i]) * target[i]));
        return Math.max(0, Math.min(255, newVal));
    });

    setColor(brightness[0], brightness[1], brightness[2]);
}

// Simple keyboard handlers to maintain keysPressed
window.addEventListener('keydown', (ev) => {
    const code = ev.keyCode || ev.which;
    if (!keysPressed.includes(code)) keysPressed.push(code);
});
window.addEventListener('keyup', (ev) => {
    const code = ev.keyCode || ev.which;
    const idx = keysPressed.indexOf(code);
    if (idx !== -1) keysPressed.splice(idx, 1);
});

// Expose some functions for the UI (optional)
window.bt = {
    searchBLEDom,
    setPower,
    setColor,
    setColorHex,
    setBrightness,
    setEffectSpeed,
    setModeEffectByName,
    setModeDynamic,
    setSensitivityForDynamicMode,
    off,
    on
};
