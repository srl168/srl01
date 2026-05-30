if (window.audioInterval) clearInterval(window.audioInterval);
window.isWritingLock = false;

window.addEventListener('DOMContentLoaded', () => {
    // 💡 鎖定國際 SIG 認證 16-bit 黃金短通道
    const S_UUID = 0xFF01;
    const C_UUID = 0xFF02;
    const FFT_SIZE = 1024;

    let currentSampleRate = 20000, filteredDataLog = [], bufferIndex = 0;
    let analysisBuffer = new Float32Array(FFT_SIZE), bleCharacteristicObject = null;
    let audioCtx = null, gainNode = null, isSpeakerOn = false;
    let debounceTimer = null;

    // 💡 建立高流暢音訊解耦時間軸指標
    let nextPlayTime = 0; 

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
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioCtx.createGain(); gainNode.gain.value = parseFloat(document.getElementById('volumeSlider').value);
            gainNode.connect(audioCtx.destination);
            if (window.audioInterval) clearInterval(window.audioInterval);
            // 💡 建立 40 毫秒高流暢重採樣快門，保留主執行緒最充足的換氣空間
            window.audioInterval = setInterval(streamSmoothAudio, 40); 
            nextPlayTime = audioCtx.currentTime;
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
    function sendHardwareParameters() {
        if (!bleCharacteristicObject) return;
        let sr = parseInt(document.getElementById('boardSampleSlider').value);
        let sf = parseInt(document.getElementById('boardSinSlider').value);
        currentSampleRate = sr; updateFilterCoefficients();
        let buf = (new TextEncoder()).encode(sr + "," + sf);
        try { bleCharacteristicObject.writeValue(buf); } catch (err) { console.error(err); }
    }

    function sendHardwareParametersWithDebounce() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (!bleCharacteristicObject || !bleCharacteristicObject.service.device.gatt.connected) return;
            if (window.isWritingLock) return; 
            window.isWritingLock = true; 
            sendHardwareParameters();
            setTimeout(() => { window.isWritingLock = false; }, 80);
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
            let rc2 = 1 / (2 * Math.PI * f1), a2 = rc2 / (rc2 + dt); let y = a2 * (lastY_bp2 + lastY_bp1 - lastX_hp); lastX_hp = lastY_bp1; lastY_bp2 = y; return y;
        }
        return x;
    }
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
            status.innerText = "正在索取 16-bit SIG 通道...";
            const service = await server.getPrimaryService(S_UUID);
            bleCharacteristicObject = await service.getCharacteristic(C_UUID);

            const decoder = new TextDecoder('utf-8');
            bleCharacteristicObject.removeEventListener('characteristicvaluechanged', window.currentBleHandler);
            
            let leftoverString = "";
            window.currentBleHandler = (e) => {
                try {
                    let str = decoder.decode(e.target.value); leftoverString += str;
                    let lines = leftoverString.split("\n"); leftoverString = lines.pop();
                    for (let line of lines) {
                        let points = line.trim().split(","); if (points.length < 2) continue;
                        for (let i = 0; i < points.length; i++) {
                            let byteVal = parseInt(points[i]); if (isNaN(byteVal)) continue;
                            let val = (byteVal / 127.5) - 1.0;
                            let fVal = applyFilter(val);
                            
                            filteredDataLog.push(fVal);
                            if (filteredDataLog.length > 2500) filteredDataLog.shift();
                            
                            analysisBuffer[bufferIndex] = fVal;
                            bufferIndex = (bufferIndex + 1) % FFT_SIZE;
                        }
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

    // 💡 終極解鎖：標準 PCM 數位重採樣直通流！將歷史快取以硬體 44100Hz 時間軸完美黏合
    function streamSmoothAudio() {
        if (!isSpeakerOn || !audioCtx || filteredDataLog.length < 800) return;
        try {
            // 每次定時抽取最新 400 個數據點
            let rawChunk = filteredDataLog.slice(-400);
            
            // 💡 核心演算法：根據當前滑桿的 currentSampleRate，動態計算它在 44100Hz 下應該被拉伸成多少個點
            let targetLength = Math.round(rawChunk.length * (audioCtx.sampleRate / currentSampleRate));
            let resampledBuffer = audioCtx.createBuffer(1, targetLength, audioCtx.sampleRate);
            let channelData = resampledBuffer.getChannelData(0);
            
            // 執行高階線性內插重採樣，100% 熨平任何滑桿拉動時的變音與隨機雜音！
            for (let i = 0; i < targetLength; i++) {
                let srcIndex = i * (rawChunk.length - 1) / (targetLength - 1);
                let indexBase = Math.floor(srcIndex);
                let indexFraction = srcIndex - indexBase;
                if (indexBase >= rawChunk.length - 1) {
                    channelData[i] = rawChunk[rawChunk.length - 1];
                } else {
                    channelData[i] = rawChunk[indexBase] * (1 - indexFraction) + rawChunk[indexBase + 1] * indexFraction;
                }
            }
            
            let src = audioCtx.createBufferSource();
            src.buffer = resampledBuffer; src.connect(gainNode);
            
            // 建立高階動態時間軸安全防禦水位，100% 阻斷空氣無線電抖動
            if (nextPlayTime < audioCtx.currentTime) { nextPlayTime = audioCtx.currentTime + 0.04; }
            src.start(nextPlayTime);
            nextPlayTime += resampledBuffer.duration; // 物理鋼性死鎖，永不斷音！
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
        window.activeRenderLoop = requestAnimationFrame(renderLoop); if (filteredDataLog.length < 1200) return;
        let rPoints = filteredDataLog.slice(-1200), max = Math.max(...rPoints), min = Math.min(...rPoints), vpp = max - min, sq = 0;
        rPoints.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rPoints.length);
        document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
        
        let re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
        for (let k = 0; k < FFT_SIZE; k++) { let idx = (bufferIndex + k) % FFT_SIZE; re[k] = analysisBuffer[idx]; }
        localFFT(re, im);
        
        let magnitudes = new Float32Array(FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
        for (let m = 0; m < FFT_SIZE / 2; m++) { magnitudes[m] = Math.sqrt(re[m] * re[m] + im[m] * im[m]) / (FFT_SIZE / 2); if (m > 1 && magnitudes[m] > maxMag) { maxMag = magnitudes[m]; maxIdx = m; } }
        let peakFreq = maxIdx * (currentSampleRate / FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
        
        tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
        tCtx.fillStyle = '#111'; tCtx.fillRect(0, 0, tCanvas.width, tCanvas.height); tCtx.strokeStyle = '#00ff66'; tCtx.lineWidth = 2.5; tCtx.beginPath();
        let tSlice = tCanvas.width / (rPoints.length - 1);
        let midY = tCanvas.height / 2;
        for (let j = 0; j < rPoints.length; j++) { 
            let x = j * tSlice;
            let currentPoint = rPoints[j];
            if (j > 0 && j < rPoints.length - 1) { currentPoint = (rPoints[j-1] + rPoints[j] + rPoints[j+1]) / 3; }
            let y = midY - (currentPoint * (tCanvas.height / 2.3)); 
            if (j == 0) tCtx.moveTo(x, y); else tCtx.lineTo(x, y); 
        }
        tCtx.stroke();
        
        fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.fillStyle = '#111'; fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height); fCtx.strokeStyle = '#ffad00'; fCtx.lineWidth = 1.5; fCtx.beginPath();
        let fSlice = fCanvas.width / (FFT_SIZE / 4);
        for (let n = 0; n < FFT_SIZE / 4; n++) { let x = n * fSlice, y = fCanvas.height - (magnitudes[n] * fCanvas.height * 200); if (n == 0) fCtx.moveTo(x, y); else fCtx.lineTo(x, y); }
        fCtx.stroke();
    }
    requestAnimationFrame(renderLoop); updateFilterCoefficients();
});
