const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  // Set canvas logical size to 1/3 of window width (but full height)
  const canvasWidth = window.innerWidth / 3;
  canvas.width = canvasWidth;
  canvas.height = window.innerHeight;

  // No need for manual positioning - CSS handles centering
  // Remove any previous positioning styles
  canvas.style.position = "";
  canvas.style.left = "";
  canvas.style.top = "";
}

window.addEventListener("resize", () => {
  resizeCanvas();
});

// Initial sizing
resizeCanvas();

let gameRunning = false;
let gameOver = false;
let platforms = [];
let bushes = [];
let words = [];

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
let showGround = true;

const player = {
  x: canvas.width / 2 - 10,  // Now properly centered in the narrower canvas
  y: canvas.height - grassHeight - 20,
  width: 20,
  height: 20,
  color: "gray",
  vy: 0,
  vx: 0,
  grounded: false,
  dashing: false,
  dashSpeed: 15,
  dashDuration: 200,
  dashTimer: 0,
  dashDirection: 1, // 1 for right, -1 for left
  normalSpeed: 5
};

function updatePlayer() {
  player.vy += 0.5;
  player.y += player.vy;
  player.x += player.vx;

  // Clamp horizontal position
  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

  player.grounded = false;

  // Platform collision
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

  // Ground collision
  const groundY = canvas.height - grassHeight;
  if (player.y + player.height >= groundY && showGround) {
    player.y = groundY - player.height;
    player.vy = 0;
    player.grounded = true;
    player.dashing = false;
  }

  // Scroll world if player goes above top 1/8 of screen
  const topThreshold = canvas.height / 8;
  if (player.y < topThreshold) {
    const delta = topThreshold - player.y;

    // Scroll world down
    player.y = topThreshold;

    // Move platforms and lava down (player visually moves up)
    platforms.forEach(p => p.y += delta);
    bushes.forEach(b => b.y += delta);
    lavaHeight += delta;
    scrollOffset += delta;

    // Hide ground after enough scroll
    showGround = scrollOffset < canvas.height / 2;

    // Generate new platforms above player (only 1 at a time)
    generatePlatform(player.y - 150);
  }

  // Game over if player hits lava
  if (player.y + player.height > lavaHeight) {
    endGame();
  }

  // Keep lava visible
  if (lavaHeight > canvas.height - 1) {
    lavaHeight = canvas.height - 1;
  }

  // Dashing logic
  if (player.dashing) {
    player.dashTimer -= 16.67;
    if (player.dashTimer <= 0) {
      player.dashing = false;
      player.vx = player.normalSpeed * player.dashDirection;
    }
  } else {
    if (!keysPressed["ArrowLeft"] && !keysPressed["ArrowRight"]) {
      player.vx *= 0.9;
      if (Math.abs(player.vx) < 0.1) player.vx = 0;
    }
  }
}

const keysPressed = {};

document.addEventListener("keydown", e => {
  keysPressed[e.key] = true;
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
  const bushCount = 20;

  for (let i = 0; i < bushCount; i++) {
    let size = Math.random() * 20 + 20;
    let x = Math.random() * canvas.width;
    let zIndex = Math.random() > 0.5;
    bushes.push({ x, size, zIndex, y: canvas.height - grassHeight });
  }
}


function restartGame() {
  location.reload();
}

function initializePlatforms() {
  platforms = [];
  let baseY = canvas.height - 100;

  // Generate more initial platforms (15 instead of 10)
  for (let i = 0; i < 15; i++) {
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
    const x = Math.random() * (canvas.width - width); // Now uses correct canvas width
    const y = baseY - Math.random() * 60 - 40;
    
    const speed = Math.random() * 2 + 1;
    const direction = Math.random() > 0.5 ? 1 : -1;
    
    // Generate cloud circles - smaller center, bigger surrounding circles
    const cloudCircles = [];
    const circleCount = Math.floor(Math.random() * 4) + 5; // 5-8 circles
    
    // Smaller center circle
    cloudCircles.push({
      x: width/2,
      y: 0,
      radius: width/4
    });
    
    // Larger surrounding circles
    for (let i = 0; i < circleCount; i++) {
      cloudCircles.push({
        x: Math.random() * width,
        y: Math.random() * 25 - 12.5,
        radius: Math.random() * 25 + 20 // Bigger radius (20-45)
      });
    }

    // Check for overlap
    const overlaps = platforms.some(p =>
      y < p.y + p.height &&
      y + 20 > p.y &&
      x < p.x + p.width &&
      x + width > p.x
    );

    if (!overlaps) {
      platforms.push({ 
        x, y, width, height: 20, word,
        active: false, typedProgress: "",
        speed, direction, cloudCircles
      });
      placed = true;
    }
    attempt++;
  }
}

function drawBackdrop() {
  // Draw sky background
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Only draw grass and bushes if they're above lava
  if (showGround && canvas.height - grassHeight < lavaHeight) {
    ctx.fillStyle = "#90EE90";
    ctx.fillRect(0, canvas.height - grassHeight, canvas.width, grassHeight);

    // Draw bushes
    for (let bush of bushes) {
      if (bush.y < lavaHeight) {
        ctx.fillStyle = bush.zIndex ? "#006400" : "#004d00";
        ctx.beginPath();
        ctx.moveTo(bush.x, bush.y);
        ctx.lineTo(bush.x + bush.size / 2, bush.y - bush.size);
        ctx.lineTo(bush.x + bush.size, bush.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Draw lava
  ctx.fillStyle = "red";
  ctx.fillRect(0, lavaHeight, canvas.width, canvas.height - lavaHeight);
}

function drawPlayer() {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawPlatforms() {
  platforms = platforms.filter(plat => 
    plat.y + plat.height > lavaHeight || plat.y < player.y + canvas.height
  );
  
  for (let plat of platforms) {
    if (!plat.active) {
      // Draw cloud background with more fluffiness
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      for (let circle of plat.cloudCircles) {
        ctx.beginPath();
        ctx.arc(
          plat.x + circle.x, 
          plat.y - 8 + circle.y, // Higher position
          circle.radius, 
          0, 
          Math.PI * 2
        );
        ctx.fill();
        
      }
      
      // Reset shadow
      ctx.shadowColor = "transparent";
      
      // Move platform
      plat.x += plat.speed * plat.direction;
      if (plat.x <= 0) plat.direction = 1;
      if (plat.x + plat.width >= canvas.width) plat.direction = -1;
    }
    
    // Draw platform rectangle (transparent when inactive)
    ctx.fillStyle = plat.active ? "#777" : "rgba(255, 255, 255, 0)";
    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

    // Draw word text with better visibility
    if (!plat.active) {
      const typed = plat.typedProgress;
      const remaining = plat.word.slice(typed.length);
      
      ctx.font = "bold 14px Arial";
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      
      if (typed.length > 0) {
        ctx.fillText(typed, plat.x + 10, plat.y + 15);
        const typedWidth = ctx.measureText(typed).width;
        
        ctx.font = "14px Arial";
        ctx.fillText(remaining, plat.x + 10 + typedWidth, plat.y + 15);
      } else {
        ctx.fillText(plat.word, plat.x + 10, plat.y + 15);
      }
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
  
  // Slowly rise lava
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
          // When activated, make it a solid platform
          ctx.fillStyle = "#777";
          ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        }
      } else if (plat.typedProgress.length > 0) {
        plat.typedProgress = "";
      }
    }
  }
});