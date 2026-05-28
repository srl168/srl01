window.addEventListener('DOMContentLoaded', () => {
    const S_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c3318888'.toLowerCase();
    const C_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'.toLowerCase();
    const FFT_SIZE = 1024;

    let currentSampleRate = 20000, filteredDataLog = [], bufferIndex = 0;
    let analysisBuffer = new Float32Array(FFT_SIZE), bleCharacteristicObject = null;
    let audioCtx = null, gainNode = null, isSpeakerOn = false;

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
        let buf = (new TextEncoder()).encode(sr + "," + sf);
        try { await bleCharacteristicObject.writeValue(buf); } catch (err) { console.error(err); }
    }
    ['boardSampleSlider', 'boardSinSlider'].forEach(id => {
        let el = document.getElementById(id), txt = document.getElementById(id.replace('Slider', 'Val'));
        el.addEventListener('input', (e) => { txt.innerText = e.target.value + " Hz"; });
        el.addEventListener('change', () => { sendHardwareParameters(); });
    });

    function applyFilter(x) {
        if (currentFilterMode === 'RAW') return x;
        let dt = 1 / currentSampleRate;
        if (currentFilterMode === 'LP') { let rc = 1 / (2 * Math.PI * f1), alpha = dt / (rc + dt); lastY_lp = lastY_lp + alpha * (x - lastY_lp); return lastY_lp; }
        if (currentFilterMode === 'HP') { let rc = 1 / (2 * Math.PI * f1), alpha = rc / (rc + dt); let y = alpha * (lastY_hp + x - lastX_hp); lastX_hp = x; lastY_hp = y; return y; }
        if (currentFilterMode === 'BP') {
            let rc1 = 1 / (2 * Math.PI * f2), a1 = dt / (rc1 + dt); lastY_bp1 = lastY_bp1 + a1 * (x - lastY_bp1);
            let rc2 = 1 / (2 * Math.PI * f1), a2 = rc2 / (rc2 + dt); let y = a2 * (lastY_bp2 + lastY_bp1 - lastX_bp2); lastX_bp2 = lastY_bp1; lastY_bp2 = y; return y;
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
            if (device.gatt.connected) { status.innerText = "發現衝突快取，進行強硬中斷重置..."; await device.gatt.disconnect(); await new Promise(r => setTimeout(r, 300)); }
            status.innerText = "GATT 實體通道硬開通中...";
            const server = await device.gatt.connect();
            status.innerText = "正在索取 Service 通道...";
            const service = await server.getPrimaryService(S_UUID);
            bleCharacteristicObject = await service.getCharacteristic(C_UUID);

            let leftoverString = ""; const decoder = new TextDecoder('utf-8');
            bleCharacteristicObject.addEventListener('characteristicvaluechanged', (e) => {
                try {
                    let str = decoder.decode(e.target.value); leftoverString += str;
                    let lines = leftoverString.split("\n"); leftoverString = lines.pop();
                    for (let line of lines) {
                        let points = line.trim().split(","); if (points.length < 2) continue;
                        let audioChunk = new Float32Array(points.length);
                        for (let i = 0; i < points.length; i++) {
                            let cleanStr = points[i].replace(/[^0-9.-]/g, '');
                            let val = parseFloat(cleanStr); if (isNaN(val)) continue;
                            let fVal = applyFilter(val); audioChunk[i] = fVal;
                            filteredDataLog.push(fVal); if (filteredDataLog.length > 600) filteredDataLog.shift();
                            analysisBuffer[bufferIndex] = fVal; bufferIndex = (bufferIndex + 1) % FFT_SIZE;
                        }
                        if (isSpeakerOn && audioCtx && audioChunk.some(v => v !== 0)) {
                            if (audioCtx.state === 'suspended') audioCtx.resume();
                            let ab = audioCtx.createBuffer(1, audioChunk.length, currentSampleRate); ab.getChannelData(0).set(audioChunk);
                            let src = audioCtx.createBufferSource(); src.buffer = ab; src.connect(gainNode); src.start();
                        }
                    }
                } catch (err) {}
            });
            await bleCharacteristicObject.startNotifications();
            status.innerText = "正在發射破冰訊號強行激活實體電波...";
            await bleCharacteristicObject.writeValue((new TextEncoder()).encode("WAKEUP\n"));
            status.innerText = "▶️ 藍牙與硬體雙向實體成功扣上！";
            document.getElementById('boardSampleSlider').disabled = false; document.getElementById('boardSinSlider').disabled = false;
        } catch (err) { status.innerText = "底層連線失敗: " + err.message; }
    });

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

    function resize() { tCanvas.width = tCanvas.clientWidth; tCanvas.height = tCanvas.clientHeight; fCanvas.width = fCanvas.clientWidth; fCanvas.height = fCanvas.clientHeight; }
    window.addEventListener('resize', resize); resize();

    function renderLoop() {
        requestAnimationFrame(renderLoop); if (filteredDataLog.length < 150) return;
        let rPoints = filteredDataLog.slice(-150), max = Math.max(...rPoints), min = Math.min(...rPoints), vpp = max - min, sq = 0;
        rPoints.forEach(v => sq += v * v); let rms = Math.sqrt(sq / rPoints.length);
        document.getElementById('vppVal').innerText = vpp.toFixed(2) + " V"; document.getElementById('rmsVal').innerText = rms.toFixed(2) + " V";
        
        let re = new Float32Array(FFT_SIZE), im = new Float32Array(FFT_SIZE);
        for (let i = 0; i < FFT_SIZE; i++) { let idx = (bufferIndex + i) % FFT_SIZE; re[i] = analysisBuffer[idx]; }
        localFFT(re, im);
        
        let magnitudes = new Float32Array(FFT_SIZE / 2), maxMag = 0, maxIdx = 0;
        for (let i = 0; i < FFT_SIZE / 2; i++) { magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / (FFT_SIZE / 2); if (i > 1 && magnitudes[i] > maxMag) { maxMag = magnitudes[i]; maxIdx = i; } }
        let peakFreq = maxIdx * (currentSampleRate / FFT_SIZE); document.getElementById('freqVal').innerText = maxMag > 0.04 ? peakFreq.toFixed(1) + " Hz" : "0.0 Hz";
        
        tCtx.fillStyle = '#111'; tCtx.fillRect(0, 0, tCanvas.width, tCanvas.height); tCtx.strokeStyle = '#00ff66'; tCtx.lineWidth = 2.5; tCtx.beginPath();
        let tSlice = tCanvas.width / (rPoints.length - 1);
        
        // 💡 終極解鎖補丁：改用穩固的工業級有源直通放大器，徹底消滅 NaN 與運算元斷句卡死
        let midY = tCanvas.height / 2;
        for (let i = 0; i < rPoints.length; i++) { 
            let x = i * tSlice;
            let y = midY - (rPoints[i] * (tCanvas.height / 2.5)); // RAW 直通映射
            if (i == 0) tCtx.moveTo(x, y); else tCtx.lineTo(x, y); 
        }
        tCtx.stroke();
        
        fCtx.fillStyle = '#111'; fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height); fCtx.strokeStyle = '#ffad00'; fCtx.lineWidth = 1.5; fCtx.beginPath();
        let fSlice = fCanvas.width / (FFT_SIZE / 4);
        for (let i = 0; i < FFT_SIZE / 4; i++) { let x = i * fSlice, y = fCanvas.height - (magnitudes[i] * fCanvas.height * 200); if (i == 0) fCtx.moveTo(x, y); else fCtx.lineTo(x, y); }
        fCtx.stroke();
    }
    requestAnimationFrame(renderLoop); updateFilterCoefficients();
});
