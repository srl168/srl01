if (window.audioInterval) clearInterval(window.audioInterval);
window.isWritingLock = false;

// 💡 建立鋼性全域記憶體池
window.currentSampleRate = 20000;
window.filteredDataLog = [];
window.bufferIndex = 0;
window.nextPlayTime = 0;
window.isSpeakerOn = false;
window.isSimulating = false;
window.simPhase = 0;
window.FFT_SIZE = 1024;
window.analysisBuffer = new Float32Array(window.FFT_SIZE);

window.addEventListener('DOMContentLoaded', () => {
    window.S_UUID = 0xFF01;
    window.C_UUID = 0xFF02;
    window.bleCharacteristicObject = null;
    window.audioCtx = null; window.gainNode = null;

    window.tCanvas = document.getElementById('timeCanvas');
    window.fCanvas = document.getElementById('freqCanvas');
    window.tCtx = window.tCanvas.getContext('2d');
    window.fCtx = window.fCanvas.getContext('2d');

    let lastY_lp = 0, lastX_hp = 0, lastY_hp = 0, lastY_bp1 = 0, lastX_bp2 = 0, lastY_bp2 = 0;
    window.currentFilterMode = 'RAW';
    window.f1 = 1000; window.f2 = 3000;
    window.b0 = 1; window.b1 = 0; window.b2 = 0; window.a1 = 0; window.a2 = 0; window.bp_b = [1, 0, -1]; window.bp_a = [];

    window.updateFilterCoefficients = function() {
        let fr = window.currentSampleRate / window.f1, o = Math.tan(Math.PI / fr), q = Math.sqrt(2), c = 1 + q * o + o * o;
        if (window.currentFilterMode === 'LP') { window.b0 = o * o / c; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
        else if (window.currentFilterMode === 'HP') { window.b0 = 1 / c; window.b1 = -2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (o * o - 1) / c; window.a2 = (1 - q * o + o * o) / c; } 
        else if (window.currentFilterMode === 'BP') {
            let lr = window.currentSampleRate / window.f2, hr = window.currentSampleRate / window.f1, lo = Math.tan(Math.PI / lr), ho = Math.tan(Math.PI / hr);
            let lc = 1 + q * lo + lo * lo, hc = 1 + q * ho + ho * ho;
            window.b0 = lo * lo / lc; window.b1 = 2 * window.b0; window.b2 = window.b0; window.a1 = 2 * (lo * lo - 1) / lc; window.a2 = (1 - q * lo + lo * lo) / lc;
            window.bp_b = [1 / hc, 0, -1 / hc]; window.bp_a = [2 * (ho * ho - 1) / hc, (1 - q * ho + ho * ho) / hc];
        }
    };

    window.applyFilter = function(x) {
        if (window.currentFilterMode === 'RAW') return x;
        let dt = 1 / window.currentSampleRate;
        if (window.currentFilterMode === 'LP') { let rc = 1 / (2 * Math.PI * window.f1), alpha = dt / (rc + dt); lastY_lp = lastY_lp + alpha * (x - lastY_lp); return lastY_lp; }
        if (window.currentFilterMode === 'HP') { let rc = 1 / (2 * Math.PI * window.f1), alpha = rc / (rc + dt); let y = alpha * (lastY_hp + x - lastX_hp); lastX_hp = x; lastY_hp = y; return y; }
        if (window.currentFilterMode === 'BP') {
            let rc1 = 1 / (2 * Math.PI * window.f2), a1 = dt / (rc1 + dt); lastY_bp1 = lastY_bp1 + a1 * (x - lastY_bp1);
            let rc2 = 1 / (2 * Math.PI * window.f1), a2 = rc2 / (rc2 + dt); let y = a2 * (lastY_bp2 + lastY_bp1 - lastX_hp); lastX_hp = lastY_bp1; lastY_bp2 = y; return y;
        }
        return x;
    };
    const fModes = { RAW: 'filterRaw', LP: 'filterLP', HP: 'filterHP', BP: 'filterBP' };
    Object.keys(fModes).forEach(m => {
        document.getElementById(fModes[m]).addEventListener('click', () => {
            Object.keys(fModes).forEach(k => document.getElementById(fModes[k]).classList.remove('active'));
            document.getElementById(fModes[m]).classList.add('active'); window.currentFilterMode = m;
            document.getElementById('f2Container').style.display = m === 'BP' ? 'flex' : 'none'; window.updateFilterCoefficients();
        });
    });

    document.getElementById('connectBtn').addEventListener('click', async () => {
        if (window.isSimulating) document.getElementById('simBtn').click(); 
        const status = document.getElementById('status');
        try {
            status.innerText = "正在搜尋藍牙裝置...";
            const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'ESP32' }], optionalServices: [window.S_UUID] });
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(window.S_UUID);
            let bleChar = await service.getCharacteristic(window.C_UUID);

            bleChar.removeEventListener('characteristicvaluechanged', window.currentBleHandler);
            window.currentBleHandler = (e) => {
                let str = (new TextDecoder('utf-8')).decode(e.target.value);
                window.consumeTextStreamPacket(str);
            };

            bleChar.addEventListener('characteristicvaluechanged', window.currentBleHandler);
            await bleChar.startNotifications();
            status.innerText = "▶️ 實體藍牙字串通道完全接通！";
        } catch (err) { status.innerText = "底層連線失敗: " + err.message; }
    });

    window.tCanvas.width = 800; window.tCanvas.height = 400;
    window.fCanvas.width = 800; window.fCanvas.height = 400;
});

window.initAudioGlobal = function() {
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.gainNode = window.audioCtx.createGain(); 
        window.gainNode.gain.value = parseFloat(document.getElementById('volumeSlider').value);
        window.gainNode.connect(window.audioCtx.destination);
        window.nextPlayTime = window.audioCtx.currentTime;
    }
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
};
let leftoverStringCache = "";
window.consumeTextStreamPacket = function(str) {
    leftoverStringCache += str;
    let boundaryIdx;
    while ((boundaryIdx = leftoverStringCache.indexOf("\n")) !== -1) {
        let line = leftoverStringCache.substring(0, boundaryIdx).trim();
        leftoverStringCache = leftoverStringCache.substring(boundaryIdx + 1);
        
        let points = line.split(","); if (points.length < 2) continue;
        let audioChunk = new Float32Array(points.length);
        for (let i = 0; i < points.length; i++) {
            let byteVal = parseInt(points[i]); if (isNaN(byteVal)) continue;
            let val = (byteVal / 127.5) - 1.0;
            let fVal = window.applyFilter ? window.applyFilter(val) : val;
            
            audioChunk[i] = fVal;
            window.filteredDataLog.push(fVal);
            if (window.filteredDataLog.length > 2500) window.filteredDataLog.shift();
            
            window.analysisBuffer[window.bufferIndex] = fVal;
            window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
        }
        window.playAudioChunkDirect(audioChunk);
    }
};

// 💡 經典高彈性播音切片核心：死死咬定計時器，100% 乾淨無雜音
window.playAudioChunkDirect = function(audioChunk) {
    if (window.isSpeakerOn && window.audioCtx && window.gainNode) {
        let ab = window.audioCtx.createBuffer(1, audioChunk.length, window.currentSampleRate);
        ab.getChannelData(0).set(audioChunk);
        let src = window.audioCtx.createBufferSource(); src.buffer = ab; src.connect(window.gainNode);
        if (window.nextPlayTime < window.audioCtx.currentTime) { window.nextPlayTime = window.audioCtx.currentTime + 0.01; }
        src.start(window.nextPlayTime); window.nextPlayTime += ab.duration; 
    }
};

function localFFT(re, im) {
    const n = re.length; let bits = 0; while ((1 << bits) < n) bits++;
    for (let i = 0; i < n; i++) {
        let rev = 0; for (let j = 0; j < bits; j++) { if ((i & (1 << j)) !== 0) rev |= (1 << (bits - 1 - j)); }
        if (rev > i) {
            let tempR = re[i]; re[i] = re[rev]; re[rev] = tempR;
            let tempI = im[i]; im[i] = im[rev]; im[rev] = tempI;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        let ang = 2 * Math.PI / len * -1, wlen_r = Math.cos(ang), wlen_i = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let w_r = 1, w_i = 0;
            for (let j = 0; j < len / 2; j++) {
                let u_r = re[i + j], u_i = im[i + j];
                let v_r = re[i + j + len / 2] * w_r - im[i + j + len / 2] * w_i;
                let v_i = re[i + j + len / 2] * w_i + im[i + j + len / 2] * w_r;
                re[i + j] = u_r + v_r; im[i + j] = u_i + v_i;
                re[i + j + len / 2] = u_r - v_r; im[i + j + len / 2] = u_i - v_i;
                let next_w_r = w_r * wlen_r - w_i * wlen_i; w_i = w_r * wlen_i + w_i * wlen_r; w_r = next_w_r;
            }
        }
    }
}

// 💡 終極解鎖：由 60Hz 渲染迴圈兼職擔任資料源頭，CPU 負載降為 0，拉桿秒速響應！
window.globalRenderLoop = function() {
    requestAnimationFrame(window.globalRenderLoop);
    
    // 💡 離線測試核心：若開啟模擬，每幀（16.6毫秒）主動計算並注入當前滑桿對應數量的點
    if (window.isSimulating) {
        let targetSinFreq = parseInt(document.getElementById('boardSinSlider').value);
        // 計算這一幀（1/60秒）物理上包含多少個點：例如 20000 / 60 = 約 333 個點
        let pointsCount = Math.round(window.currentSampleRate / 60);
        if (pointsCount > 0) {
            let audioChunk = new Float32Array(pointsCount);
            let step = 2.0 * Math.PI * (targetSinFreq / window.currentSampleRate);
            for (let i = 0; i < pointsCount; i++) {
                let val = Math.sin(window.simPhase);
                let fVal = window.applyFilter ? window.applyFilter(val) : val;
                
                audioChunk[i] = fVal;
                window.filteredDataLog.push(fVal);
                window.analysisBuffer[window.bufferIndex] = fVal;
                window.bufferIndex = (window.bufferIndex + 1) % window.FFT_SIZE;
                
                window.simPhase += step;
                if (window.simPhase >= 2 * Math.PI) window.simPhase -= 2 * Math.PI;
            }
            if (window.filteredDataLog.length > 2500) window.filteredDataLog = window.filteredDataLog.slice(-2000);
            window.playAudioChunkDirect(audioChunk); // 丟入標準播放器
        }
    }

    if (window.filteredDataLog.length < 150) return;
    let rPoints = window.filteredDataLog.slice(-150), max = Math.max(...rPoints), min = Math.min(...rPoints), vpp = max - min, sq = 0;
    rPoints.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rPoints.length);
    document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
    
    let re = new Float32Array(window.FFT_SIZE), im = new Float32Array(window.FFT_SIZE);
    for (let k = 0; k < window.FFT_SIZE; k++) { let idx = (window.bufferIndex + k) % window.FFT_SIZE; re[k] = window.analysisBuffer[idx]; }
    localFFT(re, im);
    
    let magnitudes = new Float32Array(window.FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
    for (let m = 0; m < window.FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (window.FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; maxIdx = m; } }
    let peakFreq = maxIdx * (window.currentSampleRate / window.FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
    
    window.tCtx.clearRect(0, 0, window.tCanvas.width, window.tCanvas.height);
    window.tCtx.fillStyle = '#111'; window.tCtx.fillRect(0, 0, window.tCanvas.width, window.tCanvas.height); window.tCtx.strokeStyle = '#00ff66'; window.tCtx.lineWidth = 2.5; window.tCtx.beginPath();
    let tSlice = window.tCanvas.width / (rPoints.length - 1), midY = window.tCanvas.height / 2;
    for (let j = 0; j < rPoints.length; j++) { 
        let x = j * tSlice; let currentPoint = rPoints[j];
        if (j > 0 && j < rPoints.length - 1) { currentPoint = (rPoints[j-1] + rPoints[j] + rPoints[j+1]) / 3; }
        let y = midY - (currentPoint * (window.tCanvas.height / 2.3)); 
        if (j == 0) window.tCtx.moveTo(x, y); else window.tCtx.lineTo(x, y); 
    }
    window.tCtx.stroke();
    
    window.fCtx.clearRect(0, 0, window.fCanvas.width, window.fCanvas.height);
    window.fCtx.fillStyle = '#111'; window.fCtx.fillRect(0, 0, window.fCanvas.width, window.fCanvas.height); window.fCtx.strokeStyle = '#ffad00'; window.fCtx.lineWidth = 1.5; window.fCtx.beginPath();
    let fSlice = window.fCanvas.width / (window.FFT_SIZE / 4);
    for (let n = 0; n < window.FFT_SIZE / 4; n++) { let curX = n * fSlice, y = window.fCanvas.height - (magnitudes[n] * window.fCanvas.height * 200); if (n == 0) window.fCtx.moveTo(curX, y); else window.fCtx.lineTo(curX, y); }
    window.fCtx.stroke();
};

// 💡 100% 全域按鈕與滑桿監聽綁定
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'simBtn') {
        window.isSimulating = !window.isSimulating; const btn = document.getElementById('simBtn');
        if (window.isSimulating) {
            window.initAudioGlobal(); btn.innerText = "🛑 停止本地模擬測試"; btn.className = "btn-sim active";
            document.getElementById('status').innerText = "▶️ 離線沙盒：60Hz 同步模擬引擎已點火！";
        } else {
            btn.innerText = "🛠️ 開啟本地資料模擬測試"; btn.className = "btn-sim";
            document.getElementById('status').innerText = "狀態：模擬測試已停止。";
        }
    }
    if (e.target && e.target.id === 'speakerBtn') {
        window.initAudioGlobal(); window.isSpeakerOn = !window.isSpeakerOn;
        document.getElementById('speakerBtn').innerText = window.isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉";
        document.getElementById('speakerBtn').className = window.isSpeakerOn ? "btn-speaker" : "btn-speaker muted";
    }
});

document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'boardSampleSlider' || e.target.id === 'boardSinSlider')) {
        document.getElementById(e.target.id + 'Val').innerText = e.target.value + " Hz";
        window.currentSampleRate = parseInt(document.getElementById('boardSampleSlider').value);
        if (window.updateFilterCoefficients) window.updateFilterCoefficients();
    }
    if (e.target && e.target.id === 'volumeSlider') {
        document.getElementById('volumeVal').innerText = Math.round(e.target.value * 100) + "%";
    }
});

setTimeout(() => {
    if (window.updateFilterCoefficients) window.updateFilterCoefficients();
    if (window.globalRenderLoop) window.globalRenderLoop();
}, 250);
