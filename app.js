const S_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'.toLowerCase();
const C_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'.toLowerCase();
const FFT_SIZE = 1024;
let currentSampleRate = 20000, filteredDataLog = [], bufferIndex = 0;
let analysisBuffer = new Float32Array(FFT_SIZE), bleCharacteristicObject = null;
let audioCtx = null, gainNode = null, isSpeakerOn = false;
const tCanvas = document.getElementById('timeCanvas'), fCanvas = document.getElementById('freqCanvas');
const tCtx = tCanvas.getContext('2d'), fCtx = fCanvas.getContext('2d');
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain(); gainNode.gain.value = parseFloat(document.getElementById('volumeSlider').value);
        gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}
document.getElementById('speakerBtn').addEventListener('click', async () => {
    initAudio(); isSpeakerOn = !isSpeakerOn;
    document.getElementById('speakerBtn').innerText = isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉";
    document.getElementById('speakerBtn').className = isSpeakerOn ? "btn-speaker" : "btn-speaker muted";
});
document.getElementById('volumeSlider').addEventListener('input', (e) => {
    let v = parseFloat(e.target.value); document.getElementById('volumeVal').innerText = Math.round(v * 100) + "%";
    if (gainNode) gainNode.gain.value = v;
});
async function sendHardwareParameters() {
    if (!bleCharacteristicObject) return;
    let sr = parseInt(document.getElementById('boardSampleSlider').value), sf = parseInt(document.getElementById('boardSinSlider').value);
    currentSampleRate = sr; updateFilterCoefficients();
    let buf = new ArrayBuffer(8), view = new DataView(buf); view.setUint32(0, sr, true); view.setUint32(4, sf, true);
    try { await bleCharacteristicObject.writeValue(buf); } catch (err) { console.error(err); }
}
['boardSampleSlider', 'boardSinSlider'].forEach(id => {
    let el = document.getElementById(id), txt = document.getElementById(id.replace('Slider', 'Val'));
    el.addEventListener('input', (e) => { txt.innerText = e.target.value + " Hz"; });
    el.addEventListener('change', sendHardwareParameters);
});
let xv = [], yv = [], xv_bp = [], yv_bp = [];
let currentFilterMode = 'RAW', f1 = 1000, f2 = 3000, b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, bp_b = [1, 0, -1], bp_a = [];
function updateFilterCoefficients() {
    let fr = currentSampleRate / f1, o = Math.tan(Math.PI / fr), q = Math.sqrt(2), c = 1 + q * o + o * o;
    if (currentFilterMode === 'LP') { b0 = o * o / c; b1 = 2.0 * b0; b2 = b0; a1 = 2.0 * (o * o - 1.0) / c; a2 = (1.0 - q * o + o * o) / c; } 
    else if (currentFilterMode === 'HP') { b0 = 1 / c; b1 = -2.0 * b0; b2 = b0; a1 = 2.0 * (o * o - 1.0) / c; a2 = (1.0 - q * o + o * o) / c; } 
    else if (currentFilterMode === 'BP') {
        let lr = currentSampleRate / f2, hr = currentSampleRate / f1, lo = Math.tan(Math.PI / lr), ho = Math.tan(Math.PI / hr);
        let lc = 1 + q * lo + lo * lo, hc = 1 + q * ho + ho * ho;
        b0 = lo * lo / lc; b1 = 2 * b0; b2 = b0; a1 = 2 * (lo * lo - 1) / lc; a2 = (1 - q * lo + lo * lo) / lc;
        bp_b = [1 / hc, 0, -1 / hc]; bp_a = [2 * (ho * ho - 1) / hc, (1 - q * ho + ho * ho) / hc];
    }
}
function applyFilter(x) {
    if (currentFilterMode === 'RAW') return x;
    if (currentFilterMode === 'LP' || currentFilterMode === 'HP') {
        xv.push(x); if(xv.length>3) xv.shift(); yv.push(0); if(yv.length>3) yv.shift();
        let y = (b0 * xv[xv.length-1] + b1 * xv[xv.length-2] + b2 * xv[xv.length-3]) - (a1 * yv[yv.length-2] + a2 * yv[yv.length-3]);
        yv[yv.length-1] = y; return y;
    }
    if (currentFilterMode === 'BP') {
        xv.push(x); if(xv.length>3) xv.shift(); yv.push(0); if(yv.length>3) yv.shift();
        let y = (b0 * xv[xv.length-1] + b1 * xv[xv.length-2] + b2 * xv[xv.length-3]) - (a1 * yv[yv.length-2] + a2 * yv[yv.length-3]); yv[yv.length-1] = y;
        xv_bp.push(y); if(xv_bp.length>3) xv_bp.shift(); yv_bp.push(0); if(yv_bp.length>3) yv_bp.shift();
        let y_bp = (bp_b * xv_bp[xv_bp.length-1] + bp_b * xv_bp[xv_bp.length-2] + bp_b * xv_bp[xv_bp.length-3]) - (bp_a * yv_bp[yv_bp.length-2] + bp_a * yv_bp[yv_bp.length-3]);
        yv_bp[yv_bp.length-1] = y_bp; return y_bp;
    }
    return x;
}
const fModes = { RAW: 'filterRaw', LP: 'filterLP', HP: 'filterHP', BP: 'filterBP' };
Object.keys(fModes).forEach(m => {
    document.getElementById(fModes[m]).addEventListener('click', () => {
        Object.keys(fModes).forEach(k => document.getElementById(fModes[k]).classList.remove('active'));
        document.getElementById(fModes[m]).classList.add('active'); currentFilterMode = m; updateFilterCoefficients();
    });
});
document.getElementById('freq1Slider').addEventListener('input', (e) => { f1 = parseInt(e.target.value); document.getElementById('freq1Val').innerText = f1 + " Hz"; updateFilterCoefficients(); });
document.getElementById('freq2Slider').addEventListener('input', (e) => { f2 = parseInt(e.target.value); document.getElementById('freq2Val').innerText = f2 + " Hz"; updateFilterCoefficients(); });
document.getElementById('connectBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    try {
        const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [S_UUID] }] });
        status.innerText = "GATT 連線中..."; const server = await device.gatt.connect(), service = await server.getPrimaryService(S_UUID);
        bleCharacteristicObject = await service.getCharacteristic(C_UUID); status.innerText = "▶️ 藍牙與硬體雙向開通成功！";
        document.getElementById('boardSampleSlider').disabled = false; document.getElementById('boardSinSlider').disabled = false;
        await bleCharacteristicObject.startNotifications();
        bleCharacteristicObject.addEventListener('characteristicvaluechanged', (e) => {
            try {
                let view = e.target.value, len = view.byteLength / 4, audioChunk = new Float32Array(len);
                for (let i = 0; i < len; i++) { audioChunk[i] = view.getFloat32(i * 4, true); }
                for (let i = 0; i < audioChunk.length; i++) {
                    let val = audioChunk[i], filteredVal = applyFilter(val); audioChunk[i] = filteredVal;
                    filteredDataLog.push(filteredVal); if (filteredDataLog.length > 600) filteredDataLog.shift();
                    analysisBuffer[bufferIndex] = filteredVal; bufferIndex = (bufferIndex + 1) % FFT_SIZE;
                }
                if (isSpeakerOn && audioCtx) {
                    if (audioCtx.state === 'suspended') audioCtx.resume();
                    let ab = audioCtx.createBuffer(1, audioChunk.length, currentSampleRate);
                    ab.getChannelData(0).set(audioChunk); let src = audioCtx.createBufferSource(); src.buffer = ab; src.connect(gainNode); src.start();
                }
            } catch (err) {}
        });
        status.innerText = "▶️ 示波器數據接收中..."
    } catch (err) { status.innerText = "連線失敗: " + err.message; }
});
function resize() { tCanvas.width = tCanvas.clientWidth; tCanvas.height = tCanvas.clientHeight; fCanvas.width = fCanvas.clientWidth; fCanvas.height = fCanvas.clientHeight; }
window.addEventListener('resize', resize); resize();
function renderLoop() {
    requestAnimationFrame(renderLoop); if (filteredDataLog.length < 2) return;
    let recentPoints = filteredDataLog.slice(-150);
    let max = Math.max(...recentPoints), min = Math.min(...recentPoints), vpp = max - min, sumSquares = 0;
    recentPoints.forEach(v => sumSquares += v * v); let rms = Math.sqrt(sumSquares / recentPoints.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    let fftInput = []; for (let i = 0; i < FFT_SIZE; i++) { let idx = (bufferIndex + i) % FFT_SIZE; fftInput.push(analysisBuffer[idx] * (0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE-1))))); }
    let fftResult = math.fft(fftInput);
    let magnitudes = new Float32Array(FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
    for (let i = 0; i < FFT_SIZE / 2; i++) { let c = fftResult[i]; magnitudes[i] = Math.sqrt(c.re * c.re + c.im * c.im) / (FFT_SIZE / 2); if (i > 1 && magnitudes[i] > maxMag) { maxMag = magnitudes[i]; maxIdx = i; } }
    let peakFreq = maxIdx * (currentSampleRate / FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    tCtx.fillStyle = '#111'; tCtx.fillRect(0, 0, tCanvas.width, tCanvas.height); tCtx.strokeStyle = '#00ff66'; tCtx.lineWidth = 2.5; tCtx.beginPath();
    let tSlice = tCanvas.width / (recentPoints.length - 1);
    for (let i = 0; i < recentPoints.length; i++) { let x = i * tSlice, y = (tCanvas.height / 2) - (recentPoints[i] * (tCanvas.height / 2.5)); if (i == 0) tCtx.moveTo(x, y); else tCtx.lineTo(x, y); }
    tCtx.stroke();
    fCtx.fillStyle = '#111'; fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height); fCtx.strokeStyle = '#ffad00'; fCtx.lineWidth = 1.5; fCtx.beginPath();
    let fSlice = fCanvas.width / (FFT_SIZE / 4);
    for (let i = 0; i < FFT_SIZE / 4; i++) { let x = i * fSlice, y = fCanvas.height - (magnitudes[i] * fCanvas.height * 4); if (i == 0) fCtx.moveTo(x, y); else fCtx.lineTo(x, y); }
    fCtx.stroke();
}
requestAnimationFrame(renderLoop); updateFilterCoefficients();
