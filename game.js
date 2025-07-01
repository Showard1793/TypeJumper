
/* ───────── Canvas & Context ───────── */
const canvas = document.getElementById("gameCanvas");
const ctx     = canvas.getContext("2d");

function resizeCanvas() {
  const canvasWidth = window.innerWidth / 3;
  canvas.width  = canvasWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* ───────── Game‑wide State ───────── */
let gameStartTime       = 0;
let groundCoveredByLava = false;
const lavaGracePeriod   = 10000;     // 10 s
let showCountdown       = false;
let countdownValue      = 0;
const baseLavaSpeed     = 0.05;
const fastLavaSpeed     = 0.25;
const maxLavaSpeed      = 1.0;
const lavaAcceleration  = 0.00001;
let currentLavaSpeed    = baseLavaSpeed;

let gameRunning         = false;
let gameOver            = false;
let freezeGame = false;
let fadingOut = false;
let fadeOpacity = 0;
let gameOverTimeout = null;   // if you kept the optional timeout handle
let score               = 0;

let platforms           = [];
let bushes              = [];
let words               = [];
let typed               = "";
let lavaHeight          = 0;
let scrollOffset        = 0;
let highestPlayerPosition = 0;
let currentTypingPlatform = null;
let lastCorrectPlatformY  = 0;

/* ───────── Player ───────── */
const player = {
  x: 0,
  y: 0,
  width: 20,
  height: 40,
  color: "beige",
  vy: 0,
  vx: 0,
  grounded: false,

  /* double‑jump */
  jumpCount: 0,
  maxJumps : 2,

  normalSpeed: 5
};

/* ───────── Gameplay Constants ───────── */
const grassHeight      = 100;
const platformSpacing  = 150;

/* ───────── Load Word List & Show Start screen ───────── */
fetch("words.txt")
  .then(res => res.text())
  .then(text => {
    words = text.split("\n").filter(w => w.length >= 3 && w.length <= 10);
    showStartScreen();
  });

/* ───────── Input Handling ───────── */
const keysPressed = {};

document.addEventListener("keydown", e => {
  keysPressed[e.key] = true;

  /* Start / restart */
  if (!gameRunning && e.key === "Enter" && words.length > 0) startGame();
  if (gameOver && e.key === "Enter")                          restartGame();

  if (!gameRunning || gameOver) return;

  /* Jump & double‑jump */
  if (e.key === " ") {
   if (player.jumpCount < player.maxJumps) {
  const BASE_JUMP = -13;                 // first jump height
  player.vy = player.jumpCount === 0     // second jump is half as strong
              ? BASE_JUMP                // ➊ first jump
              : BASE_JUMP * 0.75;         // ➋ second jump (‑6.5)
  player.jumpCount++;
}
  }

  /* Backspace for typing */
  if (e.key === "Backspace") {
    if (currentTypingPlatform) {
      currentTypingPlatform.incorrectChar = null;
      if (currentTypingPlatform.typedProgress.length > 0) {
        currentTypingPlatform.typedProgress =
          currentTypingPlatform.typedProgress.slice(0, -1);
      }
    }
    return;
  }

  /* Letter typing */
  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    const typedChar = e.key.toLowerCase();

    /* find next untapped platform above player */
    if (
      !currentTypingPlatform ||
      currentTypingPlatform.active ||
      currentTypingPlatform.y > player.y
    ) {
      currentTypingPlatform = platforms
        .filter(p => !p.active && p.y < player.y)
        .sort((a, b) => b.y - a.y)[0];
    }

    if (currentTypingPlatform) {
      const idx      = currentTypingPlatform.typedProgress.length;
      const expected = currentTypingPlatform.word[idx].toLowerCase();

      if (typedChar === expected) {
        currentTypingPlatform.typedProgress += typedChar;
        currentTypingPlatform.incorrectChar  = null;

        if (
          currentTypingPlatform.typedProgress.length ===
          currentTypingPlatform.word.trim().length
        ) {
          currentTypingPlatform.active        = true;
          currentTypingPlatform.typedProgress = "";
          score += currentTypingPlatform.word.length;
          lastCorrectPlatformY = currentTypingPlatform.y;
        }
      } else if (idx > 0) {
        currentTypingPlatform.incorrectChar = typedChar;
      }
    }
  }
});

document.addEventListener("keyup", e => {
  keysPressed[e.key] = false;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") player.vx = 0;
});

/* ───────── UI Screens ───────── */
function showStartScreen() {
  // Dimmed dark overlay background like game over screen
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Text styling and alignment
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";

  // Title
  ctx.font = "bold 80px Arial";
  ctx.fillText("Type Jumper!", canvas.width / 2, canvas.height / 3);

  // Controls details
  ctx.font = "24px Arial";
  ctx.fillText("Arrow Keys: Move", canvas.width / 2, canvas.height / 2 - 10);
  ctx.fillText("Space: Jump / Double-Jump", canvas.width / 2, canvas.height / 2 + 30
  );

  // Start prompt
  ctx.font = "bold 28px Arial";
  ctx.fillText("Press Enter to Start!", canvas.width / 2, canvas.height / 2 + 200);
}

/* ───────── Game Lifecycle ───────── */
function startGame() {
  /* ---- FULL RESET of transient flags ---- */
  freezeGame      = false;
  fadingOut       = false;
  fadeOpacity     = 0;
  if (gameOverTimeout) {      // cancel any leftover timeout
    clearTimeout(gameOverTimeout);
    gameOverTimeout = null;
  }

  showCountdown        = true;
  countdownValue       = lavaGracePeriod / 1000;
  groundCoveredByLava  = false;
  gameRunning          = true;
  gameOver             = false;

  score                = 0;
  scrollOffset         = 0;
  highestPlayerPosition = 0;
  currentTypingPlatform = null;
  lastCorrectPlatformY  = 0;
  gameStartTime         = Date.now();

  player.x = canvas.width / 2 - 10;
  player.y = canvas.height - grassHeight - 20;
  player.vy = 0;
  player.vx = 0;
  player.jumpCount = 0;

  lavaHeight = canvas.height - 1;

  platforms = [];
  initializePlatforms();

  bushes = [];
  generateBushes();

  animate();                       // kick off the main loop
}


function restartGame() { location.reload(); }

/* ───────── Scenery & Obstacles ───────── */
function generateBushes() {
  const bushCount = 20;
  bushes = [];
  for (let i = 0; i < bushCount; i++) {
    const size    = Math.random() * 20 + 20;
    const x       = Math.random() * canvas.width;
    const zIndex  = Math.random() > 0.5;
    bushes.push({ x, size, zIndex, y: canvas.height - grassHeight });
  }
}

function initializePlatforms() {
  let baseY = canvas.height - 100;
  platforms = [];
  for (let i = 0; i < 1000; i++) {
    generatePlatform(baseY);
    baseY = platforms[platforms.length - 1].y - (Math.random() * 60 + 40);
  }
}

function generatePlatform(baseY) {
  const maxAttempts         = 10;
  const fixedHeightDiff     = 80;
  const minHorizontalMargin = 20;
  let attempt = 0, placed = false;

  while (attempt < maxAttempts && !placed) {
    const word      = words[Math.floor(Math.random() * words.length)];
    const width     = word.length * 10;
    const y         = baseY - fixedHeightDiff;
    const x         = minHorizontalMargin
                    + Math.random() * (canvas.width - width - minHorizontalMargin * 2);
    const speed     = 1.5;
    const direction = Math.random() > 0.5 ? 1 : -1;

    // const cloudCircles = [
    //   { x: width / 2, y: 0,         radius: width / 4 },
    //   { x: width * 0.2, y: -10,     radius: 30 },
    //   { x: width * 0.8, y: -5,      radius: 25 },
    //   { x: width * 0.3, y: 5,       radius: 20 },
    //   { x: width * 0.7, y: 8,       radius: 35 }
    // ];

  // Replace your fixed array with this one
const cloudCircles = [
  /*  ── top row ──  */
  { x: width * 0.00, y: 8,  radius: 25 },
  { x: width * 0.45, y: 6,  radius: 32 },
  { x: width * 0.85, y: 8,  radius: 25 },

  /*  ── bottom row ──  */
  { x: width * 0.25, y: 18, radius: 28 },
  { x: width * 0.65, y: 18, radius: 28 }
];


    const overlaps = platforms.some(p =>
      Math.abs(p.y - y) < platformSpacing &&
      x + width > p.x && x < p.x + p.width
    );

    if (!overlaps) {
      platforms.push({
        x, y, width, height: 20, word,
        active: false, typedProgress: "",
        speed, direction, cloudCircles,
        incorrectChar: null
      });
      placed = true;
    }
    attempt++;
  }
}

/* ───────── Player Physics & World Update ───────── */
function updatePlayer() {
  if (freezeGame) return;
  /* Horizontal movement */
  if (keysPressed["ArrowLeft"]) {
    player.vx = -player.normalSpeed;
  } else if (keysPressed["ArrowRight"]) {
    player.vx = player.normalSpeed;
  } else {
    player.vx *= 0.9;
    if (Math.abs(player.vx) < 0.1) player.vx = 0;
  }

  /* Gravity & position */
  player.vy += 0.5;
  player.x  += player.vx;
  player.y  += player.vy;

  /* Clamp X */
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

  /* Platform collision */
  player.grounded = false;
  for (const plat of platforms) {
    if (
      plat.active &&
      player.x + player.width > plat.x &&
      player.x < plat.x + plat.width &&
      player.y + player.height > plat.y &&
      player.y + player.height <= plat.y + plat.height + 5 &&
      player.vy >= 0
    ) {
      player.y         = plat.y - player.height;
      player.vy        = 0;
      player.grounded  = true;
      player.jumpCount = 0;      // reset double‑jump
    }
  }

  /* Ground collision (when grass still visible) */
  const groundY = canvas.height - grassHeight + scrollOffset;
  if (
    !groundCoveredByLava &&
    player.y + player.height >= groundY &&
    player.y + player.height < lavaHeight
  ) {
    player.y         = groundY - player.height;
    player.vy        = 0;
    player.grounded  = true;
    player.jumpCount = 0;
  }

  /* Scroll world when player climbs */
  const topThreshold = canvas.height / 4;
  if (player.y < topThreshold) {
    const delta = topThreshold - player.y;
    scrollOffset += delta;
    player.y = topThreshold;
    platforms.forEach(p => (p.y += delta));
    bushes.forEach(b   => (b.y += delta));
    lavaHeight += delta;
  }

  if (player.y < highestPlayerPosition) highestPlayerPosition = player.y;

  /* Lava timing */
  const timeSinceStart = Date.now() - gameStartTime;
  if (timeSinceStart > lavaGracePeriod) {
    showCountdown = false;
    currentLavaSpeed = Math.min(
      baseLavaSpeed + (timeSinceStart - lavaGracePeriod) * lavaAcceleration,
      maxLavaSpeed
    );
    lavaHeight -= currentLavaSpeed;
  } else {
    countdownValue = Math.ceil((lavaGracePeriod - timeSinceStart) / 1000);
  }

  /* Reset lava if too low */
  if (lavaHeight > canvas.height) {
    lavaHeight = canvas.height - 1;
    platforms  = platforms.filter(p => p.y < canvas.height * 2);
  }

  // Mark the ground as permanently submerged once the lava reaches it
  if (!groundCoveredByLava && lavaHeight <= canvas.height - grassHeight + scrollOffset) {
    groundCoveredByLava = true;
  }

  /* Spawn new platforms */
  const lowestPlatform = Math.min(...platforms.map(p => p.y));
  if (lowestPlatform > player.y + canvas.height) {
    generatePlatform(player.y - platformSpacing);
  }

  /* Game over on lava touch */
   const LAVA_TOLERANCE = 1;
  if (!gameOver && player.y + player.height >= lavaHeight - LAVA_TOLERANCE) {
    freezeGame = true;  // freeze immediately

    // After 1 second start fading out
    setTimeout(() => {
      fadingOut = true;
      fadeOpacity = 0;
    }, 1000);
  }
}

/* ───────── Drawing Helpers ───────── */
function drawBackdrop() {
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!groundCoveredByLava) {
    ctx.fillStyle = "#90EE90";
    ctx.fillRect(0, canvas.height - grassHeight + scrollOffset, canvas.width, grassHeight);
  }

if (showCountdown && countdownValue > 0) {
  const y = canvas.height - 40;
  ctx.font = "bold 40px Arial";
  ctx.textAlign = "center";

  // plain black until the last 3 seconds, then solid red
  ctx.fillStyle = countdownValue <= 3 ? "#ff0000" : "#000000";

  ctx.fillText(`LAVA RISES IN: ${countdownValue}`, canvas.width / 2, y);
}
}

function drawPlayer() {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawPlatforms() {
  platforms = platforms.filter(p => p.y < player.y + canvas.height * 2);

  for (const plat of platforms) {
    /* Moving cloud (inactive) */
    if (!plat.active) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (const c of plat.cloudCircles) {
        ctx.beginPath();
        ctx.arc(plat.x + c.x, plat.y - 8 + c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      plat.x += plat.speed * plat.direction;
      if (plat.x <= 0)                       plat.direction = 1;
      if (plat.x + plat.width >= canvas.width) plat.direction = -1;
    }

    /* Solid platform */
    ctx.fillStyle = plat.active ? "#C49554" : "rgba(255,255,255,0.9)";
    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

    /* Word & typing feedback */
    if (!plat.active) {
      const word    = plat.word;
      const typed   = plat.typedProgress || "";
      const textX   = plat.x + 10;
      const wordY   = plat.y + 15;
      const typedY  = plat.y + 35;

      ctx.font      = "20px Arial";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,0.8)";
      ctx.fillText(word, textX, wordY);

      if (typed.length > 0) {
        if (word.startsWith(typed)) {
          ctx.font = "bold 20px Arial";
          ctx.fillText(typed, textX, typedY);
        } else {
          let correctLength = 0;
          while (
            correctLength < typed.length &&
            typed[correctLength] === word[correctLength]
          )
            correctLength++;

          if (correctLength > 0) {
            ctx.font = "bold 14px Arial";
            ctx.fillText(typed.substring(0, correctLength), textX, typedY);
          }
          if (correctLength < typed.length) {
            const incorrect = typed.substring(correctLength);
            const offset    = ctx.measureText(
              typed.substring(0, correctLength)
            ).width;
            ctx.font = "14px Arial";
            ctx.fillStyle = "red";
            ctx.fillText(incorrect, textX + offset, typedY);
          }
        }
      }
    }
  }
}

function drawScore() {
  ctx.fillStyle = "#000";
  ctx.font = "24px Arial";
  ctx.textAlign = "right";
  ctx.fillText(`Score: ${score}`, canvas.width - 20, 40);
}

/* ───────── Game Over ───────── */
function endGame() {
  gameRunning = false;
  gameOver    = true;

  // Dim the play‑field
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Main header
  ctx.fillStyle = "#fff";
  ctx.font      = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 80);

  // Player score
  ctx.font = "36px Arial";
  ctx.fillText(`Your Score: ${score}`, canvas.width / 2, canvas.height / 2 - 20);

  // Restart prompt
  ctx.font = "24px Arial";
  ctx.fillText("Play Again?  Press Enter", canvas.width / 2, canvas.height / 2 + 40);
}


/* ───────── Main Loop ───────── */
function animate() {
  if (!gameRunning && !freezeGame && !fadingOut) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Only update game state if not frozen
  if (!freezeGame) {
    updatePlayer();
  }

  // Draw game world
  drawBackdrop();
  drawPlatforms();
  drawPlayer();

  // Draw lava
  ctx.fillStyle = "rgba(255,0,0,0.7)";
  ctx.fillRect(0, lavaHeight, canvas.width, canvas.height - lavaHeight);

  const grad = ctx.createLinearGradient(0, lavaHeight - 10, 0, lavaHeight);
  grad.addColorStop(0, "rgba(255,100,0,0.8)");
  grad.addColorStop(1, "rgba(255,0,0,0.7)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, lavaHeight - 10, canvas.width, 10);

  drawScore();

  // ─── Fade-out overlay ───────────────────────
  if (fadingOut) {
    const FADE_FRAMES = 60 * 2; // 2 seconds at 60fps
    fadeOpacity += 1 / FADE_FRAMES;

    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(fadeOpacity, 1)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (fadeOpacity >= 1) {
      fadingOut = false;
      endGame(); // Draw Game Over screen
      return;    // Stop here to avoid redrawing over it
    }

    requestAnimationFrame(animate); // Keep fading
    return;
  }

  // Continue animation loop
  requestAnimationFrame(animate);
}



