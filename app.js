if (window.audioPlaybackInterval) clearInterval(window.audioPlaybackInterval);
window.audioPlaybackBuffer = [];
window.isWritingLock = false;

window.addEventListener('DOMContentLoaded', () => {
    const S_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c3318888'.toLowerCase();
    const C_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'.toLowerCase();
    const FFT_SIZE = 1024;

    // 💡 核心解鎖：不論板子硬體多高頻，網頁喇叭發聲一律鎖定在 44100Hz 國際標準音訊池，彻底消滅變調雙音與破音！
    const AUDIO_OUTPUT_RATE = 44100; 

    let currentSampleRate = 20000, filteredDataLog = [], bufferIndex = 0;
    let analysisBuffer = new Float32Array(FFT_SIZE), bleCharacteristicObject = null;
    let audioCtx = null, gainNode = null, isSpeakerOn = false;
    let debounceTimer = null;

    const tCanvas = document.getElementById('timeCanvas'), fCanvas = document.getElementById('freqCanvas');
    const tCtx = tCanvas.getContext('2d'), fCtx = fCanvas.getContext('2d');

    let lastY_lp = 0, lastX_hp = 0, lastY_hp = 0, lastY_bp1 = 0, lastX_bp2 = 0, lastY_bp2 = 0;
    let currentFilterMode = 'RAW', f1 = 1000, f2 = 3000, b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, bp_b = [1, 0, -1], bp_a = [];

    function updateFilterCoefficients() {
        let fr = currentSampleRate / f1, o = Math.tan(Math.PI / fr), q = Math.sqrt(2), c = 1 + q * o + o * o;
        if (currentFilterMode === 'LP') { b0 = o * o / c; b1 = 2 * b0; b2 = b0; a1 = 2 * (o * o - 1) / c; a2 = (1 - q * o + o * o) / c; } 
        else if (currentFilterMode === 'HP') { b0 = 1 / c; b1 = -2 * b0; b2 = b0; a1 = 2 * (o * o - 1) / c; a2 = (1 - q * o + o * o) / c; } 
        else if (currentFilterMode === 'BP') {
            let lr = currentSampleRate / f2, hr = currentSampleRate / f1, lo = Math.tan(Math.PI / lr), ho = Math.tan(Math.PI / hr);
            let lc = 1 + q * lo + lo * lo, hc = 1 + q * ho + ho * ho;
            b0 = lo * lo / lc; b1 = 2 * b0; b2 = b0; a1 = 2 * (lo * lo - 1) / lc; a2 = (1 - q * lo + lo * lo) / lc;
            bp_b = [1 / hc, 0, -1 / hc]; bp_a = [2 * (ho * ho - 1) / hc, (1 - q * ho + ho * ho) / hc];
        }
    }

    function initAudio() {
        if (!audioCtx) {
            // 強制將 AudioContext 初始化在穩定的標準 44100Hz
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: AUDIO_OUTPUT_RATE });
            gainNode = audioCtx.createGain(); gainNode.gain.value = parseFloat(document.getElementById('volumeSlider').value);
            gainNode.connect(audioCtx.destination);
            
            if (window.audioPlaybackInterval) clearInterval(window.audioPlaybackInterval);
            window.audioPlaybackInterval = setInterval(playCachedAudio, 12); // 優化消費者時間至 12 毫秒
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    document.getElementById('speakerBtn').addEventListener('click', async () => {
        initAudio(); isSpeakerOn = !isSpeakerOn;
        document.getElementById('speakerBtn').innerText = isSpeakerOn ? "🔊 喇叭發聲：開啟" : "🔇 喇叭發聲：關閉";
        document.getElementById('speakerBtn').className = isSpeakerOn ? "btn-speaker" : "btn-speaker muted";
        if (!isSpeakerOn) window.audioPlaybackBuffer = [];
    });

    document.getElementById('volumeSlider').addEventListener('input', (e) => {
        let v = parseFloat(e.target.value); document.getElementById('volumeVal').innerText = Math.round(v * 100) + "%";
        if (gainNode) gainNode.gain.value = v;
    });

    function sendHardwareParametersWithDebounce() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            if (!bleCharacteristicObject || !bleCharacteristicObject.service.device.gatt.connected) return;
            if (window.isWritingLock) return; 
            
            window.isWritingLock = true; 
            let sr = parseInt(document.getElementById('boardSampleSlider').value);
            let sf = parseInt(document.getElementById('boardSinSlider').value);
            currentSampleRate = sr; updateFilterCoefficients();
            
            let buf = (new TextEncoder()).encode(sr + "," + sf);
            try { 
                await new Promise(r => setTimeout(r, 40)); // 擴大留白時間至 40 毫秒
                await bleCharacteristicObject.writeValue(buf); 
                document.getElementById('status').innerText = "▶️ 遠端硬體參數同步成功！";
            } catch (err) {
                console.log("晶片無線電避撞攔截...", err);
            } finally {
                setTimeout(() => { window.isWritingLock = false; }, 80);
            }
        }, 250); 
    }
    ['boardSampleSlider', 'boardSinSlider'].forEach(id => {
        let el = document.getElementById(id), txt = document.getElementById(id.replace('Slider', 'Val'));
        el.addEventListener('input', (e) => { 
            txt.innerText = e.target.value + " Hz"; 
            sendHardwareParametersWithDebounce(); 
        });
    });

    function applyFilter(x) {
        if (currentFilterMode === 'RAW') return x;
        let dt = 1 / currentSampleRate;
        if (currentFilterMode === 'LP') { let rc = 1 / (2 * Math.PI * f1), alpha = dt / (rc + dt); lastY_lp = lastY_lp + alpha * (x - lastY_lp); return lastY_lp; }
        if (currentFilterMode === 'HP') { let rc = 1 / (2 * Math.PI * f1), alpha = rc / (rc + dt); let y = alpha * (lastY_hp + x - lastX_hp); lastX_hp = x; lastY_hp = y; return y; }
        if (currentFilterMode === 'BP') {
            let rc1 = 1 / (2 * Math.PI * f2), a1 = dt / (rc1 + dt); lastY_bp1 = lastY_bp1 + a1 * (x - lastY_bp1);
            let rc2 = 1 / (2 * Math.PI * f1), a2 = rc2 / (rc2 + dt); let y = a2 * (lastY_bp2 + lastY_bp1 - lastX_bp2); lastX_hp = lastY_bp1; lastY_bp2 = y; return y;
        }
        return x;
    }

    const fModes = { RAW: 'filterRaw', LP: 'filterLP', HP: 'filterHP', BP: 'filterBP' };
    Object.keys(fModes).forEach(m => {
        document.getElementById(fModes[m]).addEventListener('click', () => {
            Object.keys(fModes).forEach(k => document.getElementById(fModes[k]).classList.remove('active'));
            document.getElementById(fModes[m]).classList.add('active'); currentFilterMode = m;
            document.getElementById('f2Container').style.display = m === 'BP' ? 'flex' : 'none'; updateFilterCoefficients();
        });
    });

    document.getElementById('freq1Slider').addEventListener('input', (e) => { f1 = parseInt(e.target.value); document.getElementById('freq1Val').innerText = f1 + " Hz"; updateFilterCoefficients(); });
    document.getElementById('freq2Slider').addEventListener('input', (e) => { f2 = parseInt(e.target.value); document.getElementById('freq2Val').innerText = f2 + " Hz"; updateFilterCoefficients(); });

    document.getElementById('connectBtn').addEventListener('click', async () => {
        const status = document.getElementById('status');
        try {
            status.innerText = "正在搜尋藍牙裝置...";
            const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'ESP32' }], optionalServices: [S_UUID] });
            if (device.gatt.connected || window.activeBleDevice) {
                status.innerText = "發現多重宇宙暫存，強制實體釋放中...";
                try { await device.gatt.disconnect(); if(window.activeBleDevice) await window.activeBleDevice.gatt.disconnect(); } catch(e){}
                await new Promise(r => setTimeout(r, 400));
            }
            window.activeBleDevice = device; 

            status.innerText = "GATT 實體通道硬開通中...";
            const server = await device.gatt.connect();
            status.innerText = "正在索取 Service 通道...";
            const service = await server.getPrimaryService(S_UUID);
            bleCharacteristicObject = await service.getCharacteristic(C_UUID);

            const decoder = new TextDecoder('utf-8');
            bleCharacteristicObject.removeEventListener('characteristicvaluechanged', window.currentBleHandler);
            
            window.currentBleHandler = (e) => {
                try {
                    let hexStr = decoder.decode(e.target.value).trim();
                    if (hexStr.length % 2 !== 0) return; 
                    let count = hexStr.length / 2;
                    
                    for (let i = 0; i < count; i++) {
                        let sub = hexStr.substring(i * 2, i * 2 + 2);
                        let byteVal = parseInt(sub, 16);
                        let val = (byteVal / 127.5) - 1.0;
                        let fVal = applyFilter(val);
                        
                        filteredDataLog.push(fVal);
                        if (filteredDataLog.length > 600) filteredDataLog.shift();
                        analysisBuffer[bufferIndex] = fVal;
                        bufferIndex = (bufferIndex + 1) % FFT_SIZE;
                        if (isSpeakerOn) window.audioPlaybackBuffer.push(fVal);
                    }
                } catch (err) {}
            };

            bleCharacteristicObject.addEventListener('characteristicvaluechanged', window.currentBleHandler);
            await bleCharacteristicObject.startNotifications();
            status.innerText = "正在發射破冰訊號強行激活實體電波...";
            await bleCharacteristicObject.writeValue((new TextEncoder()).encode("WAKEUP\n"));
            status.innerText = "▶️ 藍牙與硬體雙向實體成功扣上！";
            document.getElementById('boardSampleSlider').disabled = false; document.getElementById('boardSinSlider').disabled = false;
        } catch (err) { status.innerText = "底層連線失敗: " + err.message; }
    });

    // 💡 核心播放平滑升級：將定頻 44100Hz 播放核心與硬體解耦，徹底熨平雙音
    function playCachedAudio() {
        if (!isSpeakerOn || !audioCtx || window.audioPlaybackBuffer.length < 300) return;
        try {
            let chunk = new Float32Array(window.audioPlaybackBuffer.splice(0, 512));
            let ab = audioCtx.createBuffer(1, chunk.length, 44100); // 鎖死標準輸出率
            ab.getChannelData(0).set(chunk);
            let src = audioCtx.createBufferSource(); src.buffer = ab; src.connect(gainNode); src.start();
        } catch (e) {}
    }

    function localFFT(re, im) {
        const n = re.length; if (n <= 1) return;
        const reE = new Float32Array(n / 2), imE = new Float32Array(n/2), reO = new Float32Array(n / 2), imO = new Float32Array(n / 2);
        for (let i = 0; i < n / 2; i++) { reE[i] = re[2 * i]; imE[i] = im[2 * i]; reO[i] = re[2 * i + 1]; imO[i] = im[2 * i + 1]; }
        localFFT(reE, imE); localFFT(reO, imO);
        for (let i = 0; i < n / 2; i++) {
            const tr = Math.cos(-2 * Math.PI * i / n) * reO[i] - Math.sin(-2 * Math.PI * i / n) * imO[i];
            const tj = Math.sin(-2 * Math.PI * i / n) * reO[i] + Math.cos(-2 * Math.PI * i / n) * imO[i];
            re[i] = reE[i] + tr; im[i] = imE[i] + tj; re[i + n / 2] = reE[i] - tr; im[i + n / 2] = imE[i] - tj;
        }
    }

    tCanvas.width = 800; tCanvas.height = 400;
    fCanvas.width = 800; fCanvas.height = 400;

    if (window.activeRenderLoop) cancelAnimationFrame(window.activeRenderLoop);

    function renderLoop() {
        window.activeRenderLoop = requestAnimationFrame(renderLoop); if (filteredDataLog.length < 150) return;
        let rPoints = filteredDataLog.slice(-150), max = Math.max(...rPoints), min = Math.min(...rPoints), vpp = max - min, sq = 0;
        rPoints.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rPoints.length);
        document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
        
        let re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
        for (let i = 0; i < FFT_SIZE; i++) { let idx = (bufferIndex + i) % FFT_SIZE; re[i] = analysisBuffer[idx]; }
        localFFT(re, im);
        
        let magnitudes = new Float32Array(FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
        for (let i = 0; i < FFT_SIZE / 2; i++) { magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / (FFT_SIZE / 2); if (i > 1 && magnitudes[i] > maxMag) { maxMag = magnitudes[i]; maxIdx = i; } }
        let peakFreq = maxIdx * (currentSampleRate / FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
        
        tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
        tCtx.fillStyle = '#111'; tCtx.fillRect(0, 0, tCanvas.width, tCanvas.height); tCtx.strokeStyle = '#00ff66'; tCtx.lineWidth = 2.5; tCtx.beginPath();
        let tSlice = tCanvas.width / (rPoints.length - 1);
        
        let midY = tCanvas.height / 2;
        for (let i = 0; i < rPoints.length; i++) { 
            let x = i * tSlice;
            let currentPoint = rPoints[i];
            if (i > 0 && i < rPoints.length - 1) { currentPoint = (rPoints[i-1] + rPoints[i] + rPoints[i+1]) / 3; }
            let y = midY - (currentPoint * (tCanvas.height / 2.3)); 
            if (i == 0) tCtx.moveTo(x, y); else tCtx.lineTo(x, y); 
        }
        tCtx.stroke();
        
        fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.fillStyle = '#111'; fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height); fCtx.strokeStyle = '#ffad00'; fCtx.lineWidth = 1.5; fCtx.beginPath();
        let fSlice = fCanvas.width / (FFT_SIZE / 4);
        for (let i = 0; i < FFT_SIZE / 4; i++) { let x = i * fSlice, y = fCanvas.height - (magnitudes[i] * fCanvas.height * 200); if (i == 0) fCtx.moveTo(x, y); else fCtx.lineTo(x, y); }
        fCtx.stroke();
    }
    window.activeRenderLoop = requestAnimationFrame(renderLoop); updateFilterCoefficients();
});
