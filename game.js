/**
 * Vector Space Defender - Blueprint Tactical Edition
 * Core Game Engine (Optimized & Bug-Free)
 */

// 1. الواجهة التسويقية المرنة (Promo Config)
const PROMO_CONFIG = {
    showBanner: true,
    text: "استكشف أحدث الألعاب والمنتجات الرقمية على ريشة!",
    buttonText: "زيارة المتجر",
    url: "https://www.risha.sa"
};

// ============================================================================
// 2. إعدادات المحرك والثوابت (Engine Config & Constants)
// ============================================================================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d', { alpha: true });

const COLORS = {
    cyan: '#00f5d4',
    white: '#ffffff',
    electric: '#00b4d8',
    alert: '#f77f00',
    danger: '#ef233c',
    shield: '#9d4edd'
};

let GAME_WIDTH = 480;
let GAME_HEIGHT = 800;

// ============================================================================
// 3. المحرك الصوتي الناعم (Soft Audio Engine)
// ============================================================================
const AudioEngine = (function() {
    let ctx = null;
    let enabled = false;

    function init() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            enabled = true;
        }
        if (ctx.state === 'suspended') ctx.resume();
    }

    function playTone(freq, type = 'sine', duration = 0.04, vol = 0.05) {
        if (!enabled || !ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    }

    return {
        init,
        shoot: () => playTone(880, 'sine', 0.05, 0.03),
        enemyShoot: () => playTone(440, 'triangle', 0.06, 0.02),
        hit: () => playTone(200, 'triangle', 0.1, 0.04),
        damage: () => playTone(150, 'square', 0.15, 0.05),
        explosion: () => {
            playTone(100, 'triangle', 0.2, 0.08);
            setTimeout(() => playTone(80, 'sine', 0.2, 0.05), 50);
        },
        powerup: () => {
            playTone(400, 'sine', 0.1, 0.05);
            setTimeout(() => playTone(600, 'sine', 0.2, 0.05), 100);
        },
        win: () => {
            [440, 554, 659, 880].forEach((freq, i) => {
                setTimeout(() => playTone(freq, 'sine', 0.3, 0.06), i * 150);
            });
        },
        emp: () => playTone(300, 'sine', 0.5, 0.1)
    };
})();

// ============================================================================
// 4. توليد البيانات التكتيكية للمراحل (25 Tactical Levels Generator)
// ============================================================================
function generateLevels() {
    const levels = [];
    for (let i = 1; i <= 25; i++) {
        let wave = { id: i, enemies: [] };
        let baseHealth = 1 + Math.floor(i / 5);
        let isBossLevel = (i % 5 === 0);
        
        if (isBossLevel) {
            wave.enemies.push({ type: 'boss', x: GAME_WIDTH / 2, y: -100, hp: 20 + i * 2, delay: 0 });
            wave.enemies.push({ type: 'weaver', x: GAME_WIDTH * 0.2, y: -50, hp: baseHealth, delay: 1 });
            wave.enemies.push({ type: 'weaver', x: GAME_WIDTH * 0.8, y: -50, hp: baseHealth, delay: 1 });
        } else {
            let count = 4 + Math.floor(i * 0.6);
            for (let e = 0; e < count; e++) {
                let type = 'striker';
                if (i > 3 && e % 3 === 0) type = 'weaver';
                if (i > 7 && e % 4 === 0) type = 'tank';

                wave.enemies.push({
                    type: type,
                    x: 40 + Math.random() * (GAME_WIDTH - 80),
                    y: -50 - (e * 80),
                    hp: type === 'tank' ? baseHealth * 2 : baseHealth,
                    delay: e * 0.5
                });
            }
        }
        levels.push(wave);
    }
    return levels;
}
const LEVELS_DATA = generateLevels();

// ============================================================================
// 5. إدارة حالة اللعبة ونظام الحفظ (State & Save System)
// ============================================================================
const SaveSystem = {
    data: { levels: [{ id: 1, stars: 0, unlocked: true }] },
    load() {
        const saved = localStorage.getItem('vsd_save');
        if (saved) {
            try { this.data = JSON.parse(saved); } catch (e) {}
        }
    },
    save() {
        localStorage.setItem('vsd_save', JSON.stringify(this.data));
    },
    reset() {
        this.data = { levels: [{ id: 1, stars: 0, unlocked: true }] };
        this.save();
    },
    unlockNext(currentId, stars) {
        let currentLvl = this.data.levels.find(l => l.id === currentId);
        if (!currentLvl) {
            currentLvl = { id: currentId, stars: stars, unlocked: true };
            this.data.levels.push(currentLvl);
        } else {
            currentLvl.stars = Math.max(currentLvl.stars, stars);
        }
        
        if (currentId < 25) {
            let nextLvl = this.data.levels.find(l => l.id === currentId + 1);
            if (!nextLvl) {
                this.data.levels.push({ id: currentId + 1, stars: 0, unlocked: true });
            }
        }
        this.save();
    }
};
SaveSystem.load();

let state = {
    screen: 'main', 
    level: 1,
    score: 0,
    lives: 3,
    shotsFired: 0,
    shotsHit: 0,
    shieldLost: false,
    lastTime: 0,
    reqId: null,
    isVictory: false
};

// ============================================================================
// 6. مدخلات التحكم (Input Handling)
// ============================================================================
const Input = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT * 0.8,
    isFiring: false,
    keys: {}
};

function updateInputCoord(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    Input.x = (clientX - rect.left) * scaleX;
    Input.y = (clientY - rect.top) * scaleY;
}

canvas.addEventListener('pointerdown', e => { 
    if (state.screen !== 'playing') return;
    updateInputCoord(e.clientX, e.clientY);
    Input.isFiring = true;
});
canvas.addEventListener('pointermove', e => {
    // تم إزالة شرط (isFiring) لتتحرك المركبة دائماً مع المؤشر
    if (state.screen !== 'playing') return;
    updateInputCoord(e.clientX, e.clientY);
});
window.addEventListener('pointerup', () => Input.isFiring = false);

window.addEventListener('keydown', e => {
    Input.keys[e.code] = true;
    if (e.code === 'Space') Input.isFiring = true;
    if (e.code === 'Escape' && state.screen === 'playing') togglePause();
});
window.addEventListener('keyup', e => {
    Input.keys[e.code] = false;
    if (e.code === 'Space') Input.isFiring = false;
});

// ============================================================================
// 7. الكيانات ومجمعات الكائنات المطورة (Object Pooling - Ring Buffer)
// ============================================================================
const Pool = {
    bullets: Array.from({ length: 150 }, () => ({ active: false })), bIdx: 0,
    particles: Array.from({ length: 200 }, () => ({ active: false })), pIdx: 0,
    enemies: Array.from({ length: 30 }, () => ({ active: false })), eIdx: 0,
    powerups: Array.from({ length: 5 }, () => ({ active: false })), pwIdx: 0,
    emps: Array.from({ length: 5 }, () => ({ active: false, radius: 0 })), empIdx: 0
};

// دالة ذكية للبحث الفوري بدون استهلاك معالج (O(1) Ring Buffer)
function getFromPool(poolArray, indexKey) {
    for (let i = 0; i < poolArray.length; i++) {
        Pool[indexKey] = (Pool[indexKey] + 1) % poolArray.length;
        if (!poolArray[Pool[indexKey]].active) return poolArray[Pool[indexKey]];
    }
    return null;
}

function getBullet() { return getFromPool(Pool.bullets, 'bIdx'); }
function getParticle() { return getFromPool(Pool.particles, 'pIdx'); }
function getEnemy() { return getFromPool(Pool.enemies, 'eIdx'); }
function getPowerup() { return getFromPool(Pool.powerups, 'pwIdx'); }
function getEMP() { return getFromPool(Pool.emps, 'empIdx'); }

// ----- اللاعب (Player) -----
const Player = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT * 0.8,
    size: 15,
    speed: 350,
    fireTimer: 0,
    fireRate: 0.12,
    shield: false,
    twinBeamTime: 0,
    
    update(dt) {
        let usingKeyboard = Object.keys(Input.keys).some(k => Input.keys[k]);
        
        if (usingKeyboard) {
            if (Input.keys['ArrowLeft'] || Input.keys['KeyA']) this.x -= this.speed * dt;
            if (Input.keys['ArrowRight'] || Input.keys['KeyD']) this.x += this.speed * dt;
            if (Input.keys['ArrowUp'] || Input.keys['KeyW']) this.y -= this.speed * dt;
            if (Input.keys['ArrowDown'] || Input.keys['KeyS']) this.y += this.speed * dt;
            
            // مزامنة الماوس مع الكيبورد لمنع الانزلاق (Fix Bug #1)
            Input.x = this.x;
            Input.y = this.y + 40; 
        } else {
            // اللمس/الماوس (معادلة Lerp بالتلاشي الأسي للحركة الناعمة - Fix Bug #2)
            let lerpFactor = 1 - Math.exp(-15 * dt);
            this.x += (Input.x - this.x) * lerpFactor;
            this.y += (Input.y - 40 - this.y) * lerpFactor; 
        }

        this.x = Math.max(this.size, Math.min(GAME_WIDTH - this.size, this.x));
        this.y = Math.max(this.size, Math.min(GAME_HEIGHT - this.size, this.y));

        if (this.twinBeamTime > 0) this.twinBeamTime -= dt;

        this.fireTimer -= dt;
        if (Input.isFiring && this.fireTimer <= 0) {
            this.shoot();
            this.fireTimer = this.fireRate;
        }
    },

    shoot() {
        // تُحسب الطلقة المزدوجة كعملية إطلاق واحدة في نظام التقييم (Fix Bug #8)
        state.shotsFired++; 
        
        if (this.twinBeamTime > 0) {
            this.spawnBullet(this.x - 8, this.y, -800, COLORS.cyan);
            this.spawnBullet(this.x + 8, this.y, -800, COLORS.cyan);
        } else {
            this.spawnBullet(this.x, this.y - 10, -800, COLORS.cyan);
        }
        AudioEngine.shoot();
    },

    spawnBullet(x, y, vy, color) {
        let b = getBullet();
        if (b) {
            b.active = true; b.isEnemy = false;
            b.x = x; b.y = y; b.vy = vy; b.vx = 0;
            b.color = color; b.size = 2;
        }
    },

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        if (this.shield) {
            ctx.beginPath();
            ctx.arc(0, 0, this.size + 10, 0, Math.PI * 2);
            ctx.strokeStyle = COLORS.shield;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(0, -this.size);
        ctx.lineTo(this.size, this.size);
        ctx.lineTo(0, this.size - 5);
        ctx.lineTo(-this.size, this.size);
        ctx.closePath();
        
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(-5, this.size);
        ctx.lineTo(0, this.size + 10 + Math.random()*5);
        ctx.lineTo(5, this.size);
        ctx.strokeStyle = COLORS.white;
        ctx.stroke();

        ctx.restore();
    }
};

// ----- الأعداء (Enemies) -----
function spawnEnemy(data) {
    let e = getEnemy();
    if (e) {
        e.active = true;
        e.type = data.type;
        e.x = data.x; e.y = data.y;
        e.hp = data.hp; e.maxHp = data.hp;
        e.timer = 0;
        e.startX = data.x;
        e.delay = data.delay || 0;
        
        if (e.type === 'striker') { e.size = 15; e.color = COLORS.alert; e.score = 100; }
        else if (e.type === 'weaver') { e.size = 12; e.color = COLORS.electric; e.score = 150; }
        else if (e.type === 'tank') { e.size = 20; e.color = COLORS.danger; e.score = 250; }
        else if (e.type === 'boss') { e.size = 40; e.color = COLORS.danger; e.score = 1000; }
    }
}

function updateEnemies(dt, speedMult) {
    Pool.enemies.forEach(e => {
        if (!e.active) return;
        
        if (e.delay > 0) { e.delay -= dt; return; }

        e.timer += dt;
        let speed = 100 * speedMult;

        if (e.type === 'striker') {
            e.y += speed * dt;
            if (e.timer > 1.5 && Math.random() < 0.02) { e.timer = 0; fireEnemyBullet(e); }
        } 
        else if (e.type === 'weaver') {
            e.y += speed * 1.2 * dt;
            e.x = e.startX + Math.sin(e.timer * 3) * 50; 
        }
        else if (e.type === 'tank') {
            e.y += speed * 0.5 * dt;
            if (e.timer > 2) { e.timer = 0; fireEnemyBullet(e, 3); } 
        }
        else if (e.type === 'boss') {
            if (e.y < 100) e.y += speed * 0.5 * dt; 
            e.x = GAME_WIDTH/2 + Math.sin(e.timer) * 100; 
            if (e.timer > 1.5) { e.timer = 0; fireEnemyBullet(e, 5); }
        }

        if (e.y > GAME_HEIGHT + 50) e.active = false;
    });
}

function fireEnemyBullet(enemy, count = 1) {
    AudioEngine.enemyShoot();
    if (count === 1) {
        let b = getBullet();
        if (b) { b.active = true; b.isEnemy = true; b.x = enemy.x; b.y = enemy.y + enemy.size; b.vy = 300; b.vx = 0; b.color = COLORS.alert; b.size = 3; }
    } else {
        for (let i = 0; i < count; i++) {
            let b = getBullet();
            if (b) {
                b.active = true; b.isEnemy = true; b.x = enemy.x; b.y = enemy.y + enemy.size;
                let angle = (Math.PI / (count - 1)) * i;
                b.vy = Math.sin(angle) * 200 + 100;
                b.vx = Math.cos(angle) * 200;
                b.color = COLORS.alert; b.size = 3;
            }
        }
    }
}

function drawEnemies(speedMult) {
    Pool.enemies.forEach(e => {
        if (!e.active || e.delay > 0) return;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;

        if (speedMult > 1) { ctx.shadowBlur = 10; ctx.shadowColor = e.color; }

        ctx.beginPath();
        if (e.type === 'striker') {
            ctx.moveTo(0, e.size); ctx.lineTo(-e.size, -e.size); ctx.lineTo(e.size, -e.size);
        } else if (e.type === 'weaver') {
            ctx.moveTo(0, e.size); ctx.lineTo(-e.size, 0); ctx.lineTo(0, -e.size); ctx.lineTo(e.size, 0);
        } else if (e.type === 'tank') {
            ctx.moveTo(-e.size/2, e.size); ctx.lineTo(e.size/2, e.size); ctx.lineTo(e.size, 0);
            ctx.lineTo(e.size/2, -e.size); ctx.lineTo(-e.size/2, -e.size); ctx.lineTo(-e.size, 0);
        } else if (e.type === 'boss') {
            ctx.arc(0, 0, e.size, 0, Math.PI * 2);
            ctx.moveTo(-10, -10); ctx.lineTo(10, 10);
            ctx.moveTo(10, -10); ctx.lineTo(-10, 10);
        }
        ctx.closePath();
        ctx.stroke();

        if (e.type === 'boss' || e.type === 'tank') {
            ctx.fillStyle = COLORS.danger;
            ctx.fillRect(-e.size, -e.size - 10, (e.size*2) * (e.hp / e.maxHp), 3);
        }
        ctx.restore();
    });
}

// ----- الجزيئات (Particles) -----
function spawnExplosion(x, y, color, count) {
    AudioEngine.explosion();
    for (let i = 0; i < count; i++) {
        let p = getParticle();
        if (p) {
            p.active = true; p.x = x; p.y = y;
            let angle = Math.random() * Math.PI * 2;
            let speed = 50 + Math.random() * 150;
            p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed;
            p.life = 0.5 + Math.random() * 0.5; p.maxLife = p.life;
            p.color = color;
        }
    }
}

function updateDrawParticles(dt) {
    Pool.particles.forEach(p => {
        if (!p.active) return;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) p.active = false;
        else {
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.vx * 0.05, p.y + p.vy * 0.05);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    });
}

// ----- الرصاص (Bullets) -----
function updateDrawBullets(dt) {
    Pool.bullets.forEach(b => {
        if (!b.active) return;
        b.x += b.vx * dt; b.y += b.vy * dt;
        
        if (b.y < -50 || b.y > GAME_HEIGHT + 50 || b.x < -50 || b.x > GAME_WIDTH + 50) b.active = false;

        if (b.active) {
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x, b.y + (b.vy > 0 ? -10 : 10)); 
            ctx.stroke();
        }
    });
}

// ----- جوائز القوة والنبضات (PowerUps & EMPs) -----
function spawnPowerup(x, y) {
    if (Math.random() > 0.15) return;
    let p = getPowerup();
    if (p) {
        p.active = true; p.x = x; p.y = y; p.vy = 80;
        const types = ['shield', 'twin', 'emp'];
        p.type = types[Math.floor(Math.random() * types.length)];
        p.color = p.type === 'shield' ? COLORS.shield : (p.type === 'twin' ? COLORS.cyan : COLORS.electric);
    }
}

function updateDrawPowerups(dt) {
    Pool.powerups.forEach(p => {
        if (!p.active) return;
        p.y += p.vy * dt;
        if (p.y > GAME_HEIGHT) p.active = false;

        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Date.now() / 300);
        ctx.beginPath();
        ctx.rect(-8, -8, 16, 16);
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.font = '10px Share Tech Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.type === 'shield' ? 'S' : (p.type === 'twin' ? 'T' : 'E'), 0, 0);
        ctx.restore();
    });
}

function activateEMP() {
    AudioEngine.emp();
    let emp = getEMP();
    if (emp) {
        emp.active = true;
        emp.radius = 1;
        emp.x = Player.x;
        emp.y = Player.y;
    }
    // تدمير الطلقات المعادية الموجودة حالياً
    Pool.bullets.forEach(b => { if (b.active && b.isEnemy) b.active = false; });
}

function updateDrawEMPs(dt) {
    Pool.emps.forEach(emp => {
        if (!emp.active) return;
        emp.radius += 1000 * dt;
        ctx.beginPath();
        ctx.arc(emp.x, emp.y, emp.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 180, 216, ${Math.max(0, 1 - emp.radius/GAME_WIDTH)})`;
        ctx.lineWidth = 5;
        ctx.stroke();
        if (emp.radius > GAME_WIDTH) emp.active = false;
    });
}

// ============================================================================
// 8. المنطق الأساسي والتصادم (Collisions & Game Loop)
// ============================================================================
function checkCollisions() {
    Pool.bullets.filter(b => b.active && !b.isEnemy).forEach(b => {
        Pool.enemies.filter(e => e.active && e.delay <= 0).forEach(e => {
            if (b.active && Math.hypot(b.x - e.x, b.y - e.y) < e.size + 5) {
                b.active = false;
                state.shotsHit++;
                e.hp--;
                AudioEngine.hit();
                if (e.hp <= 0) {
                    e.active = false;
                    spawnExplosion(e.x, e.y, e.color, e.type === 'boss' ? 50 : 15);
                    addScore(e.score);
                    spawnPowerup(e.x, e.y);
                } else {
                    spawnExplosion(e.x, e.y, COLORS.white, 3);
                }
            }
        });
    });

    if (!state.isVictory) {
        Pool.bullets.filter(b => b.active && b.isEnemy).forEach(b => {
            if (Math.hypot(b.x - Player.x, b.y - Player.y) < Player.size) { b.active = false; takeDamage(); }
        });

        Pool.enemies.filter(e => e.active && e.delay <= 0).forEach(e => {
            if (Math.hypot(e.x - Player.x, e.y - Player.y) < Player.size + e.size - 5) {
                e.active = false;
                spawnExplosion(e.x, e.y, e.color, 15);
                takeDamage();
            }
        });

        Pool.powerups.filter(p => p.active).forEach(p => {
            if (Math.hypot(p.x - Player.x, p.y - Player.y) < Player.size + 15) {
                p.active = false;
                applyPowerup(p.type);
            }
        });
    }
}

function applyPowerup(type) {
    AudioEngine.powerup();
    if (type === 'shield') {
        if (Player.shield) addScore(500); // تعويض ذكي لمن يمتلك درعاً مسبقاً (Fix Bug #7)
        else Player.shield = true;
    }
    else if (type === 'twin') Player.twinBeamTime = 4; 
    else if (type === 'emp') activateEMP();
    addScore(50);
}

function takeDamage() {
    if (Player.shield) {
        Player.shield = false;
        state.shieldLost = true;
        spawnExplosion(Player.x, Player.y, COLORS.shield, 20);
        AudioEngine.hit();
        return;
    }
    state.lives--;
    updateHUD();
    spawnExplosion(Player.x, Player.y, COLORS.cyan, 30);
    AudioEngine.damage();
    
    if (state.lives <= 0) gameOver(false);
}

function addScore(pts) {
    state.score += pts;
    document.getElementById('hud-score').innerText = state.score;
}

function updateHUD() {
    document.getElementById('hud-lives').innerText = state.lives;
    document.getElementById('hud-level').innerText = state.level;
}

// ============================================================================
// 9. الدورة الرئيسية وإدارة الشاشات (Main Loop & UI Transitions)
// ============================================================================
function update(dt) {
    let aliveEnemies = Pool.enemies.filter(e => e.active).length;
    let speedMult = (aliveEnemies > 0 && aliveEnemies <= 2) ? 1.25 : 1.0;

    Player.update(dt);
    updateEnemies(dt, speedMult);
    updateDrawBullets(dt);
    updateDrawParticles(dt);
    updateDrawPowerups(dt);
    updateDrawEMPs(dt); // النبضات المتعددة (Fix Bug #6)
    checkCollisions();

    if (aliveEnemies === 0 && !state.isVictory) {
        let pendingSpawns = Pool.enemies.some(e => e.active && e.delay > 0);
        if (!pendingSpawns) {
            state.isVictory = true;
            setTimeout(() => gameOver(true), 1500);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    Player.draw();
    let aliveEnemies = Pool.enemies.filter(e => e.active).length;
    let speedMult = (aliveEnemies > 0 && aliveEnemies <= 2) ? 1.25 : 1.0;
    drawEnemies(speedMult);
}

function loop(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    let dt = (timestamp - state.lastTime) / 1000;
    state.lastTime = timestamp;
    if (dt > 0.1) dt = 0.1; 
    
    // تجميد إطار الشاشة بالكامل عند الإيقاف المؤقت (Fix Bug #3)
    if (state.screen === 'playing') {
        update(dt);
        draw();
    }
    state.reqId = requestAnimationFrame(loop);
}

// ============================================================================
// 10. واجهة المستخدم والربط (UI Binding)
// ============================================================================
function switchScreen(screenId) {
    document.querySelectorAll('.ui-screen').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    if(screenId) {
        document.getElementById(`screen-${screenId}`).classList.remove('hidden');
        document.getElementById(`screen-${screenId}`).classList.add('active');
    }
    state.screen = screenId;
}

function loadLevelGrid() {
    const grid = document.getElementById('level-select-grid');
    grid.innerHTML = '';
    for (let i = 1; i <= 25; i++) {
        let btn = document.createElement('button');
        let lvlData = SaveSystem.data.levels.find(l => l.id === i);
        
        btn.className = `level-btn ${lvlData ? 'unlocked' : 'locked'}`;
        
        let html = `<span>المرحلة ${i}</span><div class="level-stars">`;
        for (let s = 1; s <= 3; s++) {
            html += `<span class="star ${lvlData && lvlData.stars >= s ? 'earned' : ''}">★</span>`;
        }
        html += `</div>`;
        btn.innerHTML = html;

        if (lvlData) {
            btn.onclick = () => { AudioEngine.init(); startLevel(i); };
        }
        grid.appendChild(btn);
    }
}

function startLevel(lvl) {
    state.level = lvl;
    state.score = 0;
    state.lives = 3;
    state.shotsFired = 0;
    state.shotsHit = 0;
    state.shieldLost = false;
    state.isVictory = false;
    
    Player.x = GAME_WIDTH / 2;
    Player.y = GAME_HEIGHT * 0.8;
    Player.shield = false;
    Player.twinBeamTime = 0;

    Object.keys(Pool).forEach(key => {
        if (Array.isArray(Pool[key])) Pool[key].forEach(item => item.active = false);
    });

    let wave = LEVELS_DATA[lvl - 1];
    wave.enemies.forEach(enemyData => spawnEnemy(enemyData));

    updateHUD();
    document.getElementById('hud').classList.remove('hidden');
    switchScreen('playing');
    
    if (!state.reqId) state.reqId = requestAnimationFrame(loop);
}

function togglePause() {
    if (state.screen === 'playing') {
        switchScreen('pause');
    } else if (state.screen === 'pause') {
        state.lastTime = performance.now(); 
        switchScreen('playing');
    }
}

function gameOver(victory) {
    document.getElementById('hud').classList.add('hidden');
    switchScreen('result');
    
    // تقييد نسبة الدقة القصوى بـ 100% للتسامح مع الطلقات المزدوجة
    let acc = state.shotsFired > 0 ? Math.min(100, Math.round((state.shotsHit / state.shotsFired) * 100)) : 0;
    
    document.getElementById('result-title').innerText = victory ? "القطاع آمن - تمت المهمة" : "فشلت المهمة - تحطمت المركبة";
    document.getElementById('result-title').style.color = victory ? COLORS.cyan : COLORS.danger;
    
    document.getElementById('result-score').innerText = state.score;
    document.getElementById('result-accuracy').innerText = acc;

    let stars = 0;
    if (victory) {
        AudioEngine.win();
        stars = 1; 
        if (acc > 50) stars = 2; 
        if (acc > 75 && !state.shieldLost) stars = 3; 
        SaveSystem.unlockNext(state.level, stars);
        document.getElementById('btn-next-level').classList.remove('hidden');
    } else {
        document.getElementById('btn-next-level').classList.add('hidden');
    }

    const starsContainer = document.getElementById('result-stars');
    starsContainer.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
        starsContainer.innerHTML += `<span class="star ${i <= stars ? 'earned' : ''}">★</span>`;
    }
}

// ----------------------------------------------------------------------------
// ربط الأزرار وإعداد التسويق (Bindings & Promo Setup)
// ----------------------------------------------------------------------------
window.onload = () => {
    canvas.width = GAME_WIDTH;
    canvas.height = GAME_HEIGHT;

    if (PROMO_CONFIG.showBanner) {
        document.getElementById('promo-container').classList.remove('hidden');
        document.getElementById('promo-text').innerText = PROMO_CONFIG.text;
        const pLink = document.getElementById('promo-link');
        pLink.innerText = PROMO_CONFIG.buttonText;
        pLink.href = PROMO_CONFIG.url;
    }

    document.getElementById('btn-start').onclick = () => { AudioEngine.init(); startLevel(1); };
    document.getElementById('btn-to-levels').onclick = () => { AudioEngine.init(); loadLevelGrid(); switchScreen('levels'); };
    
    document.getElementById('btn-back-main').onclick = () => switchScreen('main');
    document.getElementById('btn-reset-progress').onclick = () => {
        document.getElementById('modal-confirm').classList.remove('hidden');
        document.getElementById('modal-confirm').classList.add('active');
    };
    
    document.getElementById('btn-confirm-reset').onclick = () => {
        SaveSystem.reset();
        loadLevelGrid();
        document.getElementById('modal-confirm').classList.add('hidden');
        document.getElementById('modal-confirm').classList.remove('active');
    };
    document.getElementById('btn-cancel-reset').onclick = () => {
        document.getElementById('modal-confirm').classList.add('hidden');
        document.getElementById('modal-confirm').classList.remove('active');
    };

    document.getElementById('btn-pause').onclick = togglePause;
    document.getElementById('btn-resume').onclick = togglePause;
    document.getElementById('btn-quit-to-main').onclick = () => {
        document.getElementById('hud').classList.add('hidden');
        switchScreen('main');
    };

    document.getElementById('btn-retry').onclick = () => startLevel(state.level);
    document.getElementById('btn-next-level').onclick = () => {
        if(state.level < 25) startLevel(state.level + 1);
        else switchScreen('levels');
    };
    document.getElementById('btn-result-menu').onclick = () => switchScreen('main');
    
    requestAnimationFrame(loop);
};
