// 班级管理系统 | Copyright (c) 2026 黄迁胜 | 根据 MIT 许可证授权
// pet.js - 双模式版（贪吃蛇 + 斗蛐蛐）
// 斗蛐蛐模式 v2.2 — 新增破防过滤，攻击力≤防御力时自动换目标

const CATEGORIES = ['安全', '道德', '艺体', '学习', '纪律', '卫生', '仪态', '就餐', '住宿', '走读'];
const CAT_ICONS = ['🛡️', '⚖️', '🎨', '📚', '📋', '🧹', '👔', '🥢', '🛏️', '🚌'];
const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '历史', '地理', '生物', '政治'];
const SUB_ABBR = { '语文': '语', '数学': '数', '英语': '英', '物理': '物', '化学': '化', '历史': '史', '地理': '地', '生物': '生', '政治': '政' };

function getClassFromURL() {
    const params = new URLSearchParams(window.location.search);
    const classId = params.get('classId') || params.get('class');
    if (!classId) return localStorage.getItem('currentClassId') || '一班';
    localStorage.setItem('currentClassId', classId);
    return classId;
}
const CURRENT_CLASS = getClassFromURL();

// ===== 常量 =====
const QUEUE_MERGE_DIST = 80;
const COLLISION_RADIUS_RATIO = 0.4;
const COLLISION_COOLDOWN = 300;
const PULSE_DURATION = 300;
const PARTICLE_COUNT = 4;
const DISPERSE_PARTICLE_COUNT = 8;
const HISTORY_LENGTH = 300;
const QUEUE_FOLLOW_SPEED = 0.6;
const QUEUE_HISTORY_STEP = 30;
const MAX_PARTICLES = 200;

const SPEED_MIN = 0;
const SPEED_MAX = 3.0;
const SPEED_MID = 80;
const SPEED_SLOPE = 0.015;
const SIZE_MIN = 0;
const SIZE_MAX = 350;
const SIZE_MID = 500;
const SIZE_SLOPE = 0.006;

const ITEM_TYPES = ['🍎', '⚽', '🍰', '🍬', '⭐', '🎁', '🍭', '🍩', '🧸', '🍉', '🍌', '🍫', '🥇', '🎪', '🌈'];
const ITEM_PICKUP_DIST = 40;
const ITEM_EMOJI_SIZE_BASE = 24;

// 基础攻击间隔60帧（1秒）
const BASE_ATTACK_COOLDOWN = 60;
// 自然回血间隔10秒
const REGEN_INTERVAL = 10;
// 基础攻击范围
const BASE_ATTACK_RANGE = 50;
const CHASE_RANGE = 75;
const ESCAPE_THRESHOLD = 0.30;
const CAUTIOUS_THRESHOLD = 0.50;
const ESCAPE_DIST = 200;
const SMOOTH_FACTOR = 0.15;
// 攻击速度上限（次/秒）
const MAX_ATTACK_SPEED = 10;
// 控制时间转化比例（每10点控制力转化为1秒定身）
const CONTROL_TO_STUN_RATIO = 10;

const GAME_MODE = { SNAKE: 'snake', BATTLE: 'battle' };

// ===== 全局变量 =====
let students = [];
let activeCategories = new Set();
let activeSubjects = new Set();
let petAnimId = null;
let petPositions = {};
let collisionTimers = {};
let globalSizeFactor = 1.0;
let globalSpeedFactor = 1.0;
let frameCount = 0;
let groupLabels = {};
let nextQueueId = 1;
let queues = {};
let items = [];
let itemIdCounter = 0;
let flyingItem = null;
let snakeGameOver = false;
let snakeWinnerGroup = null;
let snakeVictoryBanner = null;

// 参与统计存储键
const PARTICIPATION_KEY = 'participation_' + CURRENT_CLASS;

// 获取当前周次
function getCurrentWeek() {
    return DataManager.loadWeek(CURRENT_CLASS) || '1';
}

// 加载参与记录
function loadParticipation() {
    const week = getCurrentWeek();
    const key = PARTICIPATION_KEY + '_' + week;
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

// 保存参与记录
function saveParticipation(data) {
    const week = getCurrentWeek();
    const key = PARTICIPATION_KEY + '_' + week;
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
}

// 记录本周参与（传入学生ID数组，增加场次）
function recordParticipation(studentIds) {
    const data = loadParticipation();
    studentIds.forEach(id => {
        data[id] = (data[id] || 0) + 1;
    });
    saveParticipation(data);
}

// 获取某学生本周参与场次
function getParticipationCount(studentId) {
    const data = loadParticipation();
    return data[studentId] || 0;
}

// ===== battleState =====
let battleState = {
    mode: GAME_MODE.SNAKE,
    isGameOver: false,
    winnerGroup: null,
    round: 0,
    hp: {},
    maxHp: {},
    stamina: {},
    isAlive: {},
    isStunned: {},
    stunTimer: {},
    speedReduction: {},
    originalSpeed: {},
    attackTimer: {},
    targetId: {},
    kills: {},
    records: {},
    selectedPetIds: new Set(),
    victoryBanner: null,
    battleTime: 0,
    lastTimestamp: 0,
    lastRegenTime: 0,
    participantIds: [],
    controlStack: {},
};

// ================================================================
//  数据加载 & 工具
// ================================================================
function loadData() {
    const data = DataManager.loadClassData(CURRENT_CLASS);
    if (!data || !data.students || data.students.length === 0) return false;
    students = data.students;
    students.forEach(s => {
        if (!s.cats || s.cats.length !== CATEGORIES.length) s.cats = CATEGORIES.map(() => 0);
        if (!s.animal) s.animal = '🐱';
        if (!s.petState) s.petState = 'normal';
        if (s.onLeave === undefined) s.onLeave = false;
        if (!s.duty) s.duty = '';
        SUBJECTS.forEach(sub => { if (!(('subject_' + sub) in s)) s['subject_' + sub] = 0; });
        if (s.item === undefined) s.item = null;
    });
    const filters = DataManager.loadActiveFilters(CURRENT_CLASS);
    activeCategories = new Set(filters.categories || []);
    activeSubjects = new Set(filters.subjects || []);
    return true;
}

function calcSubjectTotal(s) {
    let sum = 0;
    SUBJECTS.forEach(sub => { sum += s['subject_' + sub] || 0; });
    return sum;
}
function calcQuantTotal(s) {
    return s.cats.reduce((a, b) => a + b, 0);
}

function getSpeed(quantTotal) {
    if (quantTotal <= 0) return 0;
    const speed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) / (1 + Math.exp(-SPEED_SLOPE * (quantTotal - SPEED_MID)));
    return speed * globalSpeedFactor;
}

function getEmojiSize(subjectTotal) {
    if (subjectTotal <= 0) return 0;
    const size = SIZE_MIN + (SIZE_MAX - SIZE_MIN) / (1 + Math.exp(-SIZE_SLOPE * (subjectTotal - SIZE_MID)));
    return size * globalSizeFactor;
}

function computeChampions() {
    const champ = new Set();
    activeCategories.forEach(idx => {
        let maxV = -Infinity;
        students.forEach(s => { if (!s.onLeave && s.cats[idx] > maxV) maxV = s.cats[idx]; });
        if (maxV > 0) students.forEach(s => { if (!s.onLeave && s.cats[idx] === maxV) champ.add(s.id); });
    });
    activeSubjects.forEach(sub => {
        const key = 'subject_' + sub;
        let maxV = -Infinity;
        students.forEach(s => { if (!s.onLeave) { const v = s[key] || 0; if (v > maxV) maxV = v; } });
        if (maxV > 0) students.forEach(s => { if (!s.onLeave && (s[key] || 0) === maxV) champ.add(s.id); });
    });
    return champ;
}

// ===== 粒子特效 =====
function trimParticles() {
    const container = document.getElementById('fxContainer');
    if (!container) return;
    const children = container.children;
    if (children.length > MAX_PARTICLES) {
        const removeCount = Math.min(children.length - MAX_PARTICLES, 30);
        for (let i = 0; i < removeCount; i++) {
            if (children[i]) children[i].remove();
        }
    }
}
function spawnParticles(x, y, count, colorOverride) {
    const container = document.getElementById('fxContainer');
    const colors = colorOverride ? [colorOverride] : ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bff', '#ff9f43'];
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle fire';
        const size = 4 + Math.random() * 6;
        const angle = Math.random() * 2 * Math.PI;
        const dist = 30 + Math.random() * 60;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist - 20;
        const color = colors[Math.floor(Math.random() * colors.length)];
        p.style.cssText = `
            left: ${x - size/2}px; top: ${y - size/2}px;
            width: ${size}px; height: ${size}px;
            background: ${color}; box-shadow: 0 0 12px ${color};
            --tx: ${tx}px; --ty: ${ty}px;
            animation-delay: ${Math.random() * 0.1}s;
        `;
        container.appendChild(p);
        setTimeout(() => p.remove(), 700);
    }
    trimParticles();
}
function spawnDisperseParticles(x, y) {
    const container = document.getElementById('fxContainer');
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bff', '#ff9f43'];
    for (let i = 0; i < DISPERSE_PARTICLE_COUNT; i++) {
        const p = document.createElement('div');
        p.className = 'particle fire';
        const size = 5 + Math.random() * 8;
        const angle = Math.random() * 2 * Math.PI;
        const dist = 50 + Math.random() * 100;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist - 30;
        const color = colors[Math.floor(Math.random() * colors.length)];
        p.style.cssText = `
            left: ${x - size/2}px; top: ${y - size/2}px;
            width: ${size}px; height: ${size}px;
            background: ${color}; box-shadow: 0 0 20px ${color};
            --tx: ${tx}px; --ty: ${ty}px;
            animation-delay: ${Math.random() * 0.15}s;
        `;
        container.appendChild(p);
        setTimeout(() => p.remove(), 900);
    }
    trimParticles();
}

// ===== 创建宠物卡片 =====
function createPetCard(student, size, cardW, cardH, champSet, isBattle) {
    const card = document.createElement('div');
    card.className = 'pet-card';
    if (champSet.has(student.id)) card.classList.add('champion');
    card.dataset.studentId = student.id;
    card.style.width = cardW + 'px';
    card.style.height = cardH + 'px';

    const emoji = document.createElement('div');
    emoji.className = 'pet-emoji';
    emoji.style.fontSize = size + 'px';
    emoji.textContent = student.animal || '🐱';
    card.appendChild(emoji);

    const nameTag = document.createElement('div');
    nameTag.className = 'pet-name';
    nameTag.textContent = student.name;
    nameTag.style.fontSize = '9px';
    nameTag.style.top = '-14px';
    nameTag.style.padding = '1px 8px';
    nameTag.style.borderRadius = '12px';
    nameTag.style.background = 'rgba(0,0,0,0.6)';
    card.appendChild(nameTag);

    if (isBattle) {
        const hpWrap = document.createElement('div');
        hpWrap.className = 'hp-bar-wrap';
        const hpBar = document.createElement('div');
        hpBar.className = 'hp-bar';
        hpBar.id = 'hp_' + student.id;
        hpWrap.appendChild(hpBar);
        card.appendChild(hpWrap);
    }

    if (isBattle) {
        const rangeRing = document.createElement('div');
        rangeRing.className = 'range-ring';
        rangeRing.id = 'rangeRing_' + student.id;
        rangeRing.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            pointer-events: none;
            transform: translate(-50%, -50%);
            z-index: 1;
            transition: none;
        `;
        card.appendChild(rangeRing);
    }

    if (student.item && !isBattle) {
        const itemBadge = document.createElement('div');
        itemBadge.className = 'item-badge';
        const itemSize = Math.max(16, size * 0.4);
        itemBadge.style.fontSize = itemSize + 'px';
        itemBadge.textContent = student.item;
        itemBadge.style.position = 'absolute';
        itemBadge.style.top = '2px';
        itemBadge.style.right = '2px';
        itemBadge.style.pointerEvents = 'none';
        itemBadge.style.zIndex = '15';
        itemBadge.style.textShadow = '0 0 4px rgba(0,0,0,0.5)';
        card.appendChild(itemBadge);
    }

    const order = student.seatOrder || 0;
    if (order >= 1 && order <= 9) {
        const badge = document.createElement('div');
        badge.className = `badge top-left color-${order}`;
        badge.textContent = order;
        badge.style.fontSize = '8px';
        badge.style.width = '16px';
        badge.style.height = '16px';
        badge.style.top = '-5px';
        badge.style.left = '-5px';
        card.appendChild(badge);
    }
    if (student.duty) {
        const badge = document.createElement('div');
        badge.className = 'badge top-right';
        badge.textContent = student.duty;
        badge.style.fontSize = '8px';
        badge.style.padding = '0 6px';
        badge.style.height = '16px';
        badge.style.top = '-5px';
        badge.style.right = '-5px';
        card.appendChild(badge);
    }

    let quantChampIcon = '';
    for (let idx of activeCategories) {
        const maxV = Math.max(...students.map(st => st.cats[idx] || 0));
        if (maxV > 0 && (student.cats[idx] || 0) === maxV) {
            quantChampIcon = CAT_ICONS[idx];
            break;
        }
    }
    if (quantChampIcon) {
        const badge = document.createElement('div');
        badge.className = 'badge bottom-left';
        badge.textContent = quantChampIcon;
        badge.style.fontSize = '9px';
        badge.style.width = '16px';
        badge.style.height = '16px';
        badge.style.bottom = '-5px';
        badge.style.left = '-5px';
        badge.style.background = 'rgba(255,215,0,0.3)';
        badge.style.borderColor = '#ffd700';
        card.appendChild(badge);
    }

    let subChampIcon = '';
    for (let sub of activeSubjects) {
        const key = 'subject_' + sub;
        const maxV = Math.max(...students.map(st => st[key] || 0));
        if (maxV > 0 && (student[key] || 0) === maxV) {
            subChampIcon = SUB_ABBR[sub];
            break;
        }
    }
    if (subChampIcon) {
        const badge = document.createElement('div');
        badge.className = 'badge bottom-right';
        badge.textContent = subChampIcon;
        badge.style.fontSize = '9px';
        badge.style.width = '16px';
        badge.style.height = '16px';
        badge.style.bottom = '-5px';
        badge.style.right = '-5px';
        badge.style.background = 'rgba(255,215,0,0.3)';
        badge.style.borderColor = '#ffd700';
        card.appendChild(badge);
    }

    card.addEventListener('click', function(e) {
        e.stopPropagation();
        const sid = parseInt(this.dataset.studentId);
        const s = students.find(st => st.id === sid);
        if (!s) return;
        if (battleState.mode === GAME_MODE.BATTLE) {
            if (!battleState.isAlive[sid]) return;
            if (e.shiftKey) {
                if (battleState.selectedPetIds.has(sid)) {
                    battleState.selectedPetIds.delete(sid);
                    this.classList.remove('selected');
                } else {
                    battleState.selectedPetIds.add(sid);
                    this.classList.add('selected');
                }
            } else {
                document.querySelectorAll('.pet-card.selected').forEach(el => el.classList.remove('selected'));
                battleState.selectedPetIds.clear();
                battleState.selectedPetIds.add(sid);
                this.classList.add('selected');
            }
            updateAttributePanel();
        }
    });

    card.addEventListener('dblclick', function() {
        showFloatToast('💡 请在教室页面编辑学生信息');
    });

    return card;
}

// ================================================================
//  队列管理（贪吃蛇）- 保持不变
// ================================================================
function createQueue(groupName, memberIds) {
    const validIds = memberIds.filter(id => {
        const s = students.find(st => st.id === id);
        return s && (s.groupName || '未分组') === groupName && groupName !== '未分组';
    });
    if (validIds.length < 2) return null;
    const queueId = nextQueueId++;
    const sorted = validIds.slice().sort((a, b) => {
        const sa = students.find(s => s.id === a);
        const sb = students.find(s => s.id === b);
        return (sa?.seatOrder || 0) - (sb?.seatOrder || 0);
    });
    const headId = sorted[0];
    queues[queueId] = { id: queueId, groupName: groupName, memberIds: sorted, headId: headId, history: [] };
    const head = petPositions[headId];
    if (head) queues[queueId].history.push({ x: head.x, y: head.y });

    sorted.forEach((sid, idx) => {
        const p = petPositions[sid];
        if (p) {
            p.queueId = queueId;
            p.isQueue = true;
            p.isHead = (idx === 0);
            p.queueIndex = idx;
            p.headId = (idx === 0) ? null : headId;
            p.el.style.border = (idx === 0) ? '2px solid #ffd700' : '';
            p.el.style.boxShadow = (idx === 0) ? '0 0 20px rgba(255,215,0,0.3)' : '';
            const nameTag = p.el.querySelector('.pet-name');
            if (nameTag) {
                nameTag.style.top = 'auto';
                nameTag.style.bottom = '-14px';
                nameTag.style.background = 'rgba(0,0,0,0.5)';
                nameTag.style.padding = '0 6px';
                nameTag.style.borderRadius = '10px';
            }
            if (idx === 0) {
                let totalSpeed = 0;
                sorted.forEach(mid => {
                    const ss = students.find(st => st.id === mid);
                    if (ss) totalSpeed += getSpeed(calcQuantTotal(ss));
                });
                const newSpeed = Math.min(totalSpeed, 3.0);
                const angle = Math.atan2(p.vy, p.vx) || Math.random() * 2 * Math.PI;
                p.vx = Math.cos(angle) * newSpeed;
                p.vy = Math.sin(angle) * newSpeed;
                p.speed = newSpeed;
            } else {
                p.vx = 0;
                p.vy = 0;
            }
            p.isDispersing = false;
        }
    });
    updateGroupLabel(groupName);
    return queueId;
}

function deleteQueue(queueId) {
    const q = queues[queueId];
    if (!q) return;
    const groupName = q.groupName;
    q.memberIds.forEach(sid => {
        const p = petPositions[sid];
        if (p) {
            p.queueId = null;
            p.isQueue = false;
            p.isHead = true;
            p.queueIndex = 0;
            p.headId = null;
            p.el.style.border = '';
            p.el.style.boxShadow = '';
            const nameTag = p.el.querySelector('.pet-name');
            if (nameTag) { nameTag.style.top = '-14px';
                nameTag.style.bottom = 'auto';
                nameTag.style.background = 'rgba(0,0,0,0.6)';
                nameTag.style.padding = '1px 8px';
                nameTag.style.borderRadius = '12px'; }
            const student = students.find(s => s.id === sid);
            if (student) {
                const newSpeed = getSpeed(calcQuantTotal(student));
                const angle = Math.atan2(p.vy, p.vx);
                p.vx = Math.cos(angle) * newSpeed;
                p.vy = Math.sin(angle) * newSpeed;
                p.speed = newSpeed;
            }
            p.isDispersing = false;
            const badge = p.el.querySelector('.item-badge');
            if (badge) badge.remove();
            if (student) student.item = null;
        }
    });
    delete queues[queueId];
    if (groupLabels[groupName]) { groupLabels[groupName].remove();
        delete groupLabels[groupName]; }
}

function updateGroupLabel(groupName) {
    if (groupLabels[groupName]) { groupLabels[groupName].remove();
        delete groupLabels[groupName]; }
    const q = Object.values(queues).find(q => q.groupName === groupName);
    if (!q) return;
    const head = petPositions[q.headId];
    if (!head) return;
    const label = document.createElement('div');
    label.className = 'group-queue-label';
    label.textContent = `🏷️ ${groupName}`;
    label.style.cssText = `
        position: absolute; font-size: 14px; font-weight: 700; color: #ffd700;
        background: rgba(0,0,0,0.6); padding: 2px 14px; border-radius: 20px;
        border: 1px solid rgba(255,215,0,0.3); pointer-events: none; z-index: 20;
        text-shadow: 0 1px 4px rgba(0,0,0,0.5); white-space: nowrap;
    `;
    label.style.left = head.x + 'px';
    label.style.top = (head.y - 28) + 'px';
    document.getElementById('petPark').appendChild(label);
    groupLabels[groupName] = label;
}

function getQueueByMember(studentId) {
    for (const qid in queues) {
        if (queues[qid].memberIds.includes(studentId)) return queues[qid];
    }
    return null;
}

// ===== 物品系统（贪吃蛇）- 保持不变 =====
function getFlagPosition() {
    const park = document.getElementById('petPark');
    if (!park) return { x: 30, y: 30 };
    return { x: park.clientWidth * 0.05, y: park.clientHeight * 0.05 };
}
function spawnItem() {
    if (flyingItem) return;
    const park = document.getElementById('petPark');
    if (!park) return;
    const w = park.clientWidth || 600,
        h = park.clientHeight || 400;
    const margin = 30;
    const targetX = margin + Math.random() * (w - 2 * margin);
    const targetY = margin + Math.random() * (h - 2 * margin);
    const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    const startPos = getFlagPosition();
    const id = itemIdCounter++;
    flyingItem = {
        id: id,
        startX: startPos.x,
        startY: startPos.y,
        endX: targetX,
        endY: targetY,
        progress: 0,
        emoji: type,
        active: true
    };
    const trail = document.createElement('div');
    trail.className = 'item-trail';
    trail.style.cssText = `position:absolute; left:${startPos.x}px; top:${startPos.y}px; width:2px; height:2px; background:rgba(255,215,0,0.5); pointer-events:none; z-index:14;`;
    park.appendChild(trail);
    flyingItem.trailEl = trail;
    const el = document.createElement('div');
    el.className = 'item-object flying';
    el.dataset.itemId = id;
    el.style.cssText = `position:absolute; left:${startPos.x}px; top:${startPos.y}px; font-size:${ITEM_EMOJI_SIZE_BASE}px; pointer-events:none; z-index:15; user-select:none; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));`;
    el.textContent = type;
    park.appendChild(el);
    flyingItem.el = el;
    spawnParticles(startPos.x, startPos.y, 10);
}
function updateFlyingItem() {
    if (!flyingItem) return;
    const park = document.getElementById('petPark');
    if (!park) { flyingItem = null; return; }
    flyingItem.progress += 0.02;
    if (flyingItem.progress >= 1) {
        const item = { id: flyingItem.id, x: flyingItem.endX, y: flyingItem.endY, type: flyingItem.emoji, emoji: flyingItem.emoji, active: true };
        items.push(item);
        if (flyingItem.el) flyingItem.el.remove();
        if (flyingItem.trailEl) flyingItem.trailEl.remove();
        flyingItem = null;
        renderItems();
        spawnParticles(item.x, item.y, 12);
        return;
    }
    const t = flyingItem.progress;
    const x = flyingItem.startX + (flyingItem.endX - flyingItem.startX) * t;
    const y = flyingItem.startY + (flyingItem.endY - flyingItem.startY) * t - 100 * t * (1 - t);
    if (flyingItem.el) {
        flyingItem.el.style.left = x + 'px';
        flyingItem.el.style.top = y + 'px';
        const scale = 1 + 0.5 * Math.sin(t * Math.PI);
        flyingItem.el.style.fontSize = (ITEM_EMOJI_SIZE_BASE * scale) + 'px';
    }
    if (flyingItem.trailEl) {
        const trail = document.createElement('div');
        trail.style.cssText = `position:absolute; left:${x}px; top:${y}px; width:4px; height:4px; background:rgba(255,215,0,0.8); border-radius:50%; pointer-events:none; z-index:14; box-shadow:0 0 6px #ffd700;`;
        park.appendChild(trail);
        setTimeout(() => trail.remove(), 400);
    }
}
function renderItems() {
    const park = document.getElementById('petPark');
    park.querySelectorAll('.item-object:not(.flying)').forEach(el => el.remove());
    items.forEach(item => {
        if (!item.active) return;
        const el = document.createElement('div');
        el.className = 'item-object';
        el.dataset.itemId = item.id;
        const size = ITEM_EMOJI_SIZE_BASE * (0.8 + Math.random() * 0.4);
        el.style.cssText = `position:absolute; left:${item.x - size/2}px; top:${item.y - size/2}px; font-size:${size}px; pointer-events:none; z-index:15; user-select:none; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3)); animation:itemFloat 2s ease-in-out infinite;`;
        el.textContent = item.emoji;
        park.appendChild(el);
    });
}
function pickupItem(item, headPos, queueId) {
    const q = queues[queueId];
    if (!q) return;
    const memberIds = q.memberIds;
    let targetId = null;
    for (let i = memberIds.length - 1; i >= 0; i--) {
        const sid = memberIds[i];
        const student = students.find(s => s.id === sid);
        if (student && !student.item) { targetId = sid; break; }
    }
    if (targetId === null) targetId = memberIds[memberIds.length - 1];
    const student = students.find(s => s.id === targetId);
    if (student) {
        student.item = item.emoji;
        const p = petPositions[targetId];
        if (p && p.el) {
            const oldBadge = p.el.querySelector('.item-badge');
            if (oldBadge) oldBadge.remove();
            const itemBadge = document.createElement('div');
            itemBadge.className = 'item-badge';
            const size = p.size || 30;
            const itemSize = Math.max(16, size * 0.4);
            itemBadge.style.fontSize = itemSize + 'px';
            itemBadge.textContent = student.item;
            itemBadge.style.position = 'absolute';
            itemBadge.style.top = '2px';
            itemBadge.style.right = '2px';
            itemBadge.style.pointerEvents = 'none';
            itemBadge.style.zIndex = '15';
            itemBadge.style.textShadow = '0 0 4px rgba(0,0,0,0.5)';
            p.el.appendChild(itemBadge);
        }
        item.active = false;
        items = items.filter(it => it.active);
        renderItems();
        spawnParticles(item.x, item.y, 10);
    }
}

// ===== 贪吃蛇胜利 =====
function checkSnakeVictory() {
    if (snakeGameOver) return;
    const groups = {};
    students.forEach(s => {
        if (s.onLeave) return;
        const gName = s.groupName || '未分组';
        if (gName === '未分组') return;
        if (!groups[gName]) groups[gName] = [];
        groups[gName].push(s);
    });
    for (const [gName, members] of Object.entries(groups)) {
        let commonQueueId = null,
            allInSameQueue = true,
            allHaveItem = true;
        for (const s of members) {
            const pos = petPositions[s.id];
            if (!pos || !pos.isQueue) { allInSameQueue = false; break; }
            const qid = pos.queueId;
            if (commonQueueId === null) commonQueueId = qid;
            else if (qid !== commonQueueId) { allInSameQueue = false; break; }
            if (!s.item) { allHaveItem = false; break; }
        }
        if (allInSameQueue && allHaveItem && members.length > 0) {
            snakeGameOver = true;
            snakeWinnerGroup = gName;
            showSnakeVictory(gName);
            return;
        }
    }
}

function showSnakeVictory(groupName) {
    const park = document.getElementById('petPark');
    if (!park) return;
    if (snakeVictoryBanner) { snakeVictoryBanner.remove();
        snakeVictoryBanner = null; }
    const q = Object.values(queues).find(q => q.groupName === groupName);
    const members = q ? q.memberIds.map(id => students.find(s => s.id === id)).filter(s => s) : [];
    let membersHtml = '';
    if (members.length) {
        membersHtml = '<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:12px;">';
        members.forEach(s => {
            membersHtml += `
                <span style="display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.08); border-radius:20px; padding:4px 12px 4px 8px;">
                    <span style="font-size:20px;">${s.animal || '🐱'}</span>
                    <span style="font-weight:600;">${s.name}</span>
                    ${s.item ? `<span style="font-size:14px;">${s.item}</span>` : ''}
                </span>
            `;
        });
        membersHtml += '</div>';
    }
    const banner = document.createElement('div');
    banner.className = 'snake-victory-banner';
    banner.innerHTML = `
        <div style="font-size:48px;text-align:center;padding:20px;">🎉🏆 ${groupName} 获胜！ 🏆🎉</div>
        <div style="font-size:18px;text-align:center;color:#ccc;">所有成员已组成队列并集齐物品！</div>
        ${membersHtml}
        <div style="text-align:center;margin-top:16px;">
            <button onclick="location.reload()" style="background:#ffd700;color:#000;border:none;padding:8px 24px;border-radius:30px;font-weight:700;font-size:16px;cursor:pointer;">🔄 再来一局</button>
        </div>
    `;
    banner.style.cssText = `
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
        padding: 30px 50px; border-radius: 24px; border: 3px solid #ffd700;
        box-shadow: 0 0 60px rgba(255,215,0,0.3); z-index: 100;
        pointer-events: auto; text-align: center; min-width: 300px; max-width: 90%; color: #fff;
        max-height: 80vh; overflow-y: auto;
    `;
    park.appendChild(banner);
    snakeVictoryBanner = banner;
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const x = Math.random() * park.clientWidth * 0.8 + park.clientWidth * 0.1;
            const y = Math.random() * park.clientHeight * 0.6 + park.clientHeight * 0.1;
            spawnDisperseParticles(x, y);
            spawnParticles(x, y, 20, '#ffd700');
        }, i * 150);
    }
    showFloatToast(`🎉 ${groupName} 获胜！`);
}

// ================================================================
//  斗蛐蛐核心属性函数
// ================================================================

function isEligibleForBattle(student) {
    if (student.cats[0] <= 0) return false;
    if (!battleState.isAlive[student.id]) return false;
    const maxGames = getBattleStaminaMax(student);
    const played = getParticipationCount(student.id);
    return played < maxGames;
}

function getBattleStaminaMax(student) {
    return Math.max(0, student.cats[1] || 0);
}

function getCritRate(student) {
    return Math.max(0, student.cats[2] || 0);
}

function getBattleAttack(student) {
    return Math.max(0, student.cats[3] || 0);
}

function getControlPower(student) {
    return Math.max(0, student.cats[4] || 0);
}

function getBattleDefense(student) {
    return Math.max(0, student.cats[5] || 0);
}

function getAttackSpeed(student) {
    const speed = 1 + (student.cats[6] || 0) / 10;
    return Math.min(MAX_ATTACK_SPEED, speed);
}

function getBattleRegen(student) {
    return Math.max(0, student.cats[7] || 0);
}

function getAttackRange(student) {
    return BASE_ATTACK_RANGE + (student.cats[8] || 0);
}

function getBattleSpeed(student) {
    const walkScore = student.cats[9] || 0;
    const base = Math.max(0, walkScore * 0.25);
    if (battleState.isStunned[student.id]) return 0;
    const reduction = battleState.speedReduction[student.id] || 0;
    let speed = Math.max(0, base - reduction);
    if (speed < 0.02) speed = 0;
    return speed;
}

function getAttackCooldown(student) {
    const speed = getAttackSpeed(student);
    const cooldown = Math.max(1, Math.round(BASE_ATTACK_COOLDOWN / speed));
    return cooldown;
}

function getGroupColor(groupName) {
    if (window.groupColorMap && window.groupColorMap[groupName]) {
        return window.groupColorMap[groupName];
    }
    return '#ffffff';
}

// ================================================================
//  重置战斗
// ================================================================
function resetBattleRound() {
    const allEligible = students.filter(s => !s.onLeave && calcSubjectTotal(s) > 0);
    battleState.isGameOver = false;
    battleState.winnerGroup = null;
    battleState.round++;
    battleState.kills = {};
    battleState.records = {};
    battleState.participantIds = [];
    battleState.controlStack = {};

    allEligible.forEach(s => {
        battleState.records[s.id] = { totalGames: 0 };
        battleState.kills[s.id] = [];
    });

    allEligible.forEach(s => {
        const hp = calcSubjectTotal(s);
        battleState.hp[s.id] = hp;
        battleState.maxHp[s.id] = hp;
        battleState.stamina[s.id] = getBattleStaminaMax(s);
        battleState.isAlive[s.id] = true;
        battleState.isStunned[s.id] = false;
        battleState.stunTimer[s.id] = 0;
        battleState.speedReduction[s.id] = 0;
        battleState.originalSpeed[s.id] = (s.cats[9] || 0) * 0.25;
        battleState.attackTimer[s.id] = 0;
        battleState.targetId[s.id] = null;
    });

    const eligible = allEligible.filter(s => isEligibleForBattle(s));
    battleState.participantIds = eligible.map(s => s.id);

    if (eligible.length === 0) {
        showFloatToast('⚠️ 本周所有学生体力已耗尽，无人可参与！');
        battleState.isAlive = {};
        const park = document.getElementById('petPark');
        if (park) {
            park.querySelectorAll('.pet-card').forEach(el => el.remove());
        }
        petPositions = {};
        updateBattleUI();
        return;
    }

    battleState.battleTime = 0;
    battleState.lastTimestamp = performance.now();
    battleState.lastRegenTime = 0;

    const park = document.getElementById('petPark');
    const w = park.clientWidth || 600,
        h = park.clientHeight || 400;
    park.querySelectorAll('.pet-card').forEach(el => el.remove());
    petPositions = {};

    eligible.forEach(s => {
        const subjectTotal = calcSubjectTotal(s);
        const quantTotal = calcQuantTotal(s);
        const size = getEmojiSize(subjectTotal);
        if (size === 0) {
            battleState.isAlive[s.id] = false;
            return;
        }
        const cardW = Math.max(44, size * 0.9);
        const cardH = Math.max(56, size * 1.2);
        const champSet = computeChampions();
        const card = createPetCard(s, size, cardW, cardH, champSet, true);
        park.appendChild(card);
        const x = Math.random() * (w - cardW);
        const y = Math.random() * (h - cardH);
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        const speed = getBattleSpeed(s);
        const angle = Math.random() * 2 * Math.PI;
        petPositions[s.id] = {
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            el: card,
            w: cardW,
            h: cardH,
            groupName: s.groupName || '未分组',
            isHead: true,
            isQueue: false,
            queueIndex: 0,
            headId: null,
            queueId: null,
            speed: speed,
            size: size,
            isDispersing: false,
        };
    });

    battleState.selectedPetIds.clear();
    document.querySelectorAll('.pet-card.selected').forEach(el => el.classList.remove('selected'));
    if (battleState.victoryBanner) { battleState.victoryBanner.remove();
        battleState.victoryBanner = null; }
    document.querySelectorAll('.range-ring').forEach(el => el.remove());
    updateBattleUI();
}

// ================================================================
//  战斗核心函数
// ================================================================

function hideDeadPet(studentId) {
    const p = petPositions[studentId];
    if (p && p.el) {
        p.el.style.display = 'none';
        const ring = document.getElementById('rangeRing_' + studentId);
        if (ring) ring.style.display = 'none';
    }
    if (battleState.selectedPetIds.has(studentId)) {
        battleState.selectedPetIds.delete(studentId);
        document.querySelectorAll('.pet-card.selected').forEach(el => el.classList.remove('selected'));
        updateAttributePanel();
    }
}

function recordKill(attackerId, victimId) {
    if (!battleState.kills[attackerId]) battleState.kills[attackerId] = [];
    battleState.kills[attackerId].push(victimId);
}

function showBattleDamage(x, y, text, color) {
    const park = document.getElementById('petPark');
    const el = document.createElement('div');
    el.className = 'battle-damage';
    el.textContent = text;
    const size = 14 + Math.random() * 10;
    el.style.cssText = `left: ${x}px; top: ${y}px; font-size: ${size}px; color: ${color || '#ff6b6b'};`;
    park.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

// ===== 核心：普通攻击 =====
function performBattleAttack(attacker, target) {
    const atk = getBattleAttack(attacker);
    if (atk <= 0) return 0;

    const def = getBattleDefense(target);
    let damage = Math.max(0, atk - def);
    if (damage === 0) return 0;

    const critRate = getCritRate(attacker);
    let isCrit = false;
    let critMultiplier = 1;

    if (critRate >= 100) {
        isCrit = true;
        const extra = (critRate - 100) / 100;
        critMultiplier = 2 + extra;
    } else {
        const rand = Math.random() * 100;
        if (rand < critRate) {
            isCrit = true;
            critMultiplier = 2;
        }
    }

    const finalDamage = Math.round(damage * critMultiplier);

    battleState.hp[target.id] -= finalDamage;
    const tpos = petPositions[target.id];
    if (tpos) {
        const dmgText = isCrit ? `💥${finalDamage}` : `-${finalDamage}`;
        const color = isCrit ? '#ff6bff' : '#ff6b6b';
        showBattleDamage(tpos.x + tpos.w / 2, tpos.y - 10, dmgText, color);
    }

    if (battleState.hp[target.id] <= 0) {
        battleState.hp[target.id] = 0;
        battleState.isAlive[target.id] = false;
        recordKill(attacker.id, target.id);
        hideDeadPet(target.id);
        if (tpos) showBattleDamage(tpos.x + tpos.w / 2, tpos.y - 30, '💀 淘汰', '#ff0000');
        spawnParticles(tpos.x + tpos.w / 2, tpos.y + tpos.h / 2, 20, '#ff0000');
        battleState.isStunned[target.id] = false;
        battleState.stunTimer[target.id] = 0;
        battleState.speedReduction[target.id] = 0;
        return finalDamage;
    }

    // 控制力施加（仅当目标未被定身时）
    if (!battleState.isStunned[target.id]) {
        const controlPower = getControlPower(attacker);
        if (controlPower > 0 && battleState.isAlive[target.id]) {
            const baseSpeed = battleState.originalSpeed[target.id] || (target.cats[9] || 0) * 0.25;
            let currentSpeed = baseSpeed - (battleState.speedReduction[target.id] || 0);
            currentSpeed = Math.max(0, currentSpeed);

            let newSpeed = currentSpeed - controlPower;

            if (newSpeed < 0) {
                const remainingControl = Math.abs(newSpeed);
                const stunTime = remainingControl / CONTROL_TO_STUN_RATIO;
                if (stunTime > 0 && !battleState.isStunned[target.id]) {
                    battleState.isStunned[target.id] = true;
                    battleState.stunTimer[target.id] = Math.ceil(stunTime * 60);
                    battleState.speedReduction[target.id] = baseSpeed;
                    if (tpos) showBattleDamage(tpos.x + tpos.w / 2, tpos.y - 30, `💫 定身 ${stunTime.toFixed(1)}s`, '#00bfff');
                }
            } else {
                const totalReduction = baseSpeed - newSpeed;
                if (totalReduction > (battleState.speedReduction[target.id] || 0)) {
                    battleState.speedReduction[target.id] = totalReduction;
                    if (tpos && totalReduction > 1) {
                        showBattleDamage(tpos.x + tpos.w / 2, tpos.y - 20, `🐢 减速 ${totalReduction.toFixed(1)}`, '#87ceeb');
                    }
                }
            }
        }
    }

    return finalDamage;
}

// ===== 索敌逻辑（新增破防过滤） =====
function findBestTarget(student) {
    const myGroup = student.groupName || '未分组';
    const myOrder = student.seatOrder || 0;
    const pos = petPositions[student.id];
    if (!pos) return null;

    const atk = getBattleAttack(student);

    const enemies = [];
    for (let other of students) {
        if (other.id === student.id) continue;
        if (other.onLeave) continue;
        if (!battleState.isAlive[other.id]) continue;
        if (other.groupName === myGroup) continue;
        if (!isEligibleForBattle(other)) continue;
        const opos = petPositions[other.id];
        if (!opos) continue;
        // 破防过滤
        const def = getBattleDefense(other);
        if (atk <= def) continue;
        const dx = pos.x - opos.x;
        const dy = pos.y - opos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        enemies.push({ other, dist, order: other.seatOrder || 0 });
    }

    if (enemies.length === 0) return null;

    // 1. 优先找同号
    if (myOrder !== 0) {
        const sameOrder = enemies.filter(e => e.order === myOrder);
        if (sameOrder.length > 0) {
            sameOrder.sort((a, b) => a.dist - b.dist);
            return sameOrder[0].other;
        }
    }

    // 2. 找上下号
    if (myOrder !== 0) {
        const neighbors = [];
        const upOrder = myOrder - 1;
        if (upOrder >= 1) {
            const up = enemies.filter(e => e.order === upOrder);
            if (up.length > 0) {
                up.sort((a, b) => a.dist - b.dist);
                neighbors.push(...up);
            }
        }
        const downOrder = myOrder + 1;
        if (downOrder <= 6) {
            const down = enemies.filter(e => e.order === downOrder);
            if (down.length > 0) {
                down.sort((a, b) => a.dist - b.dist);
                neighbors.push(...down);
            }
        }
        if (neighbors.length > 0) {
            neighbors.sort((a, b) => a.dist - b.dist);
            return neighbors[0].other;
        }
    }

    // 3. 找最近的敌人
    enemies.sort((a, b) => a.dist - b.dist);
    return enemies[0].other;
}

function checkWinner() {
    const groups = {};
    for (let s of students) {
        if (s.onLeave) continue;
        if (!battleState.isAlive[s.id]) continue;
        if (!isEligibleForBattle(s)) continue;
        const gName = s.groupName || '未分组';
        if (!groups[gName]) groups[gName] = 0;
        groups[gName]++;
    }
    const aliveGroups = Object.keys(groups);
    if (aliveGroups.length === 1 && groups[aliveGroups[0]] > 0) {
        return aliveGroups[0];
    }
    return null;
}

// ===== 斗蛐蛐胜利横幅 =====
function showBattleVictory(groupName) {
    const park = document.getElementById('petPark');
    if (!park) return;
    if (battleState.victoryBanner) { battleState.victoryBanner.remove();
        battleState.victoryBanner = null; }

    if (battleState.participantIds && battleState.participantIds.length > 0) {
        recordParticipation(battleState.participantIds);
        battleState.participantIds = [];
    }

    const members = students.filter(s =>
        s.groupName === groupName &&
        battleState.isAlive[s.id] &&
        isEligibleForBattle(s)
    );

    let membersHtml = '';
    if (members.length) {
        membersHtml = '<div style="display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:12px;">';
        members.forEach(s => {
            const hpPct = battleState.maxHp[s.id] ? Math.round((battleState.hp[s.id] / battleState.maxHp[s.id]) * 100) : 0;
            const hpColor = hpPct > 50 ? '#2ecc71' : (hpPct > 25 ? '#f1c40f' : '#e74c3c');
            membersHtml += `
                <div style="background:rgba(255,255,255,0.08); border-radius:12px; padding:8px 12px; text-align:center; min-width:60px;">
                    <div style="font-size:28px;">${s.animal || '🐱'}</div>
                    <div style="font-size:13px; font-weight:600; margin:2px 0;">${s.name}</div>
                    <div style="width:60px; height:5px; background:#333; border-radius:3px; margin:4px auto;">
                        <div style="width:${hpPct}%; height:100%; background:${hpColor}; border-radius:3px;"></div>
                    </div>
                </div>
            `;
        });
        membersHtml += '</div>';
    }
    const banner = document.createElement('div');
    banner.className = 'battle-victory-banner';
    banner.innerHTML = `
        <div class="winner">🏆 ${groupName} 获胜！</div>
        <div class="sub">存活成员：</div>
        ${membersHtml}
        <div style="text-align:center;margin-top:16px;">
            <button id="nextBattleRoundBtn" style="background:#ffd700;color:#000;border:none;padding:8px 24px;border-radius:30px;font-weight:700;font-size:16px;cursor:pointer;">⚔️ 下一局</button>
        </div>
    `;
    banner.style.cssText = `
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
        padding: 30px 50px; border-radius: 24px; border: 3px solid #ffd700;
        box-shadow: 0 0 60px rgba(255,215,0,0.3); z-index: 100;
        pointer-events: auto; text-align: center; min-width: 300px; max-width: 90%; color: #fff;
        max-height: 80vh; overflow-y: auto;
    `;
    park.appendChild(banner);
    battleState.victoryBanner = banner;
    banner.querySelector('#nextBattleRoundBtn').addEventListener('click', function() {
        resetBattleRound();
        const eligible = students.filter(s => !s.onLeave && calcSubjectTotal(s) > 0);
        eligible.forEach(s => {
            const p = petPositions[s.id];
            if (p && battleState.isAlive[s.id]) {
                p.el.style.display = '';
                const park2 = document.getElementById('petPark');
                p.x = Math.random() * (park2.clientWidth - p.w);
                p.y = Math.random() * (park2.clientHeight - p.h);
                p.el.style.left = p.x + 'px';
                p.el.style.top = p.y + 'px';
                const ring = document.getElementById('rangeRing_' + s.id);
                if (ring) ring.style.display = '';
            }
        });
        banner.remove();
        battleState.victoryBanner = null;
        battleState.isGameOver = false;
        updateBattleUI();
    });
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const x = Math.random() * park.clientWidth * 0.8 + park.clientWidth * 0.1;
            const y = Math.random() * park.clientHeight * 0.6 + park.clientHeight * 0.1;
            spawnDisperseParticles(x, y);
            spawnParticles(x, y, 20, '#ffd700');
        }, i * 150);
    }
    showFloatToast(`🏆 ${groupName} 获胜！`);
}

// ===== 更新范围圆环 =====
function updateRangeRings() {
    for (const s of students) {
        if (s.onLeave) continue;
        if (!battleState.isAlive[s.id]) continue;
        const p = petPositions[s.id];
        if (!p || !p.el) continue;
        const ring = document.getElementById('rangeRing_' + s.id);
        if (!ring) continue;

        const range = getAttackRange(s);
        const size = range * 2;
        ring.style.width = size + 'px';
        ring.style.height = size + 'px';
        ring.style.left = (p.x + p.w / 2) + 'px';
        ring.style.top = (p.y + p.h / 2) + 'px';
        ring.style.transform = 'translate(-50%, -50%)';

        const color = getGroupColor(s.groupName || '未分组');
        ring.style.borderColor = color;
        ring.style.opacity = '0.4';

        if (range > 80) ring.style.borderWidth = '2px';
        else if (range > 120) ring.style.borderWidth = '3px';
        else ring.style.borderWidth = '1.5px';

        ring.style.display = 'block';
    }
}

// ===== 斗蛐蛐每帧更新 =====
function updateBattleFrame() {
    if (battleState.isGameOver) return;
    const park = document.getElementById('petPark');
    const w = park.clientWidth || 600,
        h = park.clientHeight || 400;

    const now = performance.now();
    const delta = (now - (battleState.lastTimestamp || now)) / 1000;
    battleState.battleTime = (battleState.battleTime || 0) + delta;
    battleState.lastTimestamp = now;

    // ---- 自然回血 ----
    if (battleState.battleTime - battleState.lastRegenTime >= REGEN_INTERVAL) {
        battleState.lastRegenTime = battleState.battleTime;
        for (let s of students) {
            if (!battleState.isAlive[s.id]) continue;
            if (!isEligibleForBattle(s)) continue;
            const regen = getBattleRegen(s);
            if (regen > 0) {
                battleState.hp[s.id] = Math.min(battleState.maxHp[s.id], battleState.hp[s.id] + regen);
                const pos = petPositions[s.id];
                if (pos) showBattleDamage(pos.x + pos.w / 2, pos.y - 20, `+${regen}💚`, '#2ecc71');
            }
        }
    }

    // ---- 定身计时与控制恢复 ----
    for (let s of students) {
        if (!battleState.isAlive[s.id]) continue;
        if (battleState.isStunned[s.id]) {
            battleState.stunTimer[s.id]--;
            if (battleState.stunTimer[s.id] <= 0) {
                battleState.isStunned[s.id] = false;
                battleState.stunTimer[s.id] = 0;
                battleState.speedReduction[s.id] = 0;
                const p = petPositions[s.id];
                if (p) {
                    const origSpeed = battleState.originalSpeed[s.id] || (s.cats[9] || 0) * 0.25;
                    const angle = Math.atan2(p.vy, p.vx);
                    p.vx = Math.cos(angle) * origSpeed;
                    p.vy = Math.sin(angle) * origSpeed;
                    p.speed = origSpeed;
                }
            }
        }
        if (!battleState.isStunned[s.id] && battleState.speedReduction[s.id] > 0) {
            battleState.speedReduction[s.id] = Math.max(0, (battleState.speedReduction[s.id] || 0) - 0.5);
            if (battleState.speedReduction[s.id] < 0.1) battleState.speedReduction[s.id] = 0;
        }
    }

    // ---- AI逻辑（移动、攻击） ----
    for (let s of students) {
        if (!battleState.isAlive[s.id]) continue;
        if (!isEligibleForBattle(s)) continue;
        const pos = petPositions[s.id];
        if (!pos) continue;

        battleState.attackTimer[s.id] = (battleState.attackTimer[s.id] || 0) + 1;

        const hpRatio = battleState.hp[s.id] / battleState.maxHp[s.id];
        const target = findBestTarget(s);

        if (!battleState.isStunned[s.id]) {
            if (target) {
                battleState.targetId[s.id] = target.id;
                const tpos = petPositions[target.id];
                if (tpos) {
                    const dx = tpos.x - pos.x,
                        dy = tpos.y - pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const speed = getBattleSpeed(s);
                    const atkRange = getAttackRange(s);

                    const cooldown = getAttackCooldown(s);
                    const canAttack = battleState.attackTimer[s.id] >= cooldown;
                    const inAttackRange = dist < atkRange + 15;

                    let moveX = 0,
                        moveY = 0;

                    // 优先攻击
                    if (inAttackRange && canAttack) {
                        battleState.attackTimer[s.id] = 0;
                        performBattleAttack(s, target);
                    }

                    // 移动逻辑
                    if (hpRatio < ESCAPE_THRESHOLD && dist < ESCAPE_DIST) {
                        if (speed > 0) {
                            const angle = Math.atan2(dy, dx) + Math.PI;
                            moveX = Math.cos(angle) * speed;
                            moveY = Math.sin(angle) * speed;
                        }
                    } else if (hpRatio < CAUTIOUS_THRESHOLD && dist < atkRange) {
                        if (speed > 0) {
                            const angle = Math.atan2(dy, dx) + Math.PI;
                            moveX = Math.cos(angle) * speed * 0.6;
                            moveY = Math.sin(angle) * speed * 0.6;
                        }
                    } else if (dist > 15) {
                        if (speed > 0) {
                            const angle = Math.atan2(dy, dx);
                            moveX = Math.cos(angle) * speed;
                            moveY = Math.sin(angle) * speed;
                        }
                    } else {
                        moveX = 0;
                        moveY = 0;
                        if (!canAttack && dist < 20) {
                            const angle = Math.atan2(dy, dx) + Math.PI;
                            moveX = Math.cos(angle) * 0.1;
                            moveY = Math.sin(angle) * 0.1;
                        }
                    }

                    if (moveX !== 0 || moveY !== 0) {
                        pos.vx = pos.vx * (1 - SMOOTH_FACTOR) + moveX * SMOOTH_FACTOR;
                        pos.vy = pos.vy * (1 - SMOOTH_FACTOR) + moveY * SMOOTH_FACTOR;
                    } else {
                        pos.vx *= 0.9;
                        pos.vy *= 0.9;
                        if (Math.abs(pos.vx) < 0.05) pos.vx = 0;
                        if (Math.abs(pos.vy) < 0.05) pos.vy = 0;
                    }
                    pos.x += pos.vx;
                    pos.y += pos.vy;
                    pos.x = Math.max(0, Math.min(w - pos.w, pos.x));
                    pos.y = Math.max(0, Math.min(h - pos.h, pos.y));
                    pos.el.style.left = pos.x + 'px';
                    pos.el.style.top = pos.y + 'px';

                    if (pos.x <= 0 || pos.x >= w - pos.w) { pos.vx *= 0.6; }
                    if (pos.y <= 0 || pos.y >= h - pos.h) { pos.vy *= 0.6; }
                }
            } else {
                battleState.targetId[s.id] = null;
                pos.vx *= 0.95;
                pos.vy *= 0.95;
                if (Math.abs(pos.vx) < 0.05) pos.vx = 0;
                if (Math.abs(pos.vy) < 0.05) pos.vy = 0;
                pos.x += pos.vx;
                pos.y += pos.vy;
                pos.x = Math.max(0, Math.min(w - pos.w, pos.x));
                pos.y = Math.max(0, Math.min(h - pos.h, pos.y));
                pos.el.style.left = pos.x + 'px';
                pos.el.style.top = pos.y + 'px';
                if (pos.x <= 0 || pos.x >= w - pos.w) { pos.vx *= 0.6; }
                if (pos.y <= 0 || pos.y >= h - pos.h) { pos.vy *= 0.6; }
            }
        } else {
            if (target) {
                const tpos = petPositions[target.id];
                if (tpos) {
                    const dx = tpos.x - pos.x,
                        dy = tpos.y - pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const atkRange = getAttackRange(s);
                    const cooldown = getAttackCooldown(s);
                    if (dist < atkRange + 15 && battleState.attackTimer[s.id] >= cooldown) {
                        battleState.attackTimer[s.id] = 0;
                        performBattleAttack(s, target);
                    }
                }
            }
        }
    }

    // ---- 碰撞 ----
    const ids = Object.keys(petPositions);
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const id1 = parseInt(ids[i]),
                id2 = parseInt(ids[j]);
            const p1 = petPositions[id1],
                p2 = petPositions[id2];
            if (!p1 || !p2) continue;
            if (!battleState.isAlive[id1] || !battleState.isAlive[id2]) continue;
            const s1 = students.find(s => s.id === id1),
                s2 = students.find(s => s.id === id2);
            if (!s1 || !s2) continue;
            if (s1.groupName === s2.groupName && s1.groupName !== '未分组') continue;
            const r1 = p1.w * 0.3,
                r2 = p2.w * 0.3;
            const dx = p2.x - p1.x,
                dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > r1 + r2) continue;
            const nx = dx / dist,
                ny = dy / dist;
            const overlap = (r1 + r2 - dist) / 2;
            p1.x -= nx * overlap;
            p1.y -= ny * overlap;
            p2.x += nx * overlap;
            p2.y += ny * overlap;
            let v1n = p1.vx * nx + p1.vy * ny;
            let v2n = p2.vx * nx + p2.vy * ny;
            if (v1n > 0) { p1.vx -= 1.3 * v1n * nx;
                p1.vy -= 1.3 * v1n * ny; }
            if (v2n < 0) { p2.vx -= 1.3 * v2n * nx;
                p2.vy -= 1.3 * v2n * ny; }
        }
    }

    // ---- 更新范围圆环 ----
    updateRangeRings();

    // ---- 检查胜负 ----
    const winner = checkWinner();
    if (winner) {
        battleState.isGameOver = true;
        battleState.winnerGroup = winner;
        showBattleVictory(winner);
        students.forEach(s => {
            if (battleState.isAlive[s.id] && s.groupName === winner) {
                battleState.records[s.id].totalGames += 1;
            } else if (battleState.isAlive[s.id]) {
                battleState.records[s.id].totalGames += 1;
            }
        });
    }
}

// ===== 更新战斗UI =====
function updateBattleUI() {
    const eligible = students.filter(s => !s.onLeave && calcSubjectTotal(s) > 0);
    eligible.forEach(s => {
        const hpBar = document.getElementById('hp_' + s.id);
        if (hpBar && battleState.isAlive[s.id]) {
            const pct = Math.max(0, (battleState.hp[s.id] / battleState.maxHp[s.id]) * 100);
            hpBar.style.width = pct + '%';
            hpBar.style.background = pct > 50 ? '#2ecc71' : (pct > 25 ? '#f1c40f' : '#e74c3c');
        }
        const pos = petPositions[s.id];
        if (pos && pos.el && battleState.isAlive[s.id]) {
            let stunIcon = pos.el.querySelector('.stun-icon');
            if (battleState.isStunned[s.id]) {
                if (!stunIcon) {
                    const icon = document.createElement('div');
                    icon.className = 'stun-icon';
                    icon.textContent = '💫';
                    pos.el.appendChild(icon);
                }
            } else {
                if (stunIcon) stunIcon.remove();
            }
        }
    });
    updateAttributePanel();
    updateStatPanel();
}

// ===== 属性面板 =====
function updateAttributePanel() {
    const panel = document.getElementById('battleAttrPanel');
    const content = document.getElementById('attrContent');
    if (battleState.selectedPetIds.size === 0) {
        content.innerHTML = '<div class="no-selection">👆 点击宠物选中</div>';
        return;
    }
    let html = '';
    battleState.selectedPetIds.forEach(id => {
        const s = students.find(st => st.id === id);
        if (!s || !battleState.isAlive[id]) {
            battleState.selectedPetIds.delete(id);
            return;
        }
        const banned = s.cats[0] <= 0;
        const stamina = getBattleStaminaMax(s);
        const played = getParticipationCount(s.id);
        const remaining = Math.max(0, stamina - played);

        const atk = getBattleAttack(s);
        const def = getBattleDefense(s);
        const critRate = getCritRate(s);
        const controlPower = getControlPower(s);
        const attackSpeed = getAttackSpeed(s);
        const regen = getBattleRegen(s);
        const atkRange = getAttackRange(s);
        const speed = getBattleSpeed(s);

        const groupName = s.groupName || '未分组';
        const kills = battleState.kills[id] || [];
        let killsHtml = '';
        if (kills.length > 0) {
            killsHtml = '<div class="kills-list">💀 击败: ';
            kills.forEach(vid => {
                const v = students.find(st => st.id === vid);
                if (v) killsHtml += `<span class="kill-item">${v.animal || '🐱'}${v.name}</span>`;
            });
            killsHtml += '</div>';
        }

        let statusTags = '';
        if (battleState.isStunned[id]) statusTags += `<span class="status-tag stunned">💫 定身</span>`;

        const critDisplay = critRate >= 100 ?
            `${critRate}% (暴击效果${(2 + (critRate - 100) / 100).toFixed(1)}倍)` :
            `${critRate}%`;

        html += `
            <div class="pet-block">
                <div class="pet-header">
                    <div class="avatar">${s.animal || '🐱'}</div>
                    <div>
                        <div class="pname">${s.name} ${statusTags}</div>
                        <div class="pgroup">${groupName} · ${battleState.isAlive[id] ? '🟢' : '💀'}</div>
                    </div>
                </div>
                <div class="attr-row"><span class="label">🚫 禁赛</span><span class="value ${banned ? 'banned' : ''}">${banned ? '是' : '否'}</span></div>
                <div class="attr-row"><span class="label">💪 体力</span><span class="value">${played}/${stamina} (可战${remaining})</span></div>
                <div class="attr-row"><span class="label">💥 暴击</span><span class="value">${critDisplay}</span></div>
                <div class="attr-row"><span class="label">⚔️ 攻击</span><span class="value">${atk}</span></div>
                <div class="attr-row"><span class="label">🌀 控制力</span><span class="value">${controlPower}</span></div>
                <div class="attr-row"><span class="label">🛡️ 防御</span><span class="value">${def}</span></div>
                <div class="attr-row"><span class="label">⚡ 攻速</span><span class="value">${attackSpeed.toFixed(1)}次/秒</span></div>
                <div class="attr-row"><span class="label">💚 回血/10s</span><span class="value">${regen}</span></div>
                <div class="attr-row"><span class="label">🎯 手长</span><span class="value">${atkRange}px</span></div>
                <div class="attr-row"><span class="label">🏃 移速</span><span class="value">${speed.toFixed(2)}</span></div>
                ${killsHtml}
            </div>
        `;
    });
    content.innerHTML = html;
}

// ===== 小组面板（按存活人数排序） =====
function updateStatPanel() {
    const groups = {};
    students.forEach(s => {
        if (s.onLeave) return;
        const gName = s.groupName || '未分组';
        if (!groups[gName]) groups[gName] = [];
        groups[gName].push(s);
    });

    const groupAliveCount = {};
    for (const [gName, members] of Object.entries(groups)) {
        groupAliveCount[gName] = members.filter(m => battleState.isAlive[m.id] && isEligibleForBattle(m)).length;
    }

    const sortedGroupNames = Object.keys(groups).sort((a, b) => {
        return groupAliveCount[b] - groupAliveCount[a];
    });

    let html = '';
    for (let gName of sortedGroupNames) {
        const members = groups[gName];
        members.sort((a, b) => {
            const aAlive = battleState.isAlive[a.id] && isEligibleForBattle(a);
            const bAlive = battleState.isAlive[b.id] && isEligibleForBattle(b);
            if (aAlive && !bAlive) return -1;
            if (!aAlive && bAlive) return 1;
            return (battleState.hp[b.id] || 0) - (battleState.hp[a.id] || 0);
        });
        html += `<div class="group-block"><div class="group-name">${gName} (存活${groupAliveCount[gName]})</div>`;
        members.forEach(s => {
            const isDead = !battleState.isAlive[s.id] || !isEligibleForBattle(s);
            const hp = battleState.hp[s.id] || 0;
            const maxHp = battleState.maxHp[s.id] || 1;
            const pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
            const deadClass = isDead ? 'dead' : '';
            const hpColor = isDead ? '#444' : (pct > 50 ? '#2ecc71' : (pct > 25 ? '#f1c40f' : '#e74c3c'));
            html += `
                <div class="member-item ${deadClass}">
                    <span class="mname">${s.animal || '🐱'} ${s.name}</span>
                    <span class="mhp">
                        ${isDead ? '💀' : `${hp}`}
                        <span class="hp-bar-mini"><span class="fill" style="width:${pct}%;background:${hpColor};"></span></span>
                    </span>
                </div>
            `;
        });
        html += `</div>`;
    }
    document.getElementById('groupStatsContent').innerHTML = html || '<div style="color:#666;font-size:11px;text-align:center;padding:10px 0;">暂无数据</div>';
}

// ================================================================
//  渲染宠物公园
// ================================================================
function renderPetPark() {
    const park = document.getElementById('petPark');
    document.querySelectorAll('.pet-card, .group-queue-label, .item-object, .item-trail, .snake-victory-banner, .battle-victory-banner, .range-ring').forEach(el => el.remove());
    snakeVictoryBanner = null;
    battleState.victoryBanner = null;
    snakeGameOver = false;
    snakeWinnerGroup = null;
    groupLabels = {};
    queues = {};
    nextQueueId = 1;
    items = [];
    itemIdCounter = 0;
    flyingItem = null;
    battleState.selectedPetIds.clear();
    document.querySelectorAll('.pet-card.selected').forEach(el => el.classList.remove('selected'));

    const active = students.filter(s => !s.onLeave);
    const eligible = active.filter(s => calcSubjectTotal(s) > 0);
    if (eligible.length === 0) {
        document.getElementById('petCount').textContent = '0 只小可爱';
        if (!park.querySelector('.empty-tip')) {
            const tip = document.createElement('div');
            tip.className = 'empty-tip';
            tip.style.cssText = 'color:#888;font-size:18px;margin-top:50px;text-align:center;position:relative;z-index:20;';
            tip.textContent = '暂无符合条件的学生（九科成绩均为0）';
            park.appendChild(tip);
        }
        petPositions = {};
        return;
    }
    park.querySelectorAll('.empty-tip').forEach(el => el.remove());
    document.getElementById('petCount').textContent = eligible.length + ' 只小可爱';

    const champSet = computeChampions();
    const rect = park.getBoundingClientRect();
    const w = park.clientWidth || rect.width || 600;
    const h = park.clientHeight || rect.height || 400;
    petPositions = {};
    const isBattle = (battleState.mode === GAME_MODE.BATTLE);

    eligible.forEach(s => {
        const subjectTotal = calcSubjectTotal(s);
        const quantTotal = calcQuantTotal(s);
        const size = getEmojiSize(subjectTotal);
        if (size === 0) return;
        const cardW = Math.max(44, size * 0.9);
        const cardH = Math.max(56, size * 1.2);
        const card = createPetCard(s, size, cardW, cardH, champSet, isBattle);
        park.appendChild(card);
        const x = Math.random() * (w - cardW);
        const y = Math.random() * (h - cardH);
        card.style.left = x + 'px';
        card.style.top = y + 'px';
        const speed = isBattle ? getBattleSpeed(s) : getSpeed(quantTotal);
        const angle = Math.random() * 2 * Math.PI;
        petPositions[s.id] = {
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            el: card,
            w: cardW,
            h: cardH,
            groupName: s.groupName || '未分组',
            isHead: true,
            isQueue: false,
            queueIndex: 0,
            headId: null,
            queueId: null,
            speed: speed,
            size: size,
            isDispersing: false,
        };
    });

    if (isBattle) {
        document.getElementById('battleAttrPanel').style.display = 'block';
        document.getElementById('battleStatPanel').style.display = 'block';
        resetBattleRound();
        updateBattleUI();
    } else {
        document.getElementById('battleAttrPanel').style.display = 'none';
        document.getElementById('battleStatPanel').style.display = 'none';
        battleState.isGameOver = false;
        battleState.winnerGroup = null;
        setTimeout(() => { if (battleState.mode === GAME_MODE.SNAKE) spawnItem(); }, 500);
    }

    if (petAnimId) cancelAnimationFrame(petAnimId);
    petAnimId = requestAnimationFrame(updatePetPositions);
}

// ================================================================
//  主循环（分流）
// ================================================================
function updatePetPositions() {
    const park = document.getElementById('petPark');
    if (!park) { petAnimId = null; return; }

    if (battleState.mode === GAME_MODE.BATTLE) {
        updateBattleFrame();
        updateBattleUI();
        petAnimId = requestAnimationFrame(updatePetPositions);
        return;
    }

    // 贪吃蛇模式
    if (snakeGameOver) {
        petAnimId = requestAnimationFrame(updatePetPositions);
        return;
    }

    const rect = park.getBoundingClientRect();
    const w = park.clientWidth || rect.width || 600;
    const h = park.clientHeight || rect.height || 400;
    const ids = Object.keys(petPositions);
    if (ids.length === 0) { petAnimId = null; return; }

    ids.forEach(id => {
        const p = petPositions[id];
        if (!p || !p.el) return;
        if (p.isQueue && !p.isHead) return;
        if (p.isDispersing) {
            p.vx *= 0.98;
            p.vy *= 0.98;
            if (Math.abs(p.vx) < 0.01 && Math.abs(p.vy) < 0.01) p.isDispersing = false;
        }
        if (!p.isQueue) {
            const student = students.find(s => s.id === parseInt(id));
            if (student) {
                const newSpeed = getSpeed(calcQuantTotal(student));
                if (newSpeed === 0) { p.vx = 0;
                    p.vy = 0; } else {
                    const angle = Math.atan2(p.vy, p.vx);
                    p.vx = Math.cos(angle) * newSpeed;
                    p.vy = Math.sin(angle) * newSpeed;
                }
                p.speed = newSpeed;
            }
        } else if (p.isQueue && p.isHead) {
            const q = queues[p.queueId];
            if (!q) {
                p.isQueue = false;
                p.isHead = true;
                p.queueId = null;
                p.headId = null;
                p.el.style.border = '';
                p.el.style.boxShadow = '';
                const nameTag = p.el.querySelector('.pet-name');
                if (nameTag) { nameTag.style.top = '-14px';
                    nameTag.style.bottom = 'auto';
                    nameTag.style.background = 'rgba(0,0,0,0.6)';
                    nameTag.style.padding = '1px 8px';
                    nameTag.style.borderRadius = '12px'; }
                return;
            }
            let totalSpeed = 0;
            q.memberIds.forEach(mid => {
                const s = students.find(st => st.id === mid);
                if (s) totalSpeed += getSpeed(calcQuantTotal(s));
            });
            const newSpeed = Math.min(totalSpeed, 3.0);
            if (newSpeed === 0) { p.vx = 0;
                p.vy = 0; } else {
                const angle = Math.atan2(p.vy, p.vx);
                p.vx = Math.cos(angle) * newSpeed;
                p.vy = Math.sin(angle) * newSpeed;
            }
            p.speed = newSpeed;
        }
        let newX = p.x + p.vx,
            newY = p.y + p.vy;
        if (newX < 0) { newX = 0;
            p.vx = -p.vx * 0.6; }
        if (newX > w - p.w) { newX = w - p.w;
            p.vx = -p.vx * 0.6; }
        if (newY < 0) { newY = 0;
            p.vy = -p.vy * 0.6; }
        if (newY > h - p.h) { newY = h - p.h;
            p.vy = -p.vy * 0.6; }
        p.x = newX;
        p.y = newY;
        p.el.style.left = newX + 'px';
        p.el.style.top = newY + 'px';
        if (p.isQueue && p.isHead) {
            const q = queues[p.queueId];
            if (q) {
                if (!q.history) q.history = [];
                q.history.push({ x: newX, y: newY });
                if (q.history.length > HISTORY_LENGTH) q.history.shift();
            }
        }
    });

    Object.keys(queues).forEach(qid => {
        const q = queues[qid];
        if (!q) return;
        const head = petPositions[q.headId];
        if (!head) return;
        const history = q.history || [];
        q.memberIds.forEach((sid, idx) => {
            if (idx === 0) return;
            const p = petPositions[sid];
            if (!p) return;
            let targetX, targetY;
            const historyStep = idx * QUEUE_HISTORY_STEP;
            if (history.length > historyStep) {
                const point = history[history.length - 1 - historyStep];
                if (point) { targetX = point.x;
                    targetY = point.y; } else { targetX = head.x;
                    targetY = head.y; }
            } else {
                const angle = Math.atan2(head.y - p.y, head.x - p.x) || 0;
                const spacing = 50 + idx * 15;
                targetX = head.x - Math.cos(angle) * spacing;
                targetY = head.y - Math.sin(angle) * spacing;
            }
            p.x += (targetX - p.x) * QUEUE_FOLLOW_SPEED;
            p.y += (targetY - p.y) * QUEUE_FOLLOW_SPEED;
            p.el.style.left = p.x + 'px';
            p.el.style.top = p.y + 'px';
        });
    });

    Object.keys(queues).forEach(qid => {
        const q = queues[qid];
        if (!q) return;
        if (!groupLabels[q.groupName]) updateGroupLabel(q.groupName);
        else {
            const head = petPositions[q.headId];
            if (head && groupLabels[q.groupName]) {
                groupLabels[q.groupName].style.left = head.x + 'px';
                groupLabels[q.groupName].style.top = (head.y - 28) + 'px';
            }
        }
    });

    frameCount++;
    if (frameCount % 2 === 0) {
        const idList = Object.keys(petPositions);
        for (let i = 0; i < idList.length; i++) {
            for (let j = i + 1; j < idList.length; j++) {
                const id1 = parseInt(idList[i]),
                    id2 = parseInt(idList[j]);
                const p1 = petPositions[id1],
                    p2 = petPositions[id2];
                if (!p1 || !p2) continue;
                if ((p1.isQueue && !p1.isHead) || (p2.isQueue && !p2.isHead)) continue;
                const s1 = students.find(s => s.id === id1),
                    s2 = students.find(s => s.id === id2);
                if (!s1 || !s2 || s1.onLeave || s2.onLeave) continue;
                if (s1.groupName === s2.groupName && s1.groupName !== '未分组') continue;
                const r1 = p1.w * 0.35,
                    r2 = p2.w * 0.35;
                const dx = p2.x - p1.x,
                    dy = p2.y - p1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > r1 + r2) continue;
                const nx = dx / dist,
                    ny = dy / dist;
                const overlap = (r1 + r2 - dist) / 2;
                p1.x -= nx * overlap;
                p1.y -= ny * overlap;
                p2.x += nx * overlap;
                p2.y += ny * overlap;
                let v1n = p1.vx * nx + p1.vy * ny;
                let v2n = p2.vx * nx + p2.vy * ny;
                if (v1n > 0) { p1.vx -= 1.5 * v1n * nx;
                    p1.vy -= 1.5 * v1n * ny; }
                if (v2n < 0) { p2.vx -= 1.5 * v2n * nx;
                    p2.vy -= 1.5 * v2n * ny; }
                const cx = (p1.x + p2.x) / 2 + p1.w / 2;
                const cy = (p1.y + p2.y) / 2 + p1.h / 2;
                spawnParticles(cx, cy, 4);
            }
        }
    }

    if (frameCount % 2 === 0) {
        const singles = {};
        ids.forEach(id => {
            const p = petPositions[id];
            if (p && !p.isQueue) {
                const s = students.find(st => st.id === parseInt(id));
                if (s) {
                    const gName = s.groupName || '未分组';
                    if (gName === '未分组') return;
                    if (!singles[gName]) singles[gName] = [];
                    singles[gName].push({ id: parseInt(id), pos: p, student: s });
                }
            }
        });
        const queueByGroup = {};
        Object.keys(queues).forEach(qid => {
            const q = queues[qid];
            if (q && q.groupName !== '未分组') queueByGroup[q.groupName] = q;
        });
        Object.keys(singles).forEach(gName => {
            const members = singles[gName];
            if (members.length === 0) return;
            if (queueByGroup[gName]) {
                const q = queueByGroup[gName];
                const head = petPositions[q.headId];
                if (!head) return;
                let absorbed = false;
                members.forEach(({ id, pos }) => {
                    const dx = pos.x - head.x,
                        dy = pos.y - head.y;
                    if (Math.sqrt(dx * dx + dy * dy) < QUEUE_MERGE_DIST) {
                        if (q.memberIds.includes(id)) return;
                        if (getQueueByMember(id)) return;
                        q.memberIds.push(id);
                        q.memberIds.sort((a, b) => {
                            const sa = students.find(s => s.id === a);
                            const sb = students.find(s => s.id === b);
                            return (sa?.seatOrder || 0) - (sb?.seatOrder || 0);
                        });
                        const newHeadId = q.memberIds[0];
                        q.headId = newHeadId;
                        q.memberIds.forEach((sid, idx) => {
                            const p = petPositions[sid];
                            if (p) {
                                p.queueId = q.id;
                                p.isQueue = true;
                                p.isHead = (idx === 0);
                                p.queueIndex = idx;
                                p.headId = (idx === 0) ? null : q.headId;
                                p.el.style.border = (idx === 0) ? '2px solid #ffd700' : '';
                                p.el.style.boxShadow = (idx === 0) ? '0 0 20px rgba(255,215,0,0.3)' : '';
                                const nameTag = p.el.querySelector('.pet-name');
                                if (nameTag) { nameTag.style.top = 'auto';
                                    nameTag.style.bottom = '-14px';
                                    nameTag.style.background = 'rgba(0,0,0,0.5)';
                                    nameTag.style.padding = '0 6px';
                                    nameTag.style.borderRadius = '10px'; }
                                if (idx === 0) {
                                    let totalSpeed = 0;
                                    q.memberIds.forEach(mid => {
                                        const ss = students.find(st => st.id === mid);
                                        if (ss) totalSpeed += getSpeed(calcQuantTotal(ss));
                                    });
                                    const newSpeed = Math.min(totalSpeed, 3.0);
                                    const angle = Math.atan2(p.vy, p.vx) || Math.random() * 2 * Math.PI;
                                    p.vx = Math.cos(angle) * newSpeed;
                                    p.vy = Math.sin(angle) * newSpeed;
                                    p.speed = newSpeed;
                                } else { p.vx = 0;
                                    p.vy = 0; }
                                p.isDispersing = false;
                            }
                        });
                        const newHead = petPositions[q.headId];
                        if (newHead) q.history = [{ x: newHead.x, y: newHead.y }];
                        updateGroupLabel(gName);
                        spawnParticles(pos.x + pos.w / 2, pos.y + pos.h / 2, 6);
                        absorbed = true;
                    }
                });
                if (absorbed) return;
            }
            for (let i = 0; i < members.length; i++) {
                for (let j = i + 1; j < members.length; j++) {
                    const a = members[i],
                        b = members[j];
                    const dx = a.pos.x - b.pos.x,
                        dy = a.pos.y - b.pos.y;
                    if (Math.sqrt(dx * dx + dy * dy) < QUEUE_MERGE_DIST) {
                        if (getQueueByMember(a.id) || getQueueByMember(b.id)) continue;
                        const memberIds = [a.id, b.id];
                        const newQid = createQueue(gName, memberIds);
                        if (newQid) spawnParticles((a.pos.x + b.pos.x) / 2 + a.pos.w / 2, (a.pos.y + b.pos.y) / 2 + a.pos.h / 2, 8);
                        i = members.length;
                        break;
                    }
                }
            }
        });

        let merged = false;
        do {
            merged = false;
            const qIds = Object.keys(queues);
            for (let i = 0; i < qIds.length; i++) {
                const q1 = queues[qIds[i]];
                if (!q1) continue;
                for (let j = i + 1; j < qIds.length; j++) {
                    const q2 = queues[qIds[j]];
                    if (!q2) continue;
                    if (q1.groupName !== q2.groupName || q1.groupName === '未分组') continue;
                    let shouldMerge = false;
                    for (let mid1 of q1.memberIds) {
                        if (shouldMerge) break;
                        const p1 = petPositions[mid1];
                        if (!p1) continue;
                        for (let mid2 of q2.memberIds) {
                            const p2 = petPositions[mid2];
                            if (!p2) continue;
                            const dx = p1.x - p2.x,
                                dy = p1.y - p2.y;
                            if (Math.sqrt(dx * dx + dy * dy) < QUEUE_MERGE_DIST) { shouldMerge = true; break; }
                        }
                    }
                    if (shouldMerge) {
                        const mergedIds = [...new Set([...q1.memberIds, ...q2.memberIds])];
                        mergedIds.sort((a, b) => {
                            const sa = students.find(s => s.id === a);
                            const sb = students.find(s => s.id === b);
                            return (sa?.seatOrder || 0) - (sb?.seatOrder || 0);
                        });
                        const groupName = q1.groupName;
                        delete queues[q1.id];
                        delete queues[q2.id];
                        const newQid = createQueue(groupName, mergedIds);
                        if (newQid) {
                            spawnDisperseParticles(
                                (petPositions[q1.headId].x + petPositions[q2.headId].x) / 2,
                                (petPositions[q1.headId].y + petPositions[q2.headId].y) / 2
                            );
                        }
                        merged = true;
                        break;
                    }
                }
                if (merged) break;
            }
        } while (merged);
    }

    const anySingle = Object.values(petPositions).some(p => !p.isQueue);
    if (!anySingle && items.length === 0 && !flyingItem) spawnItem();
    if (flyingItem) updateFlyingItem();
    const heads = Object.values(petPositions).filter(p => p.isQueue && p.isHead);
    for (let head of heads) {
        const q = queues[head.queueId];
        if (!q) continue;
        for (let item of items) {
            if (!item.active) continue;
            const dx = head.x - item.x,
                dy = head.y - item.y;
            if (Math.sqrt(dx * dx + dy * dy) < ITEM_PICKUP_DIST) {
                pickupItem(item, head, head.queueId);
                break;
            }
        }
    }
    checkSnakeVictory();

    petAnimId = requestAnimationFrame(updatePetPositions);
}

// ================================================================
//  滑块与模式切换
// ================================================================
function saveSliderValues() {
    const speed = document.getElementById('speedSlider')?.value || '1.0';
    const size = document.getElementById('sizeSlider')?.value || '1.0';
    try {
        localStorage.setItem('pet_slider_values_' + CURRENT_CLASS, JSON.stringify({ speed: parseFloat(speed), size: parseFloat(size) }));
    } catch (e) {}
}
function loadSliderValues() {
    try {
        const raw = localStorage.getItem('pet_slider_values_' + CURRENT_CLASS);
        if (raw) {
            const data = JSON.parse(raw);
            if (data.speed !== undefined) globalSpeedFactor = data.speed;
            if (data.size !== undefined) globalSizeFactor = data.size;
            return data;
        }
    } catch (e) {}
    return null;
}
function bindSliders() {
    const sizeSlider = document.getElementById('sizeSlider');
    const speedSlider = document.getElementById('speedSlider');
    const sizeLabel = document.getElementById('sizeLabel');
    const speedLabel = document.getElementById('speedLabel');
    if (sizeSlider) {
        sizeSlider.addEventListener('input', function() {
            globalSizeFactor = parseFloat(this.value);
            if (sizeLabel) sizeLabel.textContent = globalSizeFactor.toFixed(1);
            saveSliderValues();
            updatePetSizes();
        });
    }
    if (speedSlider) {
        speedSlider.addEventListener('input', function() {
            globalSpeedFactor = parseFloat(this.value);
            if (speedLabel) speedLabel.textContent = globalSpeedFactor.toFixed(1);
            saveSliderValues();
        });
    }
}
function updatePetSizes() {
    Object.keys(petPositions).forEach(id => {
        const p = petPositions[id];
        if (!p || !p.el) return;
        const student = students.find(s => s.id === parseInt(id));
        if (!student) return;
        const subjectTotal = calcSubjectTotal(student);
        const size = getEmojiSize(subjectTotal);
        if (size === 0) { p.el.style.display = 'none'; return; }
        p.el.style.display = '';
        const cardW = Math.max(44, size * 0.9);
        const cardH = Math.max(56, size * 1.2);
        p.w = cardW;
        p.h = cardH;
        p.el.style.width = cardW + 'px';
        p.el.style.height = cardH + 'px';
        const emoji = p.el.querySelector('.pet-emoji');
        if (emoji) emoji.style.fontSize = size + 'px';
    });
}
function showFloatToast(text) {
    const toast = document.getElementById('floatToast');
    toast.textContent = text;
    toast.className = 'float-toast show';
    setTimeout(() => {
        toast.className = 'float-toast hide';
        setTimeout(() => { toast.className = 'float-toast'; }, 600);
    }, 1200);
}

// ===== 模式切换 =====
function switchMode(mode) {
    if (mode === battleState.mode) return;
    battleState.mode = mode;

    const speedContainer = document.getElementById('speedSliderContainer');
    const sizeContainer = document.getElementById('sizeSliderContainer');

    if (mode === GAME_MODE.BATTLE) {
        if (speedContainer) speedContainer.style.display = 'none';
        if (sizeContainer) sizeContainer.style.display = 'none';
        document.getElementById('battleAttrPanel').style.display = 'block';
        document.getElementById('battleStatPanel').style.display = 'block';
        queues = {};
        groupLabels = {};
        items = [];
        flyingItem = null;
        snakeGameOver = false;
        snakeWinnerGroup = null;
        if (snakeVictoryBanner) { snakeVictoryBanner.remove();
            snakeVictoryBanner = null; }
        battleState.selectedPetIds.clear();
        document.querySelectorAll('.pet-card.selected').forEach(el => el.classList.remove('selected'));
        if (battleState.victoryBanner) { battleState.victoryBanner.remove();
            battleState.victoryBanner = null; }
        renderPetPark();
        resetBattleRound();
        updateBattleUI();
    } else {
        if (speedContainer) speedContainer.style.display = 'flex';
        if (sizeContainer) sizeContainer.style.display = 'flex';
        document.getElementById('battleAttrPanel').style.display = 'none';
        document.getElementById('battleStatPanel').style.display = 'none';
        battleState.isGameOver = false;
        battleState.winnerGroup = null;
        if (battleState.victoryBanner) { battleState.victoryBanner.remove();
            battleState.victoryBanner = null; }
        renderPetPark();
    }

    const btn = document.getElementById('modeSwitchBtn');
    if (btn) {
        btn.textContent = mode === GAME_MODE.SNAKE ? '🐍 贪吃蛇' : '⚔️ 斗蛐蛐';
        btn.style.background = mode === GAME_MODE.SNAKE ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)';
        btn.style.borderColor = mode === GAME_MODE.SNAKE ? '#2ecc71' : '#e74c3c';
    }
    showFloatToast(`切换到 ${mode === GAME_MODE.SNAKE ? '贪吃蛇' : '斗蛐蛐'} 模式`);
}

// ================================================================
//  启动
// ================================================================
function init() {
    if (!loadData()) {
        const park = document.getElementById('petPark');
        const tip = document.createElement('div');
        tip.className = 'empty-tip';
        tip.style.cssText = 'color:#888;font-size:18px;margin-top:50px;text-align:center;position:relative;z-index:20;';
        tip.textContent = '暂无数据，请先到教室导入学生';
        park.appendChild(tip);
        document.getElementById('petCount').textContent = '0 只小可爱';
        return;
    }
    const saved = loadSliderValues();
    if (saved) {
        const speedSlider = document.getElementById('speedSlider');
        const sizeSlider = document.getElementById('sizeSlider');
        const speedLabel = document.getElementById('speedLabel');
        const sizeLabel = document.getElementById('sizeLabel');
        if (speedSlider) { speedSlider.value = saved.speed; if (speedLabel) speedLabel.textContent = saved.speed.toFixed(1); }
        if (sizeSlider) { sizeSlider.value = saved.size; if (sizeLabel) sizeLabel.textContent = saved.size.toFixed(1); }
    }
    bindSliders();

    const modeBtn = document.getElementById('modeSwitchBtn');
    if (modeBtn) {
        modeBtn.addEventListener('click', function() {
            const newMode = battleState.mode === GAME_MODE.SNAKE ? GAME_MODE.BATTLE : GAME_MODE.SNAKE;
            switchMode(newMode);
        });
    }
    renderPetPark();
}

window.addEventListener('storage', function(e) {
    if (e.key === 'classroomData_' + CURRENT_CLASS) {
        if (loadData()) {
            renderPetPark();
            showFloatToast('🔄 数据已同步');
        }
    }
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        if (loadData()) renderPetPark();
    }
});

init();