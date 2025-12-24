<!doctype html>
<html lang="ar">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>لعبة المربعات الحمراء</title>
<style>
  body { font-family: system-ui, Arial; direction: rtl; padding: 16px; background:#f5f7fb; }
  .controls { display:flex; gap:12px; align-items:center; margin-bottom:12px; flex-wrap:wrap; }
  .btn { padding:8px 14px; border-radius:6px; border: none; cursor:pointer; background:#2563eb; color:white; font-weight:600; }
  .btn:disabled { opacity:0.5; cursor:not-allowed; }
  .difficulty { display:flex; gap:8px; align-items:center; }
  .game-area { position:relative; width:100%; max-width:720px; height:420px; margin-top:12px; background:linear-gradient(#fff,#eef3ff); border:2px solid #d7e2ff; border-radius:10px; overflow:hidden; }
  .red-square { position:absolute; width:64px; height:64px; background:#e11d48; border-radius:8px; display:flex; align-items:center; justify-content:center; color:white; font-weight:700; cursor:pointer; box-shadow:0 6px 12px rgba(0,0,0,0.12); user-select:none; }
  .hud { margin-top:10px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  .overlay { position:absolute; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:50; }
  .card { background:white; padding:18px; border-radius:10px; text-align:center; max-width:80%; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
  .result-img { max-width:280px; max-height:260px; display:block; margin:12px auto 0; border-radius:8px; }
  .small { font-size:14px; color:#333; }
  label { font-size:14px; }
</style>
</head>
<body>
  <h2>لعبة اضغط المربع الأحمر بسرعة</h2>

  <div class="controls">
    <div class="difficulty">
      <label>الصعوبة:</label>
      <label><input type="radio" name="diff" value="easy" checked> سهل</label>
      <label><input type="radio" name="diff" value="medium"> متوسط</label>
      <label><input type="radio" name="diff" value="hard"> صعب</label>
    </div>

    <button id="startBtn" class="btn">بدء</button>
    <button id="stopBtn" class="btn" disabled>إيقاف</button>

    <div class="small">ملاحظة: سيظهر مربع جديد كل ثانية. اضغط المربع قبل أن يختفي وإلا تخسر.</div>
  </div>

  <div class="game-area" id="gameArea" aria-live="polite"></div>

  <div class="hud">
    <div>المربعات الظاهرة: <span id="appeared">0</span></div>
    <div>المربعات المضغوطة: <span id="clicked">0</span></div>
    <div>المربعات الكُلية للّعبة: <span id="total">0</span></div>
  </div>

  <!-- Overlay للنتيجة -->
  <div id="overlay" class="overlay" style="display:none;">
    <div class="card" id="overlayCard">
      <div id="resultText" style="font-size:20px; font-weight:700;"></div>
      <img id="resultImage" class="result-img" src="" alt="" style="display:none;" />
      <div style="margin-top:12px;">
        <button id="playAgain" class="btn">العب مرة أخرى</button>
      </div>
    </div>
  </div>

<script>
(() => {
  // إعدادات: تقدر تغيّرها بسهولة
  const spawnIntervalMs = 1000; // يظهر مربع جديد كل ثانية
  const lifetimeByDifficulty = { easy: 4000, medium: 3000, hard: 2000 }; // مدة بقاء المربع قبل أن يختفي (ملّي ثانية)
  const maxSquaresByDifficulty = { easy: 10, medium: 12, hard: 15 }; // عدد المربعات في اللعبة

  const winImageURL = 'https://qu.ax/tMWYs'; // الصورة التي طلبتها لعرضها عند الفوز
  const winImageDisplayMs = 10000; // 10 ثواني عرض الصورة عند الفوز

  // عناصر DOM
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const gameArea = document.getElementById('gameArea');
  const overlay = document.getElementById('overlay');
  const resultText = document.getElementById('resultText');
  const resultImage = document.getElementById('resultImage');
  const playAgain = document.getElementById('playAgain');
  const appearedEl = document.getElementById('appeared');
  const clickedEl = document.getElementById('clicked');
  const totalEl = document.getElementById('total');

  let spawnTimer = null;
  let activeTimeouts = new Map(); // map<Element, timeoutId>
  let totalAppeared = 0;
  let totalClicked = 0;
  let currentMax = 10;
  let currentLifetime = 2000;
  let gameRunning = false;

  function getSelectedDifficulty() {
    const r = document.querySelector('input[name="diff"]:checked');
    return r ? r.value : 'medium';
  }

  function resetState() {
    // clear UI and timers
    stopSpawn();
    for (const t of activeTimeouts.values()) clearTimeout(t);
    activeTimeouts.clear();
    gameArea.innerHTML = '';
    totalAppeared = 0; totalClicked = 0;
    appearedEl.textContent = '0';
    clickedEl.textContent = '0';
    totalEl.textContent = '0';
    gameRunning = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }

  function startGame() {
    const diff = getSelectedDifficulty();
    currentLifetime = lifetimeByDifficulty[diff] || 3000;
    currentMax = maxSquaresByDifficulty[diff] || 12;

    // reset counters
    for (const t of activeTimeouts.values()) clearTimeout(t);
    activeTimeouts.clear();
    gameArea.innerHTML = '';
    totalAppeared = 0; totalClicked = 0;
    appearedEl.textContent = '0';
    clickedEl.textContent = '0';
    totalEl.textContent = String(currentMax);

    startBtn.disabled = true;
    stopBtn.disabled = false;
    gameRunning = true;

    // spawn immediately then every spawnIntervalMs
    spawnSquare();
    spawnTimer = setInterval(() => {
      // only spawn while we haven't reached max
      if (totalAppeared < currentMax) spawnSquare();
      // if reached max but there are still active squares, wait for them to be clicked (or to time out -> loss)
      // If clicked all of them (totalClicked === currentMax) we'll handle win in click handler
    }, spawnIntervalMs);
  }

  function stopSpawn() {
    if (spawnTimer) { clearInterval(spawnTimer); spawnTimer = null; }
  }

  function spawnSquare() {
    if (!gameRunning) return;
    if (totalAppeared >= currentMax) return;

    totalAppeared++;
    appearedEl.textContent = String(totalAppeared);

    const square = document.createElement('div');
    square.className = 'red-square';
    square.textContent = totalAppeared; // رقم المربع اختياري
    // random position inside gameArea
    const areaRect = gameArea.getBoundingClientRect();
    const size = 64;
    // ensure within padding 8px
    const maxX = Math.max(0, areaRect.width - size - 8);
    const maxY = Math.max(0, areaRect.height - size - 8);
    const x = Math.floor(Math.random() * (maxX + 1)) + 8;
    const y = Math.floor(Math.random() * (maxY + 1)) + 8;
    square.style.left = x + 'px';
    square.style.top = y + 'px';

    // click handler
    square.addEventListener('click', () => {
      if (!gameRunning) return;
      // remove any timeout and element
      const t = activeTimeouts.get(square);
      if (t) clearTimeout(t);
      activeTimeouts.delete(square);
      if (square.parentElement) square.parentElement.removeChild(square);
      totalClicked++;
      clickedEl.textContent = String(totalClicked);

      // Win condition: clicked all squares that will appear
      if (totalClicked >= currentMax) {
        // stop spawning and declare win
        endGame(true);
      }
    });

    gameArea.appendChild(square);

    // timeout: if not clicked before lifetime -> loss
    const timeoutId = setTimeout(() => {
      // if still in DOM -> lose
      if (square.parentElement) {
        // clear all
        activeTimeouts.delete(square);
        endGame(false);
      }
    }, currentLifetime);

    activeTimeouts.set(square, timeoutId);
  }

  function endGame(didWin) {
    if (!gameRunning) return;
    gameRunning = false;
    stopSpawn();

    // clear remaining element timeouts
    for (const t of activeTimeouts.values()) clearTimeout(t);
    activeTimeouts.clear();

    // disable/enable buttons
    startBtn.disabled = false;
    stopBtn.disabled = true;

    if (didWin) {
      resultText.textContent = 'لقد كسبت! 🎉';
      resultImage.src = winImageURL;
      resultImage.style.display = 'block';
      overlay.style.display = 'flex';
      // show image for 10 seconds then hide overlay automatically
      setTimeout(() => {
        overlay.style.display = 'none';
        // reset board after showing win
        resetState();
      }, winImageDisplayMs);
    } else {
      resultText.textContent = 'خسرت';
      resultImage.style.display = 'none';
      overlay.style.display = 'flex';
      // keep overlay until player clicks "العب مرة أخرى"
    }
  }

  // UI handlers
  startBtn.addEventListener('click', () => {
    resetState();
    startGame();
  });

  stopBtn.addEventListener('click', () => {
    // stop mid-game and treat as user-stopped; reset board
    resetState();
  });

  playAgain.addEventListener('click', () => {
    overlay.style.display = 'none';
    resetState();
  });

  // initial reset
  resetState();

  // handle window resize to keep positions valid (no active repositioning to keep simple)
  window.addEventListener('resize', () => { /* noop */ });
})();
</script>
</body>
</html>
