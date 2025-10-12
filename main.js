/***********************
 * Helper utilities
 ***********************/
const clamp = (v, a, b) => Math.max(a, Math.min(b, v|0));
function limitHex(v){ return clamp(v, 0, 255); }
function limitPerc(v){ return clamp(v, 0, 100); }
function rgbToHex(r,g,b){
  const to2 = n => ('0'+(n|0).toString(16)).slice(-2);
  return ('#'+to2(r)+to2(g)+to2(b)).toUpperCase();
}
function hexToRgb(hex){
  if(!hex) return {r:0,g:0,b:0};
  hex = hex.replace('#','');
  if(hex.length === 3) hex = hex.split('').map(s=>s+s).join('');
  return { r: parseInt(hex.substr(0,2),16), g: parseInt(hex.substr(2,2),16), b: parseInt(hex.substr(4,2),16) };
}

/***********************
 * BLE + device state
 ***********************/
let bleDevice = null;
let char = null;
let commandInProgress = false;

// UI elements (some duplicated top vs sidebar; handlers share logic)
const deviceNameEl = document.getElementById('deviceName');
const deviceNameTopEl = document.getElementById('deviceNameTop');
const selectedDeviceEl = document.getElementById('selectedDevice');

const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectBtnTop = document.getElementById('connectBtnTop');
const disconnectBtnTop = document.getElementById('disconnectBtnTop');

const reconnectBtn = document.getElementById('reconnectBtn');
const forgetBtn = document.getElementById('forgetBtn');
const reconnectBtnTop = document.getElementById('reconnectBtnTop');
const forgetBtnTop = document.getElementById('forgetBtnTop');

const supportMsg = document.getElementById('supportMsg');
if('bluetooth' in navigator && 'permissions' in navigator){
  supportMsg.textContent = 'Web Bluetooth supported';
} else {
  supportMsg.textContent = 'Web Bluetooth NOT supported. Use Chrome/Edge on desktop or Android.';
}

/***********************
 * BLE functions
 ***********************/
async function searchBLEDom(){
  try {
    // disable primary connect buttons while picking
    [connectBtn, connectBtnTop].forEach(b=>{ if(b) { b.disabled = true; b.textContent = 'Picking...'; } });

    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb']
    });

    // Save selected device
    bleDevice = device;
    updateDeviceUI();

    device.addEventListener('gattserverdisconnected', onDisconnected);

    [connectBtn, connectBtnTop].forEach(b=>{ if(b) b.textContent = 'Connecting...'; });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
    char = await service.getCharacteristic('0000fff3-0000-1000-8000-00805f9b34fb');

    // show connected UI
    [connectBtn, connectBtnTop].forEach(b=>{ if(b) b.classList.add('hidden'); });
    [disconnectBtn, disconnectBtnTop].forEach(b=>{ if(b) b.classList.remove('hidden'); });

    reconnectBtn.disabled = false; reconnectBtnTop.disabled = false;

    // initial state
    setColorHex(document.getElementById('customColorInput').value);
    setBrightness(parseInt(document.getElementById('brightnessSlider').value));

    [connectBtn, connectBtnTop].forEach(b=>{ if(b) { b.textContent = 'Connect'; b.disabled = false; } });
  } catch(err){
    console.error('BLE error', err);
    [connectBtn, connectBtnTop].forEach(b=>{ if(b) { b.textContent = 'Connect'; b.disabled = false; } });
  }
}

function onDisconnected(event){
  console.log('device disconnected', event);
  char = null;
  // show reconnect option
  [disconnectBtn, disconnectBtnTop].forEach(b=> b.classList.add('hidden'));
  [connectBtn, connectBtnTop].forEach(b=> b.classList.remove('hidden'));
  reconnectBtn.disabled = false; reconnectBtnTop.disabled = false;
  if(deviceNameEl) deviceNameEl.textContent = 'Disconnected';
  if(deviceNameTopEl) deviceNameTopEl.textContent = 'Disconnected';
}

function disconnectDevice(){
  try{
    if(bleDevice && bleDevice.gatt && bleDevice.gatt.connected){
      bleDevice.gatt.disconnect();
    }
    char = null;
    [disconnectBtn, disconnectBtnTop].forEach(b=> b.classList.add('hidden'));
    [connectBtn, connectBtnTop].forEach(b=> b.classList.remove('hidden'));
    reconnectBtn.disabled = false; reconnectBtnTop.disabled = false;
    if(deviceNameEl) deviceNameEl.textContent = 'Not connected';
    if(deviceNameTopEl) deviceNameTopEl.textContent = 'Not connected';
    if(selectedDeviceEl) selectedDeviceEl.textContent = '—';
    bleDevice = null;
  }catch(e){console.warn(e)}
}

function forgetDevice(){
  bleDevice = null;
  char = null;
  if(deviceNameEl) deviceNameEl.textContent = 'Not connected';
  if(deviceNameTopEl) deviceNameTopEl.textContent = 'Not connected';
  if(selectedDeviceEl) selectedDeviceEl.textContent = '—';
  reconnectBtn.disabled = true; reconnectBtnTop.disabled = true;
  [disconnectBtn, disconnectBtnTop].forEach(b=> b.classList.add('hidden'));
  [connectBtn, connectBtnTop].forEach(b=> b.classList.remove('hidden'));
}

function updateDeviceUI(){
  const name = (bleDevice && (bleDevice.name || bleDevice.id)) || 'Not connected';
  if(deviceNameEl) deviceNameEl.textContent = name;
  if(deviceNameTopEl) deviceNameTopEl.textContent = name;
  if(selectedDeviceEl) selectedDeviceEl.textContent = name;
}

async function sendCommand(command, onSuccess){
  if(!char){
    console.warn('No connected characteristic to write to.');
    return;
  }
  if(commandInProgress) return; // simple lock
  commandInProgress = true;
  try {
    await char.writeValue(command);
    commandInProgress = false;
    if(typeof onSuccess === 'function') onSuccess();
  } catch(err){
    commandInProgress = false;
    console.error('Write error', err);
  }
}

/***********************
 * Controls (color/brightness/effects)
 ***********************/
// set color: sends BLEDOM frame: 0x7e .. data .. 0xef
function setColor(r,g,b,onSuccess){
  const hex = rgbToHex(r,g,b);
  document.getElementById('customColorInput').value = hex;
  document.getElementById('colorPreview').style.background = hex;
  document.getElementById('currentColorText').textContent = hex;

  const arr = new Uint8Array([0x7e, 0x00, 0x05, 0x03, limitHex(r), limitHex(g), limitHex(b), 0x00, 0xef]);
  sendCommand(arr.buffer, onSuccess);
}

function setColorHex(hex, onSuccess){
  const rgb = hexToRgb(hex);
  setColor(rgb.r, rgb.g, rgb.b, onSuccess);
}

let brightnessDebounce = null;
function setBrightness(value, onSuccess){
  value = limitPerc(value);
  const bvEl = document.getElementById('brightnessValue');
  if(bvEl) bvEl.textContent = value + '%';
  const arr = new Uint8Array([0x7e,0x00,0x01, limitPerc(value), 0x00,0x00,0x00,0x00,0xef]);
  if(brightnessDebounce) clearTimeout(brightnessDebounce);
  brightnessDebounce = setTimeout(()=> sendCommand(arr.buffer, onSuccess), 120);
}

function setEffectSpeed(speed){
  const arr = new Uint8Array([0x7e,0x00,0x02, limitPerc(speed),0x00,0x00,0x00,0x00,0xef]);
  sendCommand(arr.buffer);
}

function setModeEffect(effect){
  if(!effect) return;
  const effectsMap = {
    red: 0x80, blue: 0x81, green: 0x82, cyan: 0x83, yellow: 0x84,
    magenta: 0x85, white: 0x86, jump_rgb: 0x87, jump_rgbycmw: 0x88,
    gradient_rgb: 0x89, gradient_rgbycmw: 0x8a, blink_rgbycmw: 0x95
  };
  if(!(effect in effectsMap)){
    console.warn('Unknown effect', effect);
    return;
  }
  const cmd = new Uint8Array([0x7e,0x00,0x03, limitHex(effectsMap[effect]), 0x03,0x00,0x00,0x00,0xef]);
  sendCommand(cmd.buffer);

  // visually mark the preset button
  document.querySelectorAll('.preset-btn').forEach(b=> b.classList.remove('active'));
  const btn = document.querySelector(`.preset-btn[data-effect="${effect}"]`);
  if(btn) btn.classList.add('active');

  // reset dynamic select visually
  const ds = document.getElementById('dynamicSelect');
  if(ds) ds.value = '';
}

function setModeDynamic(val){
  if(val === '' || typeof val === 'undefined' || isNaN(val)) return;
  const cmd = new Uint8Array([0x7e,0x00,0x03, limitHex(val), 0x04,0x00,0x00,0x00,0xef]);
  sendCommand(cmd.buffer);
  // clear preset selection
  document.querySelectorAll('.preset-btn').forEach(b=> b.classList.remove('active'));
}

/***********************
 * UI wiring + preset rendering
 ***********************/

// Wire connect/disconnect (both top and main controls use same functions)
connectBtn && connectBtn.addEventListener('click', () => searchBLEDom());
connectBtnTop && connectBtnTop.addEventListener('click', () => searchBLEDom());
disconnectBtn && disconnectBtn.addEventListener('click', () => disconnectDevice());
disconnectBtnTop && disconnectBtnTop.addEventListener('click', () => disconnectDevice());

// reconnect handlers
reconnectBtn && reconnectBtn.addEventListener('click', async () => {
  if(!bleDevice) return;
  try{
    await bleDevice.gatt.connect();
    updateDeviceUI();
    reconnectBtn.disabled = true;
  }catch(e){ console.error(e) }
});
reconnectBtnTop && reconnectBtnTop.addEventListener('click', async () => {
  if(!bleDevice) return;
  try{
    await bleDevice.gatt.connect();
    updateDeviceUI();
    reconnectBtnTop.disabled = true;
  }catch(e){ console.error(e) }
});

// forget handlers
forgetBtn && forgetBtn.addEventListener('click', forgetDevice);
forgetBtnTop && forgetBtnTop.addEventListener('click', forgetDevice);

// color palette click handlers
document.querySelectorAll('.color-btn').forEach(btn=>{
  btn.addEventListener('click', () => {
    const c = btn.dataset.color;
    setColorHex(c);
  });
});
document.getElementById('customColorInput').addEventListener('input', (e)=>{
  document.getElementById('colorPreview').style.background = e.target.value;
  document.getElementById('currentColorText').textContent = e.target.value.toUpperCase();
});
document.getElementById('applyColorBtn').addEventListener('click', () => {
  setColorHex(document.getElementById('customColorInput').value);
});

// power on/off
document.getElementById('powerOnBtn').addEventListener('click', ()=>{ if(typeof setPower === 'function') setPower(true); });
document.getElementById('powerOffBtn').addEventListener('click', ()=>{ if(typeof setPower === 'function') setPower(false); });

// effect speed slider
const effectSpeedSlider = document.getElementById('effectSpeed');
const effectSpeedValue = document.getElementById('effectSpeedValue');
effectSpeedSlider && effectSpeedSlider.addEventListener('input', e => {
  effectSpeedValue.textContent = e.target.value;
  setEffectSpeed(parseInt(e.target.value));
});

// brightness (moved into default colors)
const brightnessSlider = document.getElementById('brightnessSlider');
const brightnessValue = document.getElementById('brightnessValue');
brightnessSlider && brightnessSlider.addEventListener('input', e=>{
  brightnessValue.textContent = e.target.value + '%';
  setBrightness(parseInt(e.target.value));
});
document.getElementById('setFullBtn') && document.getElementById('setFullBtn').addEventListener('click', ()=>{
  if(!brightnessSlider) return;
  brightnessSlider.value = 100;
  brightnessValue.textContent = '100%';
  setBrightness(100);
});
// quick brightness small control (keyboard)
document.getElementById('brightnessQuick') && document.getElementById('brightnessQuick').addEventListener('input', e=>{
  const v = parseInt(e.target.value);
  if(brightnessSlider){
    brightnessSlider.value = v;
    brightnessValue.textContent = v + '%';
  }
  setBrightness(v);
});

// audio capture
document.getElementById('captureAudioBtn').addEventListener('click', (e)=>{
  if(typeof startCapture === 'function') startCapture(e.target);
  else alert('startCapture() not implemented here — include your audio code.');
});

// keyboard enable toggle
document.getElementById('usekbd').addEventListener('change', (e)=>{
  window.useKbd = !!e.target.checked;
});

// visualizer (same as before)
(function initVisualizer(){
  const canvas = document.getElementById('visualizer');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let t = 0;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = 'rgba(30,150,255,0.06)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.beginPath();
    ctx.moveTo(0, canvas.height/2);
    for(let i=0;i<canvas.width;i+=10){
      const y = canvas.height/2 + Math.sin((i+t)/20) * (canvas.height/4);
      ctx.lineTo(i,y);
    }
    ctx.strokeStyle = 'rgba(30,167,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    t += 1;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();

/***********************
 * Preset effects (render as buttons) - REPLACED BLOCK
 ***********************/

// Preset Effects definitions (with name, effect, colors, category)
const presetEffects = [
  // Solid
  { name: 'Red', effect: 'red', colors: ['#ff3b30'], category: 'solid' },
  { name: 'Green', effect: 'green', colors: ['#34c759'], category: 'solid' },
  { name: 'Blue', effect: 'blue', colors: ['#007aff'], category: 'solid' },
  { name: 'Cyan', effect: 'cyan', colors: ['#00c7c7'], category: 'solid' },
  { name: 'Yellow', effect: 'yellow', colors: ['#ffd60a'], category: 'solid' },
  { name: 'Magenta', effect: 'magenta', colors: ['#ff2d55'], category: 'solid' },
  { name: 'White', effect: 'white', colors: ['#ffffff'], category: 'solid' },

  // Jump
  { name: 'Jump RGB', effect: 'jump_rgb', colors: ['#ff3b30','#34c759','#007aff'], category: 'jump' },
  { name: 'Jump RGBYCMW', effect: 'jump_rgbycmw', colors: ['#ff3b30','#34c759','#007aff','#ffd60a','#00c7c7','#ff2d55','#ffffff'], category: 'jump' },

  // Fade / Gradient
  { name: 'Fade RGB', effect: 'gradient_rgb', colors: ['#ff3b30','#000000','#34c759','#000000','#007aff'], category: 'fade' },
  { name: 'Fade RGBYCMW', effect: 'gradient_rgbycmw', colors: ['#ff3b30','#34c759','#007aff','#ffd60a','#00c7c7','#ff2d55','#ffffff'], category: 'fade' },
  { name: 'Fade Red', effect: 'gradient_r', colors: ['#ff3b30','#000000'], category: 'fade' },
  { name: 'Fade Green', effect: 'gradient_g', colors: ['#34c759','#000000'], category: 'fade' },
  { name: 'Fade Blue', effect: 'gradient_b', colors: ['#007aff','#000000'], category: 'fade' },
  { name: 'Fade Yellow', effect: 'gradient_y', colors: ['#ffd60a','#000000'], category: 'fade' },
  { name: 'Fade Cyan', effect: 'gradient_c', colors: ['#00c7c7','#000000'], category: 'fade' },
  { name: 'Fade Magenta', effect: 'gradient_m', colors: ['#ff2d55','#000000'], category: 'fade' },
  { name: 'Fade White', effect: 'gradient_w', colors: ['#ffffff','#000000'], category: 'fade' },
  { name: 'Fade Red/Green', effect: 'gradient_rg', colors: ['#ff3b30','#34c759'], category: 'fade' },
  { name: 'Fade Red/Blue', effect: 'gradient_rb', colors: ['#ff3b30','#007aff'], category: 'fade' },
  { name: 'Fade Green/Blue', effect: 'gradient_gb', colors: ['#34c759','#007aff'], category: 'fade' },

  // Blink
  { name: 'Blink RGBYCMW', effect: 'blink_rgbycmw', colors: ['#ff3b30','#34c759','#007aff','#ffd60a','#00c7c7','#ff2d55','#ffffff'], category: 'blink' },
  { name: 'Blink Red', effect: 'blink_r', colors: ['#ff3b30','#000000'], category: 'blink' },
  { name: 'Blink Green', effect: 'blink_g', colors: ['#34c759','#000000'], category: 'blink' },
  { name: 'Blink Blue', effect: 'blink_b', colors: ['#007aff','#000000'], category: 'blink' },
  { name: 'Blink Yellow', effect: 'blink_y', colors: ['#ffd60a','#000000'], category: 'blink' },
  { name: 'Blink Cyan', effect: 'blink_c', colors: ['#00c7c7','#000000'], category: 'blink' },
  { name: 'Blink Magenta', effect: 'blink_m', colors: ['#ff2d55','#000000'], category: 'blink' },
  { name: 'Blink White', effect: 'blink_w', colors: ['#ffffff','#000000'], category: 'blink' }
];

// Helper map: category => grid element id that exists in your HTML
const categoryGridMap = {
  solid: 'presetGridSolid',
  jump: 'presetGridJump',
  fade: 'presetGridFade',
  blink: 'presetGridBlink'
};

function renderPresetButtonsWithPreview() {
  // Clear each grid first
  Object.values(categoryGridMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  // For each category, render its presets
  Object.keys(categoryGridMap).forEach(category => {
    const gridId = categoryGridMap[category];
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const list = presetEffects.filter(p => p.category === category);
    list.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.setAttribute('data-effect', preset.effect);
      btn.setAttribute('tabindex', 0);
      btn.addEventListener('click', () => setModeEffect(preset.effect));

      // Animated preview bubble
      const preview = document.createElement('div');
      preview.className = 'preset-preview-bubble';
      preview.style.width = '28px';
      preview.style.height = '28px';
      preview.style.borderRadius = '50%';
      preview.style.marginRight = '8px';
      preview.style.display = 'inline-block';
      preview.style.verticalAlign = 'middle';
      preview.style.border = '2px solid #222';
      preview.style.background = preset.colors[0] || '#000';
      btn.appendChild(preview);

      // Add hover state tracking
      btn._isHovered = false;
      btn.addEventListener('mouseenter', () => { btn._isHovered = true; });
      btn.addEventListener('mouseleave', () => { btn._isHovered = false; });

      // Label: a wrapper + track with duplicated text for smooth marquee
      const labelWrap = document.createElement('div');
      labelWrap.className = 'preset-label';

  const track = document.createElement('div');
  track.className = 'preset-label-track';

  // start with a single text node; we'll duplicate only if overflow is detected
  const txt1 = document.createElement('div');
  txt1.className = 'preset-label-text';
  txt1.textContent = preset.name;
  track.appendChild(txt1);
      labelWrap.appendChild(track);
      btn.appendChild(labelWrap);

      // helper: measure if scrolling is needed and configure CSS vars
      function updateScrollState() {
        // small timeout to ensure layout is settled
        requestAnimationFrame(() => {
          const wrapperWidth = labelWrap.clientWidth;
          const singleWidth = txt1.scrollWidth;

          if (singleWidth > wrapperWidth + 6) {
            // needs scrolling: ensure there are two copies for continuous scroll
            if (track.children.length < 2) {
              const txt2 = document.createElement('div');
              txt2.className = 'preset-label-text';
              txt2.textContent = preset.name;
              track.appendChild(txt2);
            }
            labelWrap.classList.add('needs-scroll');
            const distance = singleWidth + 28; // include padding/gap
            track.style.setProperty('--preset-scroll-distance', distance + 'px');
            const duration = Math.max(3, Math.min(18, distance / 30));
            track.style.setProperty('--preset-scroll-duration', duration + 's');
          } else {
            // remove duplicate if exists and disable scrolling
            if (track.children.length > 1) {
              while (track.children.length > 1) track.removeChild(track.lastChild);
            }
            labelWrap.classList.remove('needs-scroll');
            track.style.removeProperty('--preset-scroll-distance');
            track.style.removeProperty('--preset-scroll-duration');
          }
        });
      }

      // run initially and after images/fonts/layout settled
      updateScrollState();
      // store ref for later resize handling
      btn._updateScrollState = updateScrollState;

      grid.appendChild(btn);
    });
  });
}
renderPresetButtonsWithPreview();

// recompute scrolling needs when window resizes or grid changes
window.addEventListener('resize', () => {
  document.querySelectorAll('.preset-btn').forEach(b => { if (b._updateScrollState) b._updateScrollState(); });
});

// Animation logic for preview bubbles (uses effect name lookup so ordering doesn't matter)
function animatePresetBubbles() {
  const now = Date.now();
  // build a lookup map effect -> preset object to avoid O(N^2) lookups
  const presetMap = new Map(presetEffects.map(p => [p.effect, p]));

  document.querySelectorAll('.preset-btn').forEach(btn => {
    const effectName = btn.dataset.effect;
    const preset = presetMap.get(effectName);
    const bubble = btn.querySelector('.preset-preview-bubble');
    if (!bubble || !preset) return;

    if (btn._isHovered) {
      // Jump and blink cycle through colors
      if (preset.effect.startsWith('blink_') || preset.effect.startsWith('jump_')) {
        const speed = preset.effect.startsWith('blink_') ? 300 : 500;
        const i = Math.floor(now / speed) % Math.max(1, preset.colors.length);
        bubble.style.background = preset.colors[i] || preset.colors[0];
      } else if (preset.effect.startsWith('gradient_') || preset.effect.startsWith('gradient') ) {
        // Smooth blend between consecutive colors
        const len = Math.max(1, preset.colors.length);
        const cycleMs = 1200;
        const t = (now % (cycleMs * len)) / cycleMs; // increments across colors
        const i = Math.floor(t) % len;
        const next = (i + 1) % len;
        const frac = t - Math.floor(t);

        // local hex <-> rgb helpers (isolated so we don't shadow global helpers)
        function _hexToRgb(hex) {
          hex = (hex || '#000').replace('#','');
          if (hex.length === 3) hex = hex.split('').map(s=>s+s).join('');
          const num = parseInt(hex, 16);
          return [(num>>16)&255, (num>>8)&255, num&255];
        }
        function _rgbToHex(r,g,b) {
          const to2 = n => ('0'+(n|0).toString(16)).slice(-2);
          return ('#'+to2(r)+to2(g)+to2(b)).toUpperCase();
        }

        const rgb1 = _hexToRgb(preset.colors[i] || '#000000');
        const rgb2 = _hexToRgb(preset.colors[next] || '#000000');
        const rgb = rgb1.map((c,ci) => Math.round(c*(1-frac) + rgb2[ci]*frac));
        bubble.style.background = _rgbToHex(rgb[0], rgb[1], rgb[2]);
      } else {
        bubble.style.background = preset.colors[0] || '#000';
      }
    } else {
      // static color when not hovered
      bubble.style.background = preset.colors[0] || '#000';
    }
  });

  requestAnimationFrame(animatePresetBubbles);
}
animatePresetBubbles();


// dynamicSelect wiring
document.getElementById('dynamicSelect') && document.getElementById('dynamicSelect').addEventListener('change', (e)=>{
  setModeDynamic(parseInt(e.target.value));
});

// stop effects already wired above by stopEffects button
document.getElementById('stopEffects') && document.getElementById('stopEffects').addEventListener('click', ()=>{
  setColorHex(document.getElementById('customColorInput').value);
});

/***********************
 * Expose + safe stubs
 ***********************/
window._bledom = { searchBLEDom, setColor, setBrightness, setModeEffect, setModeDynamic, disconnectDevice, forgetDevice };

if(typeof startCapture === 'undefined') window.startCapture = function(){ console.warn('startCapture() not available in this build'); };
if(typeof reqMidi === 'undefined') window.reqMidi = function(){ console.warn('reqMidi() not available'); };

setInterval(()=>{ if(bleDevice) updateDeviceUI(); }, 2000);
