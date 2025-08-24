/* ───────── Sound Parameters ───────── */
const soundParams = {
  music: { volume: 0.5, speed: 1.0 },
  jump: { volume: 0.1, speed: 1.0 },
  cannonball: { volume: 0.6, speed: 1.0 },
  gameOver: { volume: 0.5, speed: 1.0 },
  platformMade: { volume: 0.1, speed: 1.0 },
  typing: { volume: 0.99, speed: 1.0 },
  ballDeath: { volume: 0.6, speed: 1.0 }  // 🔥 added this
};

const sounds = {
  music: new Audio("/sounds/music.mp3"),
  jump: new Audio("/sounds/jump.mp3"),
  cannonball: new Audio("/sounds/cannonball.mp3"),
  gameOver: new Audio("/sounds/gameOver.mp3"),
  platformMade: new Audio("/sounds/platformMade.mp3"),
  typing: new Audio("/sounds/typing.mp3"),
  ballDeath: new Audio("/sounds/ballDeath.mp3") 
};

// Apply sound parameters
for (const [name, sound] of Object.entries(sounds)) {
  sound.volume = soundParams[name].volume;
  sound.playbackRate = soundParams[name].speed;
}

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
let paused = false;
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

/* ───────── Cannonball Parameters ───────── */
const cannonballParams = {
  size: 30,
  speed: 5,
  appearsAfterNumberOfWords: 4,
  color: "black"
};
let cannonballs = [];
let wordsTypedSinceLastCannonball = 0;

/* ───────── Player ───────── */
const player = {
  x: 0,
  y: 0,
  width: 20,
  height: 40,
  vy: 0,
  vx: 0,
  grounded: false,

  jumpCount: 0,
  maxJumps: 2,

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
  // Toggle pause on Escape
  if (e.key === "Escape" && gameRunning && !gameOver) {
    paused = !paused;
    if (paused) {
      sounds.music.pause();
    } else {
      sounds.music.play();
      animate(); // restart animation loop if unpaused
    }
  }
});

document.addEventListener("keydown", e => {
  keysPressed[e.key] = true;

  /* Start / restart */
  if (!gameRunning && e.key === "Enter" && words.length > 0) {
    sounds.music.currentTime = 0;
    sounds.music.loop = true;
    sounds.music.play();
    startGame();
  }
  if (gameOver && e.key === "Enter") {
    sounds.music.currentTime = 0;
    sounds.music.play();
    restartGame();
  }

  if (!gameRunning || gameOver) return;

  /* Jump & double-jump */
  if (e.key === " ") {
   if (player.jumpCount < player.maxJumps) {
      sounds.jump.currentTime = 0;
      sounds.jump.play();
      const BASE_JUMP = -13;                 // first jump height
      player.vy = player.jumpCount === 0     // second jump is half as strong
                  ? BASE_JUMP                // ➊ first jump
                  : BASE_JUMP * 0.75;         // ➋ second jump (-6.5)
      player.jumpCount++;
    }
  }

  /* Backspace for typing */
  if (e.key === "Backspace") {
    // Optional: clear last wrong char from any platform
    const target = platforms.find(p => !p.active && p.typedProgress.length > 0);
    if (target) {
      sounds.typing.currentTime = 0;
      sounds.typing.play();
      target.incorrectChar = null;
      target.typedProgress = target.typedProgress.slice(0, -1);
    }
    return;
  }

  /* Letter typing (updated for multi-platform) */
  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    sounds.typing.currentTime = 0;
    sounds.typing.play();
    const typedChar = e.key.toLowerCase();

    let matchedPlatform = null;

    for (const plat of platforms) {
      if (plat.active) continue;
      if (plat.y > player.y + canvas.height) continue;

      const idx = plat.typedProgress.length;
      const expected = plat.word[idx]?.toLowerCase();

      if (typedChar === expected) {
        matchedPlatform = plat;
        plat.typedProgress += typedChar;
        plat.incorrectChar = null;

        // Word complete
        if (plat.typedProgress.length === plat.word.trim().length) {
          sounds.platformMade.currentTime = 0;
          sounds.platformMade.play();
          plat.active = true;
          plat.typedProgress = "";
          score += plat.word.length;
          lastCorrectPlatformY = plat.y;

          // Track cannonball spawning
          wordsTypedSinceLastCannonball++;
          if (wordsTypedSinceLastCannonball >= cannonballParams.appearsAfterNumberOfWords) {
            spawnCannonball();
            wordsTypedSinceLastCannonball = 0;
          }
        }
        break; // stop after first match this keypress
      }
    }

    // If nothing matched, flag the first unfinished platform
    if (!matchedPlatform) {
      const target = platforms.find(p => !p.active);
      if (target) {
        target.incorrectChar = typedChar;
      }
    }
  }
});

document.addEventListener("keyup", e => {
  keysPressed[e.key] = false;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") player.vx = 0;
});

/* ───────── Cannonball Functions ───────── */
function spawnCannonball() {
  sounds.cannonball.currentTime = 0;
  sounds.cannonball.play();

  const radius = cannonballParams.size / 2;
  const speed = cannonballParams.speed;

  // Pick a random corner (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right)
  const corner = Math.floor(Math.random() * 4);
  let x, y, vx, vy;

  if (corner === 0) { // top-left
    x = radius;
    y = radius;
    vx = speed;
    vy = speed;
  } else if (corner === 1) { // top-right
    x = canvas.width - radius;
    y = radius;
    vx = -speed;
    vy = speed;
  } else if (corner === 2) { // bottom-left
    x = radius;
    y = canvas.height - radius;
    vx = speed;
    vy = -speed;
  } else { // bottom-right
    x = canvas.width - radius;
    y = canvas.height - radius;
    vx = -speed;
    vy = -speed;
  }

  cannonballs.push({
    x, y, vx, vy,
    radius,
    color: cannonballParams.color,
    falling: false // 🚀 new flag for gravity mode
  });
}

function updateCannonballs() {
  const BASE_JUMP = -13;
  const GRAVITY = 0.6; // tweak for fall speed

  for (let i = cannonballs.length - 1; i >= 0; i--) {
    const ball = cannonballs[i];

    if (ball.falling) {
      // 🚀 Gravity mode
      ball.vy += GRAVITY;
      ball.y += ball.vy;

      // Remove once it falls off-screen
      if (ball.y - ball.radius > canvas.height) {
        cannonballs.splice(i, 1);
        continue;
      }
    } else {
      // Normal bouncing mode
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Bounce off edges
      if (ball.x - ball.radius <= 0 || ball.x + ball.radius >= canvas.width) {
        ball.vx = -ball.vx;
        ball.x = Math.max(ball.radius, Math.min(canvas.width - ball.radius, ball.x));
      }
      if (ball.y - ball.radius <= 0 || ball.y + ball.radius >= canvas.height) {
        ball.vy = -ball.vy;
        ball.y = Math.max(ball.radius, Math.min(canvas.height - ball.radius, ball.y));
      }
    }

    // Collision check with player
    if (!gameOver && !freezeGame) {
      const px = player.x;
      const py = player.y;
      const pw = player.width;
      const ph = player.height;

      // Closest point on player to ball center
      const closestX = Math.max(px, Math.min(ball.x, px + pw));
      const closestY = Math.max(py, Math.min(ball.y, py + ph));

      // Distance squared
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < ball.radius * ball.radius) {
        const playerBottom = player.y + player.height;
        const isFallingOnto = player.vy >= 0 && playerBottom <= ball.y;

        if (isFallingOnto) {
          // ✅ Player bounces upward
          player.y = ball.y - ball.radius - player.height;
          player.vy = BASE_JUMP;
          player.grounded = false;
          player.jumpCount = 0;

          // ✅ Cannonball switches to gravity mode
          ball.falling = true;
          ball.vx = 0;
          ball.vy = 0; // reset before gravity kicks in

          // 🔊 Play ball death sound
          sounds.ballDeath.currentTime = 0;
          sounds.ballDeath.play();
        } else {
          // ❌ Side collision → game over
          freezeGame = true;
          sounds.music.pause();
          sounds.gameOver.currentTime = 0;
          sounds.gameOver.play();
          setTimeout(() => {
            fadingOut = true;
            fadeOpacity = 0;
          }, 1000);
        }
      }
    }
  }
}

function drawCannonballs() {
  for (const ball of cannonballs) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
    ctx.closePath();
  }
}

/* ───────── UI Screens ───────── */
/* ───────── Logo Parameters ───────── */
const logoParams = {
  src: "logo.png",       // Path to your logo image
  width: 400,           // Adjust width as needed
  height: 400,          // Adjust height as needed
  yOffset: -200          // Adjust vertical position (-50 means 50px higher than original text position)
};

let logoImage = new Image();
logoImage.src = logoParams.src;

function showStartScreen() {
  // Dimmed dark overlay background like game over screen
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Text styling and alignment
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";

  // Draw logo image if loaded
  if (logoImage.complete) {
    const logoX = canvas.width / 2 - logoParams.width / 2;
    const logoY = canvas.height / 3 + logoParams.yOffset;
    ctx.drawImage(logoImage, logoX, logoY, logoParams.width, logoParams.height);
  } else {
    // Fallback to text if image not loaded yet
    ctx.font = "bold 80px Arial";
    ctx.fillText("Type Jumper!", canvas.width / 2, canvas.height / 3);
  }

  // Controls details
  // ctx.font = "24px Arial";
  // ctx.fillText("Space: Jump / Double-Jump", canvas.width / 2, canvas.height / 2 + 100);   
  // ctx.fillText("Arrow Keys: Move", canvas.width / 2, canvas.height / 2 + 140);
  //  ctx.fillText("GOAL: Type the words and outrun the lava!", canvas.width / 2, canvas.height / 2 + 200);

  ctx.font = "24px Arial";
  ctx.fillText("GOAL: Type the Words and Outrun the Lava!", canvas.width / 2, canvas.height / 2 + 85);   
  ctx.fillText("Pause: Escape ", canvas.width / 2, canvas.height / 2 + 140);
  ctx.fillText("Move: Arrow Keys", canvas.width / 2, canvas.height / 2 + 175);
  ctx.fillText("Jump / Double-Jump: Spacebar", canvas.width / 2, canvas.height / 2 + 210);

  // Button parameters
  const buttonText = "Press Enter to Start!";
  const buttonFont = "bold 33px Arial";
  const buttonPadding = 40;
  const buttonRadius = 25;
  const buttonY = canvas.height / 2 + 280;
  const buttonHeight = 80; // Increased height for better proportions
  
  // Measure text
  ctx.font = buttonFont;
  const textWidth = ctx.measureText(buttonText).width;
  const textMetrics = ctx.measureText(buttonText); // For more accurate vertical centering
  
  // Calculate button dimensions
  const buttonX = canvas.width / 2 - (textWidth + buttonPadding * 2) / 2;
  const buttonWidth = textWidth + buttonPadding * 2;
  
  // Draw rounded rectangle background
  ctx.beginPath();
  ctx.roundRect(buttonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, buttonRadius);
  ctx.fillStyle = "#1E90FF"; // Dodger blue color
  ctx.fill();
  
  // Calculate text position for perfect vertical centering
  const textY = buttonY + (textMetrics.actualBoundingBoxAscent - textMetrics.actualBoundingBoxDescent) / 2;
  
  // Draw text
  ctx.fillStyle = "#fff";
  ctx.font = buttonFont;
  ctx.fillText(buttonText, canvas.width / 2, textY);
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

  // Stop any currently playing game over sound
  sounds.gameOver.pause();
  sounds.gameOver.currentTime = 0;

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
  wordsTypedSinceLastCannonball = 0;
  cannonballs = [];

  // Start music again
  sounds.music.currentTime = 0;
  sounds.music.play();

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
  const bushCount = 3;                          // ¼ as many as before
  bushes = [];

  for (let i = 0; i < bushCount; i++) {
    const height = Math.random() * 50 + 50;     // 30 – 60 px tall (triangles)
    const halfBase = height * (Math.random() * 0.01 + 0.25); // 50–70 % of height

    const isHalfCircle = Math.random() < 0.3;   // 30 % chance

    // Half‑circles are a bit smaller
    const radius = isHalfCircle ? height * 0.3 : null;

    const x = Math.random() * (canvas.width - 2 * (isHalfCircle ? radius : halfBase))
            + (isHalfCircle ? radius : halfBase);

    const y = canvas.height - grassHeight;      // baseline sits on grass
    const behind = Math.random() < 0.5;         // depth flag

    bushes.push({
      x,
      y,
      shape: isHalfCircle ? "half" : "triangle",
      height,            // only used by triangles
      halfBase,          //   »     »     »
      radius,            // only used by half‑circles
      behind
    });
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
  // Add this line to move cannonballs down
  cannonballs.forEach(ball => (ball.y += delta));
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
    sounds.music.pause();
    sounds.gameOver.currentTime = 0;
    sounds.gameOver.play();

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

function drawPlayer(ctx) {
  // Top half - beige square
  ctx.fillStyle = "beige";
  ctx.fillRect(player.x, player.y, player.width, player.height / 2);

  // Bottom half - dark blue square
  ctx.fillStyle = "red"; // or use ""
  ctx.fillRect(player.x, player.y + player.height / 2, player.width, player.height / 2);
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

function drawBushes(layer = "behind") {
  for (const b of bushes) {
    if ((layer === "behind") !== b.behind) continue;

    ctx.fillStyle = "#228B22";

    if (b.shape === "triangle") {
      const h = b.height;
      const w = b.halfBase;
      ctx.beginPath();
      ctx.moveTo(b.x,         b.y - h); // apex
      ctx.lineTo(b.x - w, b.y);         // base‑left
      ctx.lineTo(b.x + w, b.y);         // base‑right
      ctx.closePath();
      ctx.fill();
    } else { // half‑circle
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, Math.PI, 0); // flat side flush with grass
      ctx.closePath();
      ctx.fill();
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
  ctx.font = "35px Arial";
  ctx.fillText("Press Enter to Play Again", canvas.width / 2, canvas.height / 2 + 40);
}


/* ───────── Main Loop ───────── */
function animate() {
  if (!gameRunning && !freezeGame && !fadingOut) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Only update game state if not frozen or paused
  if (!freezeGame && !paused) {
    updatePlayer();
    updateCannonballs();
  }

  // Draw game world
  drawBackdrop();
  drawBushes("behind");
  drawPlatforms();
  drawPlayer(ctx);
  drawBushes("front");
  drawCannonballs();

  // Draw lava
  ctx.fillStyle = "rgba(255,0,0,0.7)";
  ctx.fillRect(0, lavaHeight, canvas.width, canvas.height - lavaHeight);

  const grad = ctx.createLinearGradient(0, lavaHeight - 10, 0, lavaHeight);
  grad.addColorStop(0, "rgba(255,100,0,0.8)");
  grad.addColorStop(1, "rgba(255,0,0,0.7)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, lavaHeight - 10, canvas.width, 10);

  drawScore();

  // Draw paused overlay
  // Draw paused text
if (paused) {
  ctx.fillStyle = "gray";
  ctx.font = "bold 80px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle"; // vertically center text
  ctx.fillText("Paused", canvas.width / 2, canvas.height / 2);
}

  // Fade-out overlay
  if (fadingOut) {
    fadeOpacity += 0.02;
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(fadeOpacity, 1)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (fadeOpacity >= 1) {
      fadingOut = false;
      endGame();
      return;
    }
  }

  if (!paused) requestAnimationFrame(animate);
}