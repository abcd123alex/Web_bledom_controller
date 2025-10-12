// Check if Web Bluetooth is supported
if ('bluetooth' in navigator && 'permissions' in navigator) {
    document.getElementById("yesyes").style.display = "block";
} else {
    document.getElementById("nosupport").style.display = "block";
}

// Global state
let brightness = [0, 0, 0];
let rgbColor = { r: 255, g: 0, b: 0 };
let char = null;
let commandInProgress = false;

// Device disconnected handler
function onDisconnected(event) {
    const device = event.target;
    console.log(`Device ${device.name} disconnected.`);
    char = null;
    document.getElementById("controls").style.display = "none";
    document.getElementById("searchBtn").style.display = "block";
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
        console.log("GATT server connected:", server);

        const service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
        console.log("Service obtained:", service);

        char = await service.getCharacteristic('0000fff3-0000-1000-8000-00805f9b34fb');
        console.log("Characteristic obtained:", char);

        document.getElementById("searchBtn").style.display = "none";
        document.getElementById("controls").style.display = "block";

        setInterval(attackRelease, 75);

        if (navigator.requestMIDIAccess) {
            document.getElementById("midiBtn").style.display = "inline-block";
        }

        setColor(rgbColor.r, rgbColor.g, rgbColor.b);

    } catch (err) {
        console.error("Connection failed:", err);
    }
}

// Send a command to the device safely
function sendCommand(command, onSuccess) {
    if (!char) {
        console.warn("No connected characteristic!");
        return;
    }

    if (!commandInProgress) {
        commandInProgress = true;
        char.writeValue(command)
            .then(() => {
                commandInProgress = false;
                if (typeof onSuccess === 'function') onSuccess();
            })
            .catch(err => {
                commandInProgress = false;
                console.error(err);
            });
    }
}

// Color & effect helpers
// Power on/off command
function setPower(on) {
    const cmd = new Uint8Array([0x7e, 0x00, 0x04, on ? 0x01 : 0x00, 0x00, 0x00, 0x00, 0x00, 0xef]);
    sendCommand(cmd.buffer);
}
// Turn off the LEDs
function off() {
    setColor(0, 0, 0);
}

// Turn on the LEDs (restore last color)
function on() {
    setColor(rgbColor.r, rgbColor.g, rgbColor.b);
}
function setColor(r, g, b, onSuccess) {
    if (document.getElementById("customColorInput"))
        document.getElementById("customColorInput").value = rgbToHex(r, g, b);

    if (document.getElementById("modeSelect")) document.getElementById("modeSelect").value = "null";
    if (document.getElementById("dynamicSelect")) document.getElementById("dynamicSelect").value = "null";

    rgbColor = { r, g, b };
    const command = new Uint8Array([0x7e, 0x00, 0x05, 0x03, limitHex(r), limitHex(g), limitHex(b), 0x00, 0xef]).buffer;
    sendCommand(command, onSuccess);
}

function setColorHex(hexColor, onSuccess) {
    if (!hexColor || !hexColor.trim()) {
        console.warn("Hex color is empty!");
        return;
    }
    rgbColor = hexToRgb(hexColor);
    setColor(rgbColor.r, rgbColor.g, rgbColor.b, onSuccess);
}

function setBrightness(value, onSuccess) {
    const command = new Uint8Array([0x7e, 0x00, 0x01, limitPerc(value), 0x00, 0x00, 0x00, 0x00, 0xef]).buffer;
    sendCommand(command, onSuccess);
}

function setEffectSpeed(speed) {
    const command = new Uint8Array([0x7e, 0x00, 0x02, limitPerc(speed), 0x00, 0x00, 0x00, 0x00, 0xef]).buffer;
    sendCommand(command);
}

// --- Full pattern list ---
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

// Updated function to set effect by pattern name
function setModeEffectByName(effectName) {
    if (!(effectName in patternCodes)) {
        console.warn(`${effectName} is not a valid pattern`);
        return;
    }

    const command = new Uint8Array([
        0x7e, 0x00, 0x03, limitHex(patternCodes[effectName]),
        0x03, 0x00, 0x00, 0x00, 0xef
    ]).buffer;

    sendCommand(command);

    if (document.getElementById("dynamicSelect")) document.getElementById("dynamicSelect").value = "null";
}

// Keep your existing dynamic & sensitivity functions
function setModeDynamic(dynamic) {
    const command = new Uint8Array([0x7e, 0x00, 0x03, limitHex(dynamic), 0x04, 0x00, 0x00, 0x00, 0xef]).buffer;
    sendCommand(command);

    if (document.getElementById("modeSelect")) document.getElementById("modeSelect").value = "null";
}

function setSensitivityForDynamicMode(sensitivity) {
    const command = new Uint8Array([0x7e, 0x00, 0x07, limitHex(sensitivity), 0x00, 0x00, 0x00, 0x00, 0xef]).buffer;
    sendCommand(command);
}

// Attack-release logic for keyboard control
function attackRelease() {
    if (!useKbd || midiEnabled) return;

    const target = [0, 0, 0];
    const threshold = 0.001;
    const attack = parseFloat(document.getElementById("attack").value);
    const release = parseFloat(document.getElementById("release").value);
    const time = [release, release, release];

    if (!onlyOneKey) {
        if (keysPressed.includes(65)) { target[0] = 255; time[0] = attack; }
        if (keysPressed.includes(83)) { target[1] = 255; time[1] = attack; }
        if (keysPressed.includes(68)) { target[2] = 255; time[2] = attack; }
    } else if (keysPressed.length > 0) {
        switch (keysPressed[keysPressed.length - 1]) {
            case 65: target[0] = 255; time[0] = attack; brightness[1] = 0; brightness[2] = 0; break;
            case 83: target[1] = 255; time[1] = attack; brightness[0] = 0; brightness[2] = 0; break;
            case 68: target[2] = 255; time[2] = attack; brightness[0] = 0; brightness[1] = 0; break;
        }
    }

    const coeff = time.map(t => Math.pow(1.0 / threshold, -1.0 / (t * 44100 * 0.001)));

    brightness = brightness.map((b, i) => Math.floor((coeff[i] * b) + ((1 - coeff[i]) * target[i])));

    setColor(brightness[0], brightness[1], brightness[2]);
}
