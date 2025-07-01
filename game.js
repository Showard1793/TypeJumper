const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Game state
let gameStartTime = 0;
let groundCoveredByLava = false;
const lavaGracePeriod = 10000; // 10 seconds
let showCountdown = false;
let countdownValue = 0;
const baseLavaSpeed = 0.05; // Original speed
const fastLavaSpeed = 0.25;// Increased speed after grace period
const maxLavaSpeed = 1.0; // Maximum speed lava can reach
const lavaAcceleration = 0.00001; // How quickly lava speeds up
let currentLavaSpeed = baseLavaSpeed; // Start with base speed
let gameRunning = false;
let gameOver = false;
let score = 0;
let platforms = [];
let bushes = [];
let words = [];
let typed = "";
let lavaHeight = 0;
let scrollOffset = 0;
let highestPlayerPosition = 0;
let currentTypingPlatform = null;
let lastCorrectPlatformY = 0;

// Player object
const player = {
  x: 0,
  y: 0,
  width: 20,
  height: 20,
  color: "gray",
  vy: 0,
  vx: 0,
  grounded: false,
  dashing: false,
  dashSpeed: 20,
  dashDuration: 200,
  dashTimer: 0,
  dashDirection: 1,
  normalSpeed: 5
};

// Canvas setup
function resizeCanvas() {
  const canvasWidth = window.innerWidth / 3;
  canvas.width = canvasWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Load words
fetch('words.txt')
  .then(res => res.text())
  .then(text => {
    words = text.split('\n').filter(word => word.length >= 3 && word.length <= 10);
    showStartScreen();
  });

// Game constants
const grassHeight = 100;
const platformSpacing = 150;

// Input handling
const keysPressed = {};
document.addEventListener("keydown", e => {
  keysPressed[e.key] = true;
  
  if (!gameRunning && e.key === "Enter" && words.length > 0) {
    startGame();
  }
  
  if (gameOver && e.key === "Enter") {
    restartGame();
  }

  // Handle jumping and dashing
  if (gameRunning && !gameOver) {
    if (e.key === " ") {
      if (player.grounded) {
        player.vy = -13; // Jump
      } else if (!player.dashing) {
        player.dashing = true; // Dash
        player.dashTimer = player.dashDuration;
        player.vx = player.dashSpeed * player.dashDirection;
      }
    }

    // Handle backspace
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

    // Handle typing letters
    if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
      const typedChar = e.key.toLowerCase();

      // Find the next platform above player to type on
      if (!currentTypingPlatform || 
          currentTypingPlatform.active || 
          currentTypingPlatform.y > player.y) {
        currentTypingPlatform = platforms
          .filter(p => !p.active && p.y < player.y)
          .sort((a, b) => b.y - a.y)[0];
      }

      if (currentTypingPlatform) {
        const expected = currentTypingPlatform.word[currentTypingPlatform.typedProgress.length].toLowerCase();

        if (typedChar === expected) {
          currentTypingPlatform.typedProgress += typedChar;
          currentTypingPlatform.incorrectChar = null;

          if (currentTypingPlatform.typedProgress.length === 
              currentTypingPlatform.word.trim().length) {
            currentTypingPlatform.active = true;
            currentTypingPlatform.typedProgress = "";
            score += currentTypingPlatform.word.length;
            lastCorrectPlatformY = currentTypingPlatform.y;
          }
        } else if (currentTypingPlatform.typedProgress.length > 0) {
          currentTypingPlatform.incorrectChar = typedChar;
        }
      }
    }
  }
});

document.addEventListener("keyup", e => {
  keysPressed[e.key] = false;
  if (!player.dashing) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") player.vx = 0;
  }
});



// Start screen
function showStartScreen() {
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = "#000";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Type Jumper", canvas.width/2, canvas.height/3);
  
  ctx.font = "24px Arial";
  ctx.fillText("Controls:", canvas.width/2, canvas.height/2 - 30);
  ctx.fillText("Arrow Keys: Move", canvas.width/2, canvas.height/2);
  ctx.fillText("Space: Jump", canvas.width/2, canvas.height/2 + 30);
  ctx.fillText("Space in Air: Dash", canvas.width/2, canvas.height/2 + 60);
  
  ctx.font = "bold 28px Arial";
  ctx.fillText("Press Enter to Start!", canvas.width/2, canvas.height/2 + 120);
}

function startGame() {
   showCountdown = true;
  countdownValue = lavaGracePeriod / 1000; // Convert to seconds
  groundCoveredByLava = false;
  gameRunning = true;
  gameOver = false;
  score = 0;
  scrollOffset = 0;
  highestPlayerPosition = 0;
  currentTypingPlatform = null;
  lastCorrectPlatformY = 0;
  gameStartTime = Date.now(); // Record when game started
  
  player.x = canvas.width / 2 - 10;
  player.y = canvas.height - grassHeight - 20;
  player.vy = 0;
  player.vx = 0;
  
  lavaHeight = canvas.height - 1;
  
  platforms = [];
  initializePlatforms();
  
  bushes = [];
  generateBushes();
  
  animate();
}

function generateBushes() {
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
  let baseY = canvas.height - 100;
  for (let i = 0; i < 1000; i++) {
    generatePlatform(baseY);
    baseY = platforms[platforms.length - 1].y - (Math.random() * 60 + 40);
  }
}

function generatePlatform(baseY) {
  const maxAttempts = 10;
  let attempt = 0;
  let placed = false;
  const fixedHeightDifference = 80; // Fixed vertical distance between platforms
  const minHorizontalMargin = 20; // Minimum space from screen edges

  while (attempt < maxAttempts && !placed) {
    const word = words[Math.floor(Math.random() * words.length)];
    const width =  word.length * 10;
    
    // Fixed vertical position (no randomness)
    const y = baseY - fixedHeightDifference;
    
    // Horizontal position with edge padding
    const x = minHorizontalMargin + 
              Math.random() * (canvas.width - width - minHorizontalMargin * 2);
    
    // Consistent movement speed (optional - remove if you want varied speeds)
    const speed = 1.5; // Fixed speed instead of random
    const direction = Math.random() > 0.5 ? 1 : -1;
    
    // Consistent cloud appearance
    const cloudCircles = [
      // Main center circle
      { x: width/2, y: 0, radius: width/4 },
      // Consistent surrounding circles
      { x: width * 0.2, y: -10, radius: 30 },
      { x: width * 0.8, y: -5, radius: 25 },
      { x: width * 0.3, y: 5, radius: 20 },
      { x: width * 0.7, y: 8, radius: 35 }
    ];

    const overlaps = platforms.some(p =>
      Math.abs(p.y - y) < platformSpacing &&
      ((x + width > p.x && x < p.x + p.width)
    ));

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

function updatePlayer() {
  // Handle horizontal movement
  if (!player.dashing) {
    if (keysPressed["ArrowLeft"]) {
      player.vx = -player.normalSpeed;
      player.dashDirection = -1;
    } else if (keysPressed["ArrowRight"]) {
      player.vx = player.normalSpeed;
      player.dashDirection = 1;
    } else if (!player.dashing) {
      player.vx *= 0.9;
      if (Math.abs(player.vx) < 0.1) player.vx = 0;
    }
  }

  // Apply gravity
  player.vy += 0.5;
  player.y += player.vy;
  player.x += player.vx;

  // Clamp horizontal position
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

  // Check for ground/platform collisions
  player.grounded = false;
  
  // Platform collision
  for (let plat of platforms) {
    if (
      plat.active &&
      player.x + player.width > plat.x &&
      player.x < plat.x + plat.width &&
      player.y + player.height > plat.y &&
      player.y + player.height <= plat.y + plat.height + 5 &&
      player.vy >= 0
    ) {
      player.y = plat.y - player.height;
      player.vy = 0;
      player.grounded = true;
      player.dashing = false;
    }
  }

  // Check if lava has covered the ground
  if (!groundCoveredByLava && lavaHeight <= canvas.height - grassHeight) {
    groundCoveredByLava = true;
  }

  // Ground collision (only if not covered by lava)
  const groundY = canvas.height - grassHeight;
  if (!groundCoveredByLava && player.y + player.height >= groundY && player.y + player.height < lavaHeight) {
    player.y = groundY - player.height;
    player.vy = 0;
    player.grounded = true;
    player.dashing = false;
  }

  // Handle scrolling when player goes above threshold
  const topThreshold = canvas.height / 4;
  if (player.y < topThreshold) {
    const delta = topThreshold - player.y;
    scrollOffset += delta;
    
    // Move everything down
    player.y = topThreshold;
    platforms.forEach(p => p.y += delta);
    bushes.forEach(b => b.y += delta);
    lavaHeight += delta;
  }

  // Track highest position for score
  if (player.y < highestPlayerPosition) {
    highestPlayerPosition = player.y;
  }

   // Handle lava
  const currentTime = Date.now();
  const timeSinceStart = currentTime - gameStartTime;
  
  if (timeSinceStart > lavaGracePeriod) {
    showCountdown = false;
    // Use faster lava speed after grace period
    lavaHeight -= fastLavaSpeed; 
  } else {
    // Update countdown value
    countdownValue = Math.ceil((lavaGracePeriod - timeSinceStart) / 1000);
  }
  
  // Only rise lava after grace period
  if (timeSinceStart > lavaGracePeriod) {
    // Gradually increase speed up to maxLavaSpeed
    currentLavaSpeed = Math.min(
      baseLavaSpeed + (timeSinceStart - lavaGracePeriod) * lavaAcceleration,
      maxLavaSpeed
    );
    lavaHeight -= currentLavaSpeed;
  }

  // Reset lava if it's too far below screen
  if (lavaHeight > canvas.height) {
    lavaHeight = canvas.height - 1;
    platforms = platforms.filter(p => p.y < canvas.height * 2);
  }

  // Generate new platforms when needed
  const lowestPlatform = Math.min(...platforms.map(p => p.y));
  if (lowestPlatform > player.y + canvas.height) {
    generatePlatform(player.y - platformSpacing);
  }

  // Game over if player hits lava
  if (player.y + player.height > lavaHeight && !gameOver) {
    endGame();
  }

  // Dashing logic
  if (player.dashing) {
    player.dashTimer -= 16.67;
    if (player.dashTimer <= 0) {
      player.dashing = false;
      player.vx = player.normalSpeed * player.dashDirection;
    }
  }
}

function drawBackdrop() {
  // Draw sky background
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Only draw ground if not covered by lava
  if (!groundCoveredByLava) {
    ctx.fillStyle = "#90EE90";
    ctx.fillRect(0, canvas.height - grassHeight, canvas.width, grassHeight);
  }

  // Draw countdown message
  if (showCountdown && countdownValue > 0) {
    const messageY = canvas.height - 40 ;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    
    if (countdownValue <= 3) {
      ctx.fillStyle = "rgba(255, 50, 50, 0.8)";
    }
    
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.strokeText(`Lava rises in: ${countdownValue}`, canvas.width/2, messageY);
    ctx.fillText(`Lava rises in: ${countdownValue}`, canvas.width/2, messageY);
  }
}
function drawPlayer() {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawPlatforms() {
  // Remove platforms that are too far below
  platforms = platforms.filter(plat => plat.y < player.y + canvas.height * 2);
  
  for (let plat of platforms) {
    if (!plat.active) {
      // Draw cloud
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      for (let circle of plat.cloudCircles) {
        ctx.beginPath();
        ctx.arc(plat.x + circle.x, plat.y - 8 + circle.y, circle.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Move platform
      plat.x += plat.speed * plat.direction;
      if (plat.x <= 0) plat.direction = 1;
      if (plat.x + plat.width >= canvas.width) plat.direction = -1;
    }
    
    // Draw platform
    ctx.fillStyle = plat.active ? "#777" : "rgba(255, 255, 255, 0)";
    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

        // Draw word with typing feedback
    if (!plat.active) {
      const word = plat.word;
      const typed = plat.typedProgress || "";
      const textX = plat.x + 10; // Left-aligned position
      const wordY = plat.y + 15; // Cloud word position
      const typedY = plat.y + 35; // Typed text position (below cloud word)
      
      // Draw cloud word (left-aligned)
      ctx.font = "20px Arial";
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.textAlign = "left"; // Ensure left alignment
      ctx.fillText(word, textX, wordY);
      
      // Draw typed text (left-aligned directly below)
      if (typed.length > 0) {
        if (word.startsWith(typed)) {
          // Correct typing
          ctx.font = "bold 20px Arial";
          ctx.fillText(typed, textX, typedY);
        } else {
          // Incorrect typing
          let correctLength = 0;
          while (correctLength < typed.length && 
                 typed[correctLength] === word[correctLength]) {
            correctLength++;
          }
          
          if (correctLength > 0) {
            ctx.font = "bold 14px Arial";
            ctx.fillText(typed.substring(0, correctLength), textX, typedY);
          }
          
          if (correctLength < typed.length) {
            const incorrectPart = typed.substring(correctLength);
            const correctWidth = ctx.measureText(typed.substring(0, correctLength)).width;
            
            ctx.font = "14px Arial";
            ctx.fillStyle = "red";
            ctx.fillText(incorrectPart, textX + correctWidth, typedY);
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

function endGame() {
  gameRunning = false;
  gameOver = true;
  
  // Draw game over screen
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = "#fff";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Game Over", canvas.width/2, canvas.height/2 - 40);
  
  ctx.font = "36px Arial";
  ctx.fillText(`Final Score: ${score}`, canvas.width/2, canvas.height/2 + 20);
  
  ctx.font = "24px Arial";
  ctx.fillText("Press Enter to Restart", canvas.width/2, canvas.height/2 + 80);
}

function animate() {
  if (!gameRunning) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  updatePlayer();
  drawBackdrop(); // Draws sky and countdown
  drawPlatforms(); // Draws all platforms
  drawPlayer(); // Draws player
  
  // Draw lava last so it covers everything
  ctx.fillStyle = "rgba(255, 0, 0, 0.7)";
  ctx.fillRect(0, lavaHeight, canvas.width, canvas.height - lavaHeight);
  
  // Lava top gradient
  const lavaTop = ctx.createLinearGradient(0, lavaHeight - 10, 0, lavaHeight);
  lavaTop.addColorStop(0, "rgba(255, 100, 0, 0.8)");
  lavaTop.addColorStop(1, "rgba(255, 0, 0, 0.7)");
  ctx.fillStyle = lavaTop;
  ctx.fillRect(0, lavaHeight - 10, canvas.width, 10);

  drawScore(); // Draw score last so it's always visible
  
  requestAnimationFrame(animate);
}