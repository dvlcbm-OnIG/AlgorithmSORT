const sortTypeSelect = document.getElementById('sortType');
const numbersInput = document.getElementById('numbers');
const maxIterationsInput = document.getElementById('maxIterations');
const speedInput = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');
const randomCountInput = document.getElementById('randomCount');
const columnCount = document.getElementById('columnCount');
const randomMinInput = document.getElementById('randomMin');
const randomMaxInput = document.getElementById('randomMax');
const generateBtn = document.getElementById('generateBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');

const iterationEl = document.getElementById('iteration');
const elapsedEl = document.getElementById('elapsed');
const lengthEl = document.getElementById('length');
const stateEl = document.getElementById('state');
const progressBar = document.getElementById('progressBar');
const badge = document.getElementById('badge');
const arrayView = document.getElementById('arrayView');
const logArea = document.getElementById('log');

let data = [];
let operations = 0;
let running = false;
let startTime = 0;
let audioCtx = null;
let barElements = [];
let speed = 1;

const clampColumnCount = (value) => Math.max(2, Math.min(1000, value));

const parseIntOrNull = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

const normalizeColumnCount = () => {
    const parsed = parseIntOrNull(randomCountInput.value);
    const count = clampColumnCount(parsed ?? 10);
    randomCountInput.value = count;
    columnCount.textContent = count;
    return count;
};

const parseNumbers = () => {
    const raw = numbersInput.value.trim();
    if (!raw) return [];
    return raw
        .split(/[ ,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
};

const generateRandomArray = () => {
    const count = normalizeColumnCount();
    const min = parseInt(randomMinInput.value) || 1;
    const max = parseInt(randomMaxInput.value) || 100;
    const actualMin = Math.min(min, max);
    const actualMax = Math.max(min, max);
    const randomNumbers = [];
    for (let i = 0; i < count; i++) {
        const randomNum = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;
        randomNumbers.push(randomNum);
    }
    numbersInput.value = randomNumbers.join(', ');
    log(`Generated ${count} columns with random numbers between ${actualMin} and ${actualMax}`);
    reset();
};

const computeRanks = (arr) => {
    if (!arr.length) return [];
    const sorted = arr
        .map((v, idx) => ({ v, idx }))
        .sort((a, b) => (a.v === b.v ? a.idx - b.idx : a.v - b.v));
    const buckets = new Map();
    sorted.forEach((item, i) => {
        if (!buckets.has(item.v)) buckets.set(item.v, []);
        buckets.get(item.v).push(i);
    });
    return arr.map((v) => buckets.get(v).shift());
};

const renderArray = (activeIndices = [], skipRecreate = false) => {
    if (!data.length) {
        arrayView.classList.add('empty');
        arrayView.textContent = 'No data to show';
        barElements = [];
        return;
    }

    arrayView.classList.remove('empty');
    const ranks = computeRanks(data);
    const maxRank = Math.max(1, data.length - 1);

    if (skipRecreate && barElements.length === data.length) {
        barElements.forEach((bar, idx) => {
            const rank = ranks[idx];
            const heightPct = data.length === 1 ? 100 : 20 + (80 * rank) / maxRank;
            const n = data[idx];
            const isPos = n >= 0;
            const gradientTop = isPos ? '#34d399' : '#fbbf24';
            const gradientBottom = isPos ? '#0ea5e9' : '#f97316';
            bar.style.height = `${heightPct}%`;
            bar.style.background = `linear-gradient(180deg, ${gradientTop}, ${gradientBottom})`;
            bar.style.order = idx;
            bar.style.position = 'relative';
            bar.querySelector('.value').textContent = n;
            bar.className = 'bar';
            if (n === 0) bar.classList.add('zero');
            if (activeIndices.includes(idx)) bar.classList.add('swapping');
        });
        return;
    }

    arrayView.innerHTML = '';
    barElements = data.map((n, idx) => {
        const rank = ranks[idx];
        const heightPct = data.length === 1 ? 100 : 20 + (80 * rank) / maxRank;
        const isPos = n >= 0;
        const gradientTop = isPos ? '#34d399' : '#fbbf24';
        const gradientBottom = isPos ? '#0ea5e9' : '#f97316';
        const bar = document.createElement('div');
        bar.className = 'bar';
        if (n === 0) bar.classList.add('zero');
        if (activeIndices.includes(idx)) bar.classList.add('swapping');
        bar.style.height = `${heightPct}%`;
        bar.style.background = `linear-gradient(180deg, ${gradientTop}, ${gradientBottom})`;
        bar.style.order = idx;
        const valueSpan = document.createElement('span');
        valueSpan.className = 'value';
        valueSpan.textContent = n;
        bar.appendChild(valueSpan);
        arrayView.appendChild(bar);
        return bar;
    });
};

const log = (message) => {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${message}`;
    logArea.textContent = `${entry}\n${logArea.textContent}`.trim().slice(0, 4000);
};

const updateStats = (status = 'Sorting') => {
    const maxOps = Number(maxIterationsInput.value) || 1;
    const elapsed = running ? performance.now() - startTime : 0;
    iterationEl.textContent = operations;
    elapsedEl.textContent = elapsed.toFixed(1);
    lengthEl.textContent = data.length;
    stateEl.textContent = status;
    const denom = Math.max(1, (data.length || 1) ** 2);
    const pct = Math.min(100, (operations / denom) * 100);
    progressBar.style.width = `${pct}%`;
};

const setBadge = (text, positive = false) => {
    badge.textContent = text;
    badge.style.borderColor = positive ? 'rgba(45, 212, 191, 0.55)' : 'rgba(245, 165, 36, 0.55)';
    badge.style.color = positive ? 'var(--accent-2)' : 'var(--accent)';
    badge.style.backgroundColor = positive ? 'rgba(45, 212, 191, 0.1)' : 'rgba(245, 165, 36, 0.1)';
};

const playSwapSound = (value) => {
    const vol = 0.12;
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = Ctx ? new Ctx() : null;
    }
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const norm = Math.tanh(value || 0);
    osc.type = 'square';
    osc.frequency.value = 220 + Math.abs(norm) * 320;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.12);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const animateSwap = async (idx1, idx2) => {
    if (!barElements[idx1] || !barElements[idx2]) return;
    barElements[idx1].classList.add('swapping');
    barElements[idx2].classList.add('swapping');
    const bar1Rect = barElements[idx1].getBoundingClientRect();
    const bar2Rect = barElements[idx2].getBoundingClientRect();
    const distance = bar2Rect.left - bar1Rect.left;
    barElements[idx1].style.transform = `translateX(${distance}px)`;
    barElements[idx2].style.transform = `translateX(${-distance}px)`;
    const animationDuration = 500 / speed;
    barElements[idx1].style.transition = `transform ${animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    barElements[idx2].style.transition = `transform ${animationDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    await sleep(animationDuration);
    [data[idx1], data[idx2]] = [data[idx2], data[idx1]];
    [barElements[idx1], barElements[idx2]] = [barElements[idx2], barElements[idx1]];
    barElements[idx1].style.transform = '';
    barElements[idx2].style.transform = '';
    barElements[idx1].style.transition = '';
    barElements[idx2].style.transition = '';
    renderArray([], true);
    barElements[idx1].classList.remove('swapping');
    barElements[idx2].classList.remove('swapping');
};

const stopRun = (reason = 'Stopped') => {
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setBadge(reason, reason === 'Sorted!');
    updateStats(reason);
};

const bubbleSortAnimate = async () => {
    const maxOps = Number(maxIterationsInput.value) || 1;
    const n = data.length;

    for (let i = 0; i < n - 1 && running; i++) {
        for (let j = 0; j < n - i - 1 && running; j++) {
            if (data[j] > data[j + 1]) {
                operations += 1;
                updateStats('Sorting');
                playSwapSound(data[j]);
                await animateSwap(j, j + 1);
                if (operations >= maxOps) {
                    log('Stopped: max operations reached');
                    stopRun('Capped');
                    return;
                }
            }
        }
    }

    if (running) {
        renderArray();
        log('Sorted via bubble sort');
        stopRun('Sorted!');
    }
};

const selectionSortAnimate = async () => {
    const maxOps = Number(maxIterationsInput.value) || 1;
    const n = data.length;

    for (let i = 0; i < n - 1 && running; i++) {
        let minIdx = i;
        for (let j = i + 1; j < n; j++) {
            if (data[j] < data[minIdx]) {
                minIdx = j;
            }
        }
        if (minIdx !== i) {
            operations += 1;
            updateStats('Sorting');
            playSwapSound(data[i]);
            await animateSwap(i, minIdx);
            if (operations >= maxOps) {
                log('Stopped: max operations reached');
                stopRun('Capped');
                return;
            }
        }
    }

    if (running) {
        renderArray();
        log('Sorted via selection sort');
        stopRun('Sorted!');
    }
};

const countingSortAnimate = async () => {
    const maxOps = Number(maxIterationsInput.value) || 1;
    let minVal = data[0];
    let maxVal = data[0];
    for (let i = 1; i < data.length; i++) {
        if (data[i] < minVal) minVal = data[i];
        if (data[i] > maxVal) maxVal = data[i];
    }
    const range = maxVal - minVal + 1;
    const count = new Array(range).fill(0);
    for (let i = 0; i < data.length && running; i++) {
        count[data[i] - minVal]++;
        operations += 1;
        renderArray([i], true);
        updateStats('Sorting');
        if (operations >= maxOps) {
            log('Stopped: max operations reached');
            stopRun('Capped');
            return;
        }
        await sleep(20 / speed);
    }
    for (let i = 1; i < count.length && running; i++) {
        count[i] += count[i - 1];
        await sleep(5 / speed);
    }
    const output = new Array(data.length);
    for (let i = data.length - 1; i >= 0 && running; i--) {
        const value = data[i];
        const idx = count[value - minVal] - 1;
        output[idx] = value;
        count[value - minVal]--;
        operations += 1;
        renderArray([idx], true);
        updateStats('Sorting');
        playSwapSound(value);
        if (operations >= maxOps) {
            log('Stopped: max operations reached');
            stopRun('Capped');
            return;
        }
        await sleep(30 / speed);
    }
    for (let i = 0; i < output.length; i++) {
        data[i] = output[i];
    }
    if (running) {
        renderArray();
        log('Sorted via counting sort');
        stopRun('Sorted!');
    }
};

const mergeSortAnimate = async () => {
    const maxOps = Number(maxIterationsInput.value) || 1;

    const merge = async (left, mid, right) => {
        const leftArr = data.slice(left, mid + 1);
        const rightArr = data.slice(mid + 1, right + 1);
        let i = 0, j = 0, k = left;

        while (i < leftArr.length && j < rightArr.length && running) {
            if (leftArr[i] <= rightArr[j]) {
                data[k] = leftArr[i];
                i++;
            } else {
                data[k] = rightArr[j];
                j++;
            }
            operations += 1;
            renderArray([k], true);
            updateStats('Sorting');
            playSwapSound(data[k]);
            if (operations >= maxOps) {
                log('Stopped: max operations reached');
                stopRun('Capped');
                return false;
            }
            k++;
            await sleep(80 / speed);
        }

        while (i < leftArr.length && running) {
            data[k] = leftArr[i];
            renderArray([k], true);
            i++;
            k++;
            await sleep(60 / speed);
        }

        while (j < rightArr.length && running) {
            data[k] = rightArr[j];
            renderArray([k], true);
            j++;
            k++;
            await sleep(60 / speed);
        }
        return true;
    };

    const mergeSortHelper = async (left, right) => {
        if (left >= right || !running) return true;
        const mid = Math.floor((left + right) / 2);
        if (!await mergeSortHelper(left, mid)) return false;
        if (!await mergeSortHelper(mid + 1, right)) return false;
        return await merge(left, mid, right);
    };

    await mergeSortHelper(0, data.length - 1);

    if (running) {
        renderArray();
        log('Sorted via merge sort');
        stopRun('Sorted!');
    }
};

const quickSortAnimate = async () => {
    const maxOps = Number(maxIterationsInput.value) || 1;
    const stack = [[0, data.length - 1]];

    while (stack.length && running) {
        const [low, high] = stack.pop();
        if (low >= high) continue;

        let i = low;
        let j = high;
        const pivotIdx = Math.floor((low + high) / 2);
        const pivot = data[pivotIdx];

        while (i <= j && running) {
            while (data[i] < pivot) i += 1;
            while (data[j] > pivot) j -= 1;
            if (i <= j) {
                if (i !== j) {
                    operations += 1;
                    updateStats('Sorting');
                    playSwapSound(data[i]);
                    await animateSwap(i, j);
                    if (operations >= maxOps) {
                        log('Stopped: max operations reached');
                        stopRun('Capped');
                        return;
                    }
                }
                i += 1;
                j -= 1;
            }
        }

        if (low < j) stack.push([low, j]);
        if (i < high) stack.push([i, high]);
    }

    if (running) {
        renderArray();
        log('Sorted via quick sort');
        stopRun('Sorted!');
    }
};

const start = async () => {
    data = parseNumbers();
    if (!data.length) {
        log('Enter at least one number.');
        setBadge('Need data');
        return;
    }

    operations = 0;
    running = true;
    startTime = performance.now();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setBadge('Sorting…');
    renderArray();
    updateStats('Sorting');
    const sortType = sortTypeSelect.value;
    const sortNames = {
        quick: 'quick sort',
        bubble: 'bubble sort',
        merge: 'merge sort',
        selection: 'selection sort',
        counting: 'counting sort'
    };
    log(`Starting ${sortNames[sortType]} with [${data.join(', ')}] (n=${data.length})`);
    switch (sortType) {
        case 'bubble':
            await bubbleSortAnimate();
            break;
        case 'merge':
            await mergeSortAnimate();
            break;
        case 'selection':
            await selectionSortAnimate();
            break;
        case 'counting':
            await countingSortAnimate();
            break;
        case 'quick':
        default:
            await quickSortAnimate();
            break;
    }
};

const reset = () => {
    data = parseNumbers();
    operations = 0;
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setBadge('Waiting…');
    renderArray();
    updateStats('Idle');
    log('Reset state');
};

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', () => {
    log('Stopped by user');
    stopRun('Paused');
});
resetBtn.addEventListener('click', reset);
generateBtn.addEventListener('click', generateRandomArray);

randomCountInput.addEventListener('input', () => {
    const parsed = parseIntOrNull(randomCountInput.value);
    if (parsed === null) {
        columnCount.textContent = '';
        return;
    }
    columnCount.textContent = clampColumnCount(parsed);
});

randomCountInput.addEventListener('blur', normalizeColumnCount);

speedInput.addEventListener('input', () => {
    speed = parseFloat(speedInput.value);
    speedValue.textContent = `${speed}x`;
});

sortTypeSelect.addEventListener('change', reset);
numbersInput.addEventListener('change', reset);
maxIterationsInput.addEventListener('change', reset);

normalizeColumnCount();
reset();
