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
document.getElementById('connectBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    try {
        const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [S_UUID] }] });
        status.innerText = "GATT 連線中..."; 
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(S_UUID);
        bleCharacteristicObject = await service.getCharacteristic(C_UUID); 
        
        // 💡 終極解鎖補丁：連線後立刻主動讀取一次加密特徵值，強迫作業系統與網頁「動態對齊密碼金鑰」
        status.innerText = "正在進行安全金鑰校驗 (請在系統彈出視窗輸入密碼：123455)...";
        await bleCharacteristicObject.readValue();
        
        status.innerText = "▶️ 藍牙與實體硬體雙向開通成功！";
        document.getElementById('boardSampleSlider').disabled = false; 
        document.getElementById('boardSinSlider').disabled = false;
        
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
