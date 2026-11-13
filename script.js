// Game State & Data
let playerName = "Player 1";
let difficulty = "Easy"; // Easy, Normal, Fast
let score = 0;
let lives = 3;
let currentLevel = 1;
let levelProgress = 0; // 0 to 5 per level

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Screens
const screens = {
    start: document.getElementById('start-screen'),
    instructions: document.getElementById('instructions-screen'),
    gameplay: document.getElementById('gameplay-screen'),
    gameover: document.getElementById('gameover-screen'),
    leaderboard: document.getElementById('leaderboard-screen')
};

// UI Elements
const playerNameInput = document.getElementById('player-name');
const liveScore = document.getElementById('live-score');
const liveHearts = document.getElementById('live-hearts');
const liveLevel = document.getElementById('live-level');
const liveProgress = document.getElementById('live-progress');
const questionBox = document.getElementById('question-box');
const finalScore = document.getElementById('final-score');
const finalRank = document.getElementById('final-rank');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverMsg = document.getElementById('gameover-msg');
const leaderboardList = document.getElementById('leaderboard-list');

// Difficulty Selection
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        difficulty = e.target.getAttribute('data-diff');
    });
});

// Navigation Buttons
document.getElementById('start-game-btn').addEventListener('click', () => {
    let nameVal = playerNameInput.value.trim();
    playerName = nameVal !== "" ? nameVal : "Player 1";
    startGame();
});
document.getElementById('how-to-play-btn').addEventListener('click', () => switchScreen('instructions'));
document.getElementById('leaderboard-btn').addEventListener('click', () => { renderLeaderboard(); switchScreen('leaderboard'); });
document.getElementById('back-to-menu-btn').addEventListener('click', () => switchScreen('start'));
document.getElementById('lb-back-btn').addEventListener('click', () => switchScreen('start'));
document.getElementById('play-again-btn').addEventListener('click', () => startGame());
document.getElementById('menu-home-btn').addEventListener('click', () => switchScreen('start'));

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Game Objects
let ship = { x: canvas.width / 2, y: canvas.height - 40, size: 30, speed: 6 };
let bullets = [];
let bubbles = [];
let currentQuestion = null;
let gameInterval = null;
let keys = {};

// Controls Listeners
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        shootBullet();
    }
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// Mouse & Touch aiming
canvas.addEventListener('mousemove', e => {
    let rect = canvas.getBoundingClientRect();
    ship.x = e.clientX - rect.left;
});
canvas.addEventListener('click', () => shootBullet());
document.getElementById('fire-trigger-btn').addEventListener('click', () => shootBullet());

function startGame() {
    score = 0;
    lives = 3;
    currentLevel = 1;
    levelProgress = 0;
    ship.x = canvas.width / 2;
    bullets = [];
    bubbles = [];
    
    switchScreen('gameplay');
    nextQuestion();
    startLoop();
}

// Question Generator (makeQ)
function makeQ(level) {
    let num1, num2, op, answer;
    
    if (level === 1) { // Addition 1-9
        num1 = Math.floor(Math.random() * 9) + 1;
        num2 = Math.floor(Math.random() * 9) + 1;
        op = '+';
        answer = num1 + num2;
    } else if (level === 2) { // Subtraction up to 15, non-negative
        num1 = Math.floor(Math.random() * 15) + 1;
        num2 = Math.floor(Math.random() * (num1 + 1));
        op = '-';
        answer = num1 - num2;
    } else if (level === 3) { // Multiplication tables 2-6
        num1 = Math.floor(Math.random() * 5) + 2;
        num2 = Math.floor(Math.random() * 5) + 2;
        op = '×';
        answer = num1 * num2;
    } else if (level === 4) { // Division whole number answers, 2-6
        num2 = Math.floor(Math.random() * 5) + 2;
        let multiplier = Math.floor(Math.random() * 5) + 1;
        num1 = num2 * multiplier;
        op = '÷';
        answer = multiplier;
    } else { // Mixed operations up to 9
        let ops = ['+', '-', '×', '÷'];
        op = ops[Math.floor(Math.random() * ops.length)];
        if (op === '+') {
            num1 = Math.floor(Math.random() * 9) + 1;
            num2 = Math.floor(Math.random() * 9) + 1;
            answer = num1 + num2;
        } else if (op === '-') {
            num1 = Math.floor(Math.random() * 9) + 1;
            num2 = Math.floor(Math.random() * (num1 + 1));
            answer = num1 - num2;
        } else if (op === '×') {
            num1 = Math.floor(Math.random() * 8) + 2;
            num2 = Math.floor(Math.random() * 8) + 2;
            answer = num1 * num2;
        } else {
            num2 = Math.floor(Math.random() * 7) + 2;
            let mult = Math.floor(Math.random() * 7) + 1;
            num1 = num2 * mult;
            answer = mult;
        }
    }

    // Generate 4 choices (1 correct, 3 nearby distractors)
    let choices = [answer];
    while (choices.length < 4) {
        let offset = Math.floor(Math.random() * 5) - 2;
        let wrong = answer + offset;
        if (wrong >= 0 && !choices.includes(wrong)) {
            choices.push(wrong);
        }
    }
    // Shuffle choices array
    choices.sort(() => Math.random() - 0.5);

    return { text: `${num1} ${op} ${num2} = ?`, answer: answer, choices: choices };
}

function nextQuestion() {
    currentQuestion = makeQ(currentLevel);
    questionBox.textContent = currentQuestion.text;
    
    // Spawn 4 falling bubbles in lanes
    bubbles = [];
    let laneWidth = canvas.width / 4;
    currentQuestion.choices.forEach((val, idx) => {
        bubbles.push({
            x: laneWidth * idx + laneWidth / 2,
            y: -30,
            radius: 22,
            value: val,
            isCorrect: (val === currentQuestion.answer),
            speed: getBubbleSpeed()
        });
    });
}

function getBubbleSpeed() {
    // Speeds based on difficulty and level
    let baseSpeed = 0.8;
    if (difficulty === "Normal") baseSpeed = 1.1;
    if (difficulty === "Fast") baseSpeed = 1.5;
    return baseSpeed + (currentLevel * 0.15);
}

function shootBullet() {
    bullets.push({ x: ship.x, y: ship.y - 15, radius: 4, speed: 8 });
}

function startLoop() {
    clearInterval(gameInterval);
    gameInterval = setInterval(updateAndDraw, 1000 / 60);
}

function updateAndDraw() {
    // 1. Update Ship Position via Keyboard
    if ((keys['arrowleft'] || keys['a']) && ship.x > 20) ship.x -= ship.speed;
    if ((keys['arrowright'] || keys['d']) && ship.x < canvas.width - 20) ship.x += ship.speed;

    // 2. Update Bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= bullets[i].speed;
        if (bullets[i].y < 0) bullets.splice(i, 1);
    }

    // 3. Update Bubbles
    for (let i = bubbles.length - 1; i >= 0; i--) {
        bubbles[i].y += bubbles[i].speed;

        // Check if correct bubble reached bottom
        if (bubbles[i].y > canvas.height + 20) {
            if (bubbles[i].isCorrect) {
                lives--;
                handleWrongOrMiss();
            }
            bubbles.splice(i, 1);
            continue;
        }

        // Collision Check: Bullet vs Bubble (Loops)
        for (let b = bullets.length - 1; b >= 0; b--) {
            let dist = Math.hypot(bubbles[i].x - bullets[b].x, bubbles[i].y - bullets[b].y);
            if (dist < bubbles[i].radius + bullets[b].radius) {
                // Bullet hit bubble
                bullets.splice(b, 1);
                
                if (bubbles[i].isCorrect) {
                    // Correct Shot! (+10 pts)
                    score += 10;
                    levelProgress++;
                    bubbles = []; // Clear screen
                    
                    if (levelProgress >= 5) {
                        levelProgress = 0;
                        currentLevel++;
                        if (currentLevel > 5) {
                            endGame(true); // Victory!
                            return;
                        }
                    }
                    nextQuestion();
                } else {
                    // Wrong Shot!
                    lives--;
                    bubbles.splice(i, 1);
                    handleWrongOrMiss();
                }
                break;
            }
        }
    }

    // Update HUD DOM
    liveScore.textContent = score;
    liveHearts.textContent = '❤️'.repeat(Math.max(0, lives));
    liveLevel.textContent = currentLevel;
    liveProgress.textContent = levelProgress;

    if (lives <= 0) {
        endGame(false);
        return;
    }

    // 4. Render Graphics (Draw)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Dotted Guide Line
    ctx.strokeStyle = "rgba(0, 240, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y);
    ctx.lineTo(ship.x, 0);
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // Draw Bubbles
    bubbles.forEach(bub => {
        ctx.fillStyle = bub.isCorrect ? "#00f0ff" : "#ff007f";
        ctx.beginPath();
        ctx.arc(bub.x, bub.y, bub.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.font = "bold 15px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(bub.value, bub.x, bub.y);
    });

    // Draw Bullets
    ctx.fillStyle = "#ffe600";
    bullets.forEach(bul => {
        ctx.beginPath();
        ctx.arc(bul.x, bul.y, bul.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Ship (🤔 Emoji or custom shape)
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🤔", ship.x, ship.y);
}

function handleWrongOrMiss() {
    if (lives <= 0) {
        endGame(false);
    } else {
        nextQuestion(); // Reset screen with new question
    }
}

function endGame(isWin) {
    clearInterval(gameInterval);
    switchScreen('gameover');
    
    finalScore.textContent = score;
    if (isWin) {
        gameoverTitle.textContent = "VICTORY!";
        gameoverMsg.textContent = "Awesome job! You mastered all 5 levels!";
    } else {
        gameoverTitle.textContent = "GAME OVER";
        gameoverMsg.textContent = "Good try! Practice makes perfect.";
    }

    // Save to localStorage Leaderboard
    let leaderboard = JSON.parse(localStorage.getItem('mathBlasterScores')) || [];
    leaderboard.push({ name: playerName, diff: difficulty, score: score, date: new Date().toLocaleDateString() });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 10); // Keep top 10
    localStorage.setItem('mathBlasterScores', JSON.stringify(leaderboard));

    let rank = leaderboard.findIndex(item => item.name === playerName && item.score === score) + 1;
    finalRank.textContent = rank > 0 ? `#${rank}` : "-";
}

function renderLeaderboard() {
    let leaderboard = JSON.parse(localStorage.getItem('mathBlasterScores')) || [];
    leaderboardList.innerHTML = "";

    if (leaderboard.length === 0) {
        leaderboardList.innerHTML = `<p style="text-align:center; color:#888; padding:15px;">No scores saved yet!</p>`;
        return;
    }

    leaderboard.forEach((entry, index) => {
        let row = document.createElement('div');
        row.className = 'lb-row';
        row.innerHTML = `<span><strong>#${index+1}</strong> ${entry.name} (${entry.diff})</span> <span><strong>${entry.score} pts</strong></span>`;
        leaderboardList.appendChild(row);
    });
}