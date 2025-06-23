const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", () => {
  resizeCanvas();
  // Optional: Recalculate positions or redraw if needed
});

// Initial sizing
resizeCanvas();

let gameRunning = false;
let gameOver = false;
let platforms = [];
let bushes = [];
let words = [];
let clouds = [];

fetch('words.txt')
  .then(res => res.text())
  .then(text => {
    words = text.split('\n').filter(word => word.length >= 3 && word.length <= 10);
    startGame(); // Start after words load
  });
let typed = "";
let initialLavaHeight = canvas.height - 1;
let lavaHeight = initialLavaHeight;
let scrollOffset = 0;

const grassHeight = 60;

const player = {
  x: canvas.width / 2 - 10, // centered horizontally
  y: canvas.height - grassHeight - 20, // on top of grass
  width: 20,
  height: 20,
  color: "gray",
  vy: 0,
  vx: 0,
  grounded: false,
  dashing: false,
  dashDuration: 150,  // dash lasts 150 ms
  dashTimer: 0,       // counts down dash time
  normalSpeed: 5,
  vx: 0,
  dashing: false,
  dashSpeed: 15,
  dashDuration: 200,
  dashTimer: 0,
  dashDirection: 1 // 1 for right, -1 for left
};



const keysPressed = {};

document.addEventListener("keydown", e => {
  keysPressed[e.key] = true;
  // rest of keydown code...
});

document.addEventListener("keyup", e => {
  keysPressed[e.key] = false;
  if (!player.dashing) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") player.vx = 0;
  }
});

document.getElementById("start-btn").addEventListener("click", () => {
  if (words.length > 0) {
    document.getElementById("start-menu").classList.add("hidden");
    canvas.classList.remove("hidden");
    gameRunning = true;
    initializePlatforms();
    generateBushes();
    animate();
  } else {
    alert("Words not loaded yet. Please wait a moment.");
  }
});


function startGame() {
  document.getElementById("start-menu").classList.add("hidden");
  canvas.classList.remove("hidden");
  gameRunning = true;
  initializePlatforms();
  generateBushes();
  animate();
}


function generateBushes() {
  bushes = [];
  const bushCount = 20; // more bushes for full width

  for (let i = 0; i < bushCount; i++) {
    let size = Math.random() * 20 + 20;
    let x = Math.random() * canvas.width;  // full width
    let zIndex = Math.random() > 0.5;
    bushes.push({ x, size, zIndex });
  }
}

function generateClouds() {
  clouds = [];
  const cloudCount = 20;

  for (let i = 0; i < cloudCount; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * (canvas.height * 0.6); // sky area

    // Each cloud will have 5 to 8 circles, with random offsets
    const circleCount = Math.floor(Math.random() * 4) + 5;

    let circles = [];
    for (let j = 0; j < circleCount; j++) {
      const offsetX = Math.random() * 40 - 20; // -20 to +20 px offset
      const offsetY = Math.random() * 20 - 10; // -10 to +10 px offset
      const radius = 15 + Math.random() * 10; // 15 to 25 radius

      circles.push({ offsetX, offsetY, radius });
    }

    clouds.push({ x, y, circles });
  }
}



function restartGame() {
  location.reload();
}

function initializePlatforms() {
  platforms = [];

  // First platform near bottom
  

  let baseY = canvas.height - 100; // or some height based on player starting position

  for (let i = 0; i < 20; i++) {
    generatePlatform(baseY);
    baseY = platforms[platforms.length - 1].y;
  }
}


function generatePlatform(baseY) {
  const maxAttempts = 10;
  let attempt = 0;
  let placed = false;

  while (attempt < maxAttempts && !placed) {
    const word = words[Math.floor(Math.random() * words.length)];
    const width = 50 + word.length * 10;
    const x = Math.random() * (canvas.width - width);
    const y = baseY - Math.random() * 40 - 40; // above baseY but within jump reach

    // Check for overlap
    const overlaps = platforms.some(p =>
      y < p.y + p.height &&
      y + 20 > p.y &&
      x < p.x + p.width &&
      x + width > p.x
    );

    if (!overlaps) {
      platforms.push({ x, y, width, height: 20, word, active: false, typedProgress: "" });

      placed = true;
    }

    attempt++;
  }

 // Fallback if nothing placed
if (!placed) {
  platforms.push({
  x: 50,
  y: baseY - 100,
  width: 100,
  height: 20,
  word: "jump",
  active: false,
  typedProgress: "" // MUST be here
});
}

}


function drawBackdrop() {
  ctx.fillStyle = "#87CEFA"; // sky
  ctx.fillRect(0, 0, canvas.width, canvas.height);

 // Randomly scattered clouds above grass, anywhere in the sky area
const cloudCount = 30; // more clouds for fullness

// Draw clouds from stored positions
ctx.fillStyle = "white";

for (let cloud of clouds) {
  ctx.beginPath();
  for (let c of cloud.circles) {
    ctx.moveTo(cloud.x + c.offsetX + c.radius, cloud.y + c.offsetY);
    ctx.arc(cloud.x + c.offsetX, cloud.y + c.offsetY, c.radius, 0, Math.PI * 2);
  }
  ctx.fill();
}


 // Draw grass if still visible
const grassY = canvas.height - grassHeight;
if (grassY >= 0) {
  ctx.fillStyle = "#90EE90";
  ctx.fillRect(0, grassY, canvas.width, grassHeight);

  for (let bush of bushes) {
    ctx.fillStyle = bush.zIndex ? "#006400" : "#004d00";
    ctx.beginPath();
    ctx.moveTo(bush.x, grassY);
    ctx.lineTo(bush.x + bush.size / 2, grassY - bush.size);
    ctx.lineTo(bush.x + bush.size, grassY);
    ctx.closePath();
    ctx.fill();
  }
}

// Static bushes
for (let bush of bushes) {
  if (bush.zIndex) ctx.fillStyle = "#006400";
  else ctx.fillStyle = "#004d00";

  ctx.beginPath();
  ctx.moveTo(bush.x, canvas.height - 60);
  ctx.lineTo(bush.x + bush.size / 2, canvas.height - 60 - bush.size);
  ctx.lineTo(bush.x + bush.size, canvas.height - 60);
  ctx.closePath();
  ctx.fill();
}

  // Lava
  ctx.fillStyle = "red";
  ctx.fillRect(0, lavaHeight, canvas.width, canvas.height);
}

function drawPlayer() {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawPlatforms() {
  for (let plat of platforms) {
    // Determine fill color:
    let fillColor = "#ffffff"; // default white
    
    if (plat.active) {
      fillColor = "#777"; // solid gray when complete
    } else if (plat.typedProgress.length > 0) {
      fillColor = "#ddd"; // light gray while typing
    }
    
    ctx.fillStyle = fillColor;
    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

    if (!plat.active) {
      const typed = plat.typedProgress;
      const remaining = plat.word.slice(typed.length);

      ctx.font = "14px Arial";
      ctx.fillStyle = "black";

      // Bold typed portion
      if (typed.length > 0) {
        ctx.font = "bold 14px Arial";
        ctx.fillText(typed, plat.x + 5, plat.y + 15);
      }

      // Regular remaining portion
      if (remaining.length > 0) {
        const typedWidth = ctx.measureText(typed).width;
        ctx.font = "14px Arial";
        ctx.fillText(remaining, plat.x + 5 + typedWidth, plat.y + 15);
      }
    }
  }
}




function updatePlayer() {
  player.vy += 0.5;

  // Update position
  player.y += player.vy;
  player.x += player.vx;

  // Clamp player within screen
  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

  // Assume the player is falling
  player.grounded = false;

  // Check platform collision
for (let plat of platforms) {
  if (
    plat.active &&
    player.x + player.width > plat.x &&
    player.x < plat.x + plat.width &&
    player.y + player.height > plat.y &&
    player.y + player.height <= plat.y + plat.height &&
    player.vy >= 0
  ) {
    player.y = plat.y - player.height;
    player.vy = 0;
    player.grounded = true;
    player.dashing = false;
  }
}


  // Check collision with ground (green grass)
  const groundY = canvas.height - 60;
  if (player.y + player.height >= groundY) {
    player.y = groundY - player.height;
    player.vy = 0;
    player.grounded = true;
    player.dashing = false;
  }

  // check if player is above the top threshold
const topThreshold = canvas.height / 8;
if (player.y < topThreshold) {
  let delta = topThreshold - player.y;
  player.y = topThreshold;
  scrollOffset += delta;

  platforms.forEach(p => (p.y += delta));
  lavaHeight += delta;

  // Generate platform high above player
  for (let i = 0; i < 2; i++) {
  generatePlatform(player.y - 150 - i * 60);
}
}

 // Game over if touching lava
if (player.y + player.height > lavaHeight) {
  endGame();
}

// Lava always on screen
if (lavaHeight > canvas.height - 1) {
  lavaHeight = canvas.height - 1;
}

  //dashing logic
 if (player.dashing) {
  player.dashTimer -= 16.67;

  if (player.dashTimer <= 0) {
    player.dashing = false;

    // After dash ends, keep moving at normal speed in dash direction
    player.vx = player.normalSpeed * player.dashDirection;
  }
} else {
  // If no arrow key pressed, gradually slow down vx
  // (optional - add friction)
  if (!keysPressed["ArrowLeft"] && !keysPressed["ArrowRight"]) {
    player.vx *= 0.9; // friction slows player gradually
    if (Math.abs(player.vx) < 0.1) player.vx = 0;
  }
}

}


function endGame() {
  gameRunning = false;
  gameOver = true;
  document.getElementById("game-over").classList.remove("hidden");
}

function animate() {
  if (!gameRunning) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackdrop();
  drawPlatforms();
  updatePlayer();
  drawPlayer();
  lavaHeight -= 0.05; 

  requestAnimationFrame(animate);
}

document.addEventListener("keydown", e => {
  if (!gameRunning) return;

  if (!player.dashing) {
    if (e.key === "ArrowLeft") {
      player.vx = -player.normalSpeed;
      player.dashDirection = -1;
    }
    if (e.key === "ArrowRight") {
      player.vx = player.normalSpeed;
      player.dashDirection = 1;
    }
  }

  if (e.key === " " && player.grounded) {
    player.vy = -13;
  } else if (e.key === " " && !player.grounded && !player.dashing) {
    player.dashing = true;
    player.dashTimer = player.dashDuration;
    player.vx = player.dashSpeed * player.dashDirection;
  }

  // Handle typing
  if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
    const typedChar = e.key.toLowerCase();

    for (let plat of platforms) {
  if (plat.active) continue;

  const expected = plat.word[plat.typedProgress.length];

  if (typedChar === expected) {
    plat.typedProgress += typedChar;

  if (plat.typedProgress.length === plat.word.trim().length) {
  plat.active = true;
  plat.typedProgress = "";
  console.log(`Activated platform: ${plat.word}`);
}
  } else if (plat.typedProgress.length > 0) {
    // Only reset if player had started typing this word
    plat.typedProgress = "";
  }
}

  }
});


document.addEventListener("keyup", e => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") player.vx = 0;
});
