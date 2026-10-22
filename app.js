// 班级量化管理系统 | Copyright (c) 2026 黄迁胜 | 根据 MIT 许可证授权
 document.addEventListener('contextmenu', e => e.preventDefault());

function getClassFromURL() {
    const params = new URLSearchParams(window.location.search);
    const classId = params.get('classId') || params.get('class');
    if (!classId) {
        return localStorage.getItem('currentClassId') || '一班';
    }
    localStorage.setItem('currentClassId', classId);
    return classId;
}
const CURRENT_CLASS = getClassFromURL();

let currentWeek = '1';

const CATEGORIES = ['安全','道德','艺体','学习','纪律','卫生','仪态','就餐','住宿','走读'];
const CAT_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e84393','#00b894','#6c5ce7'];
const CAT_ICONS = ['🛡️','⚖️','🎨','📚','📋','🧹','👔','🥢','🛏️','🚌'];
const COLS = 12, ROWS = 12;
const COLOR_PALETTE = ['#3498db','#2ecc71','#e67e22','#9b59b6','#1abc9c','#e74c3c','#f1c40f','#2c3e50','#00b894','#6c5ce7','#fd79a8','#0984e3','#00cec9','#fdcb6e','#e17055','#6c5ce7','#a29bfe','#55efc4','#fab1a0','#81ecec','#74b9ff','#dfe6e9'];
const SUBJECTS = ['语文','数学','英语','物理','化学','历史','地理','生物','政治'];
const SUB_ABBR = { '语文':'语', '数学':'数', '英语':'英', '物理':'物', '化学':'化', '历史':'史', '地理':'地', '生物':'生', '政治':'政' };

const ANIMALS = [
    '🐱','🐶','🐰','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🐣','🐺','🐗','🐴','🦄',
    '🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊',
    '🦅','🦉','🦇','🐿','🦔','🐀','🐁','🐹','🐭','🐾','🐲','🐉','🐚','🦞','🦭','🐪','🐫','🦙','🦒','🐘','🦏','🦛','🐃','🐂','🐄','🐖','🐏','🐑','🐐',
    '🦃','🦚','🦜','🦢','🦩','🕊','🦆','🐥','🦢','🦉','🐺','🦊','🦝','🐻‍❄️','🐼','🦘','🦡','🦦','🦥',
    '🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🎍','🎋','🍄','🌰','🌸','🌺','🌻','🌹','🌼','🌾','💐','🍂','🍁','⭐','🌟','🔥','💧','🎈'
];

const _urlParams = new URLSearchParams(window.location.search);
let currentSubject = _urlParams.get('subject') || null;
if (currentSubject && !SUBJECTS.includes(currentSubject)) {
    currentSubject = null;
}

let rankingMode = 'relative';
let subjectFullScore = 100;
let rankingTotalCount = 0;
let rankingBarExpanded = false;
let subjectRanks = {};

function getRankingStorageKey(suffix) {
    if (currentSubject) {
        return `seat${suffix}_${CURRENT_CLASS}_${currentSubject}`;
    } else {
        return `seat${suffix}_${CURRENT_CLASS}`;
    }
}

function loadRankingSettings() {
    try {
        const mode = localStorage.getItem(getRankingStorageKey('RankingMode'));
        rankingMode = (mode === 'absolute') ? 'absolute' : 'relative';

        const scoreRaw = localStorage.getItem(getRankingStorageKey('FullScore'));
        const score = parseFloat(scoreRaw);
        subjectFullScore = (!isNaN(score) && score > 0) ? score : 100;

        const totalRaw = localStorage.getItem(getRankingStorageKey('TotalCount'));
        const total = parseInt(totalRaw, 10);
        rankingTotalCount = (!isNaN(total) && total > 0) ? total : 0;
    } catch(e) {
        rankingMode = 'relative';
        subjectFullScore = 100;
        rankingTotalCount = 0;
    }
}

function saveRankingSettings() {
    try {
        localStorage.setItem(getRankingStorageKey('RankingMode'), rankingMode);
        localStorage.setItem(getRankingStorageKey('FullScore'), String(subjectFullScore));
        localStorage.setItem(getRankingStorageKey('TotalCount'), String(rankingTotalCount));
    } catch(e) {}
}

function loadRankingBarState() {
    try {
        rankingBarExpanded = localStorage.getItem('seatRankingBarExpanded_' + CURRENT_CLASS) === '1';
    } catch(e) { rankingBarExpanded = false; }
}
function saveRankingBarState() {
    try {
        localStorage.setItem('seatRankingBarExpanded_' + CURRENT_CLASS, rankingBarExpanded ? '1' : '0');
    } catch(e) {}
}
function toggleRankingBar() {
    rankingBarExpanded = !rankingBarExpanded;
    saveRankingBarState();
    updateRankingUIBar();
}

function getRankingScore(student) {
    if (currentSubject) {
        return parseFloat(student['subject_' + currentSubject]) || 0;
    } else {
        let sum = 0;
        SUBJECTS.forEach(sub => { sum += parseFloat(student['subject_' + sub]) || 0; });
        return sum;
    }
}

function calcRanksRelative(items, totalCount) {
    const sorted = items.slice().sort((a, b) => b.score - a.score);
    const n = sorted.length;
    const total = Math.max(totalCount || n, n);
    const ranks = {};
    let prevScore = null;
    let prevRank = 0;
    sorted.forEach((item, i) => {
        let rank;
        if (prevScore !== null && item.score === prevScore) {
            rank = prevRank;
        } else {
            rank = i + 1;
            prevRank = rank;
            prevScore = item.score;
        }
        const percentile = (rank - 1) / total;
        let level = 9;
        if (percentile < 0.1) level = 1;
        else if (percentile < 0.2) level = 2;
        else if (percentile < 0.3) level = 3;
        else if (percentile < 0.4) level = 4;
        else if (percentile < 0.5) level = 5;
        else if (percentile < 0.6) level = 6;
        else if (percentile < 0.7) level = 7;
        else if (percentile < 0.8) level = 8;
        else level = 9;
        ranks[item.id] = level;
    });
    return ranks;
}

function calcRanksAbsolute(items, fullScore) {
    const ranks = {};
    items.forEach(item => {
        const ratio = fullScore > 0 ? (item.score / fullScore) : 0;
        let rank;
        if (ratio >= 0.9) rank = 1;
        else if (ratio >= 0.8) rank = 2;
        else if (ratio >= 0.7) rank = 3;
        else if (ratio >= 0.6) rank = 4;
        else if (ratio >= 0.5) rank = 5;
        else if (ratio >= 0.4) rank = 6;
        else if (ratio >= 0.3) rank = 7;
        else if (ratio >= 0.2) rank = 8;
        else rank = 9;
        ranks[item.id] = rank;
    });
    return ranks;
}

function updateSubjectRanks() {
    if (students.length === 0) {
        subjectRanks = {};
        return;
    }
    const items = students.map(s => ({ id: s.id, score: getRankingScore(s) }));
    if (rankingMode === 'absolute') {
        subjectRanks = calcRanksAbsolute(items, subjectFullScore);
    } else {
        subjectRanks = calcRanksRelative(items, rankingTotalCount);
    }
}

function updateRankingUIBar() {
    const bar = document.getElementById('subjectModeHint');
    const btn = document.getElementById('rankingToggleBtn');
    if (btn) {
        const labelText = currentSubject ? `${currentSubject}排号` : `总分排号`;
        btn.textContent = labelText + (rankingBarExpanded ? ' ▲' : ' ▼');
    }
    if (!bar) return;
    bar.style.display = rankingBarExpanded ? 'flex' : 'none';
    const label = document.getElementById('subjectModeLabel');
    if (label) {
        if (currentSubject) { label.textContent = `📚 ${currentSubject}排号`; }
        else { label.textContent = `总分排号`; }
    }
    const sel = document.getElementById('rankingModeSelect');
    if (sel) sel.value = rankingMode;
    const fullWrap = document.getElementById('fullScoreWrap');
    const totalWrap = document.getElementById('totalCountWrap');
    if (fullWrap) fullWrap.style.display = (rankingMode === 'absolute') ? 'inline-flex' : 'none';
    if (totalWrap) totalWrap.style.display = (rankingMode === 'relative') ? 'inline-flex' : 'none';
    const inp = document.getElementById('fullScoreInput');
    if (inp) inp.value = subjectFullScore;
    const totalInp = document.getElementById('totalCountInput');
    if (totalInp) totalInp.value = (rankingTotalCount > 0) ? rankingTotalCount : students.length;
}

let students = [], groups = [], currentGroupId = null;
let selectedStudentIds = new Set();
let multiSelectMode = false;
let multiPanelsHidden = false;
let multiSelectDeltas = {};
let multiSelectSubjectDeltas = {};
let dragSelectedIds = [];
let podiumStartIndex = 5;
const PODIUM_WIDTH = 2;
let isDraggingPodium = false;
let activeCategories = new Set();
let activeSubjects = new Set();
let groupColorMap = {};
let groupSloganMap = {};
let clickTimer = null;
let currentZoom = 1.0;
let editingStudentId = null;
let pendingPetForEdit = '🐱';
let ringModeAdd = true;
let activeStudentId = null;
let studentScoreDelta = {};
let subjectScoreDelta = {};

let chartQuant = null, chartSubject = null, chartMember = null;

function saveActiveFilters() {
    const data = {
        categories: Array.from(activeCategories),
        subjects: Array.from(activeSubjects)
    };
    DataManager.saveActiveFilters(data, CURRENT_CLASS);
}
function loadActiveFilters() {
    const data = DataManager.loadActiveFilters(CURRENT_CLASS);
    activeCategories = new Set(data.categories || []);
    activeSubjects = new Set(data.subjects || []);
}
function ensureSubjectFields(s) {
    SUBJECTS.forEach(sub => { if (!(('subject_'+sub) in s)) s['subject_'+sub] = 0; });
}

function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        if (type === 'firework') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.3);
            const bufferSize = ctx.sampleRate * 0.4;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
            const noise = ctx.createBufferSource(); noise.buffer = buffer;
            const gain2 = ctx.createGain();
            gain2.gain.setValueAtTime(0.5, now + 0.25);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
            noise.connect(gain2); gain2.connect(ctx.destination);
            noise.start(now + 0.25); noise.stop(now + 0.7);
        } else if (type === 'kneel') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.7);
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.frequency.value = 12; lfoGain.gain.value = 30;
            lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
            lfo.start(now); lfo.stop(now + 0.8);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(now); osc.stop(now + 0.8);
        }
    } catch(e) {}
}

function zoomGrid(delta) {
    const grid = document.getElementById('classroomGrid');
    const label = document.getElementById('zoomLevelLabel');
    if (delta === 0) currentZoom = 1.0;
    else currentZoom = Math.max(0.5, Math.min(2.0, currentZoom + delta/100));
    grid.style.zoom = currentZoom;
    label.textContent = Math.round(currentZoom * 100) + '%';
}

let longPressTimer = null;
document.getElementById('classroomGrid').addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    if (e.target.closest('.seat, .podium, .group-label-float, .ring-item, button')) return;
    longPressTimer = setTimeout(() => { e.preventDefault(); longPressTimer = null; }, 600);
}, { passive: false });
document.getElementById('classroomGrid').addEventListener('touchend', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });
document.getElementById('classroomGrid').addEventListener('touchmove', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });

function getPassword(){ const encoded = localStorage.getItem('classroomPassword'); if(encoded){ try { return atob(encoded); } catch(e) { return null; } } return null; }
function setPassword(newPassword){ localStorage.setItem('classroomPassword', btoa(newPassword)); }
function hasPassword(){ return getPassword() !== null; }
function verifyPassword(input){ const stored = getPassword(); return stored !== null && stored === input; }
function changePassword(){
    const oldPwd = getPassword();
    if (oldPwd) { const entered = prompt('请输入当前密码：'); if (entered === null) return; if (!verifyPassword(entered)) { alert('❌ 密码错误！'); return; } }
    const newPwd = prompt('请输入新密码（至少4位）：'); if (newPwd === null) return; if (newPwd.length < 4) { alert('密码长度至少4位'); return; }
    const confirmPwd = prompt('请再次输入新密码：'); if (confirmPwd !== newPwd) { alert('两次输入不一致'); return; }
    setPassword(newPwd); alert('✅ 密码修改成功！');
}

function loadWeekNumber() {
    const week = DataManager.loadWeek(CURRENT_CLASS);
    const weekInput = document.getElementById('weekInput');
    if (weekInput) {
        weekInput.value = parseInt(week) || 1;
        currentWeek = weekInput.value;
    } else {
        currentWeek = week;
    }
}
function saveWeekNumber() {
    const weekInput = document.getElementById('weekInput');
    let val = parseInt(weekInput.value);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 99) val = 99;
    weekInput.value = val;
    currentWeek = val.toString();
    DataManager.saveWeek(currentWeek, CURRENT_CLASS);
}
function saveWeekNumberWithPassword() {
    if (!hasPassword()) {
        const pwd = prompt('首次修改周次，请设置密码（至少4位）：');
        if (pwd === null) return;
        if (pwd.length < 4) { alert('密码长度至少4位'); return; }
        const confirmPwd = prompt('请再次输入密码确认：');
        if (confirmPwd !== pwd) { alert('两次输入不一致'); return; }
        setPassword(pwd);
        alert('✅ 密码设置成功！');
        saveWeekNumber();
        return;
    }
    const input = prompt('请输入密码以修改周次：');
    if (input === null) {
        const saved = localStorage.getItem('weekNumber_' + CURRENT_CLASS);
        const weekInput = document.getElementById('weekInput');
        if (saved !== null) weekInput.value = parseInt(saved) || 1;
        else weekInput.value = 1;
        return;
    }
    if (!verifyPassword(input)) {
        alert('❌ 密码错误！');
        const saved = localStorage.getItem('weekNumber_' + CURRENT_CLASS);
        const weekInput = document.getElementById('weekInput');
        if (saved !== null) weekInput.value = parseInt(saved) || 1;
        else weekInput.value = 1;
        return;
    }
    saveWeekNumber();
}

function handleWeekReset(e){
    if (e.target.tagName === 'INPUT') return;
    clearAllScoresWithPassword();
}

function saveDailySnapshot() {
    if (students.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const snapshot = students.map(s => ({
        id: s.id,
        name: s.name,
        groupName: s.groupName || '未分组',
        cats: [...s.cats],
        subjects: SUBJECTS.map(sub => s['subject_' + sub] || 0)
    }));
    DataManager.saveDailySnapshot(today, snapshot, CURRENT_CLASS);
}

function clearAllScoresWithPassword(){
    if (students.length === 0) { showFloatToast('⚠️ 当前没有学生数据'); return; }
    if (!hasPassword()) { 
        const pwd = prompt('首次使用，请设置清空密码（至少4位）：'); 
        if (pwd === null) return; 
        if (pwd.length < 4) { alert('密码长度至少4位'); return; } 
        const confirmPwd = prompt('请再次输入密码确认：'); 
        if (confirmPwd !== pwd) { alert('两次输入不一致'); return; } 
        setPassword(pwd); 
        alert('✅ 密码设置成功！'); 
    }
    const input = prompt('请输入清空密码：'); 
    if (input === null) return;
    if (!verifyPassword(input)) { alert('❌ 密码错误！'); return; }
    
    const week = document.getElementById('weekInput').value || '1';
    const confirmMsg = `🧹 确定要清空第 ${week} 周的所有量化分数吗？\n\n将会清空：\n• 10项分类加分（安全、道德、艺体……）\n• 九科成绩（语文、数学……）\n• 个人总分\n• 小组分\n\n保留：\n• 学生姓名\n• 月考排号\n• 学期分组\n• 座位位置\n• 小组颜色将随机刷新\n• 小动物不变 ✨\n\n⚠️ 此操作不可撤销！`;
    if (!confirm(confirmMsg)) return;

    const weekSnapshot = students.map(s => ({
        id: s.id,
        name: s.name,
        groupName: s.groupName || '未分组',
        seatOrder: s.seatOrder,
        duty: s.duty || '',
        animal: s.animal || '🐱',
        petState: s.petState || 'normal',
        cats: [...s.cats],
        subjects: SUBJECTS.map(sub => s['subject_' + sub] || 0)
    }));
    DataManager.addHistory(week, weekSnapshot, CURRENT_CLASS);
    saveDailySnapshot();

    students.forEach(s => { 
        s.cats = CATEGORIES.map(() => 0); 
        SUBJECTS.forEach(sub => { s['subject_' + sub] = 0; });
        s.quantTotal = 0; 
        s.personalTotal = 0;
    });

    const groupNames = [...new Set(students.map(s => s.groupName || '未分组'))];
    const shuffled = [...COLOR_PALETTE];
    for (let i = shuffled.length - 1; i > 0; i--) { 
        const j = Math.floor(Math.random() * (i + 1)); 
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; 
    }
    groupColorMap = {}; 
    groupNames.forEach((name, idx) => { groupColorMap[name] = shuffled[idx % shuffled.length]; });

    recalcAll(); 
    groups = buildGroups(); 
    updateSubjectRanks();
    render();
    saveWeekNumber();
    showFloatToast(`✅ 第 ${week} 周量化分数与学科成绩已清空，小组颜色已更新，小动物保持不变`);
    speak(`第 ${week} 周量化分数与学科成绩已清空`);
}

function goToPetPark() {
    saveToLocal();
    window.location.href = 'pet.html?classId=' + encodeURIComponent(CURRENT_CLASS);
}
function toggleCategory(idx) {
    if (activeCategories.has(idx)) activeCategories.delete(idx);
    else activeCategories.add(idx);
    saveActiveFilters();
    render();
}
function toggleSubject(subject) {
    if (activeSubjects.has(subject)) activeSubjects.delete(subject);
    else activeSubjects.add(subject);
    saveActiveFilters();
    render();
}

function calcQuantTotal(s){ return Math.round(s.cats.reduce((a,b)=>a+b,0) * 10) / 10; }
function calcSubjectTotal(s){ let sum = 0; SUBJECTS.forEach(sub => { sum += s['subject_'+sub] || 0; }); return Math.round(sum * 10) / 10; }
function calcPersonalTotal(s){ return calcQuantTotal(s) + calcSubjectTotal(s); }
function recalcAll(){ students.forEach(s => { ensureSubjectFields(s); s.quantTotal = calcQuantTotal(s); s.personalTotal = calcPersonalTotal(s); }); }

function buildGroups(){
    const map = new Map();
    students.forEach(s => { const key = s.groupName || '未分组'; if (!map.has(key)) map.set(key, []); map.get(key).push(s); });
    const result = []; let id=0;
    for (const [name, members] of map) {
        members.sort((a,b)=>a.seatOrder-b.seatOrder);
        const activeMembers = members.filter(m => !m.onLeave);
        const count = activeMembers.length;
        const totalPersonal = activeMembers.reduce((sum, m) => sum + m.personalTotal, 0);
        const groupTotal = count ? Math.round((totalPersonal / count) * 10) / 10 : 0;
        const slogan = groupSloganMap[name] || '';
        result.push({ id: id++, name, members, activeMembers, groupTotal, memberCount: count, slogan });
    }
    result.sort((a,b)=>a.name.localeCompare(b.name));
    return result;
}

function getGroupColor(groupName){ return groupColorMap[groupName] || '#3498db'; }

function speak(text){ if (!document.getElementById('voiceCheckbox').checked) return; try { const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'zh-CN'; utterance.rate = 1.0; utterance.pitch = 1.0; utterance.volume = 0.8; window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); } catch(e) {} }
function showFloatToast(text) { const toast = document.getElementById('floatToast'); toast.textContent = text; toast.className = 'float-toast show'; setTimeout(() => { toast.className = 'float-toast hide'; setTimeout(() => { toast.className = 'float-toast'; }, 600); }, 1200); }

function launchRocket(x, y, color = '#ffd700') { const container = document.getElementById('fxContainer'); const rocket = document.createElement('div'); rocket.className = 'rocket'; rocket.textContent = '🚀'; rocket.style.left = (x - 18) + 'px'; rocket.style.top = (y - 18) + 'px'; rocket.style.color = color; rocket.style.textShadow = `0 0 30px ${color}`; container.appendChild(rocket); for (let i = 0; i < 16; i++) { const p = document.createElement('div'); p.className = 'particle fire'; const size = 4 + Math.random() * 6; const angle = Math.random() * 2 * Math.PI; const dist = 30 + Math.random() * 50; const tx = Math.cos(angle) * dist, ty = Math.sin(angle) * dist - 50; p.style.cssText = `left:${x-size/2}px; top:${y-size/2}px; width:${size}px; height:${size}px; background:${color}; box-shadow:0 0 12px ${color}; --tx:${tx}px; --ty:${ty}px; animation-delay:${Math.random()*0.2}s;`; container.appendChild(p); setTimeout(() => p.remove(), 1000); } requestAnimationFrame(() => { rocket.classList.add('fly'); }); setTimeout(() => rocket.remove(), 1600); }
function launchCry(x, y) { const container = document.getElementById('fxContainer'); const cry = document.createElement('div'); cry.className = 'cry-face'; cry.textContent = '😭'; cry.style.left = (x - 30) + 'px'; cry.style.top = (y - 30) + 'px'; container.appendChild(cry); for (let i = 0; i < 20; i++) { const p = document.createElement('div'); p.className = 'particle fire'; const size = 3 + Math.random() * 5; const angle = Math.random() * 2 * Math.PI; const dist = 40 + Math.random() * 70; const tx = Math.cos(angle) * dist, ty = Math.sin(angle) * dist; p.style.cssText = `left:${x-size/2}px; top:${y-size/2}px; width:${size}px; height:${size}px; background:#ff6666; box-shadow:0 0 10px #ff6666; --tx:${tx}px; --ty:${ty}px; animation-delay:${Math.random()*0.2}s;`; container.appendChild(p); setTimeout(() => p.remove(), 1100); } requestAnimationFrame(() => { cry.classList.add('burst'); }); setTimeout(() => cry.remove(), 1300); }

function launchFirework(count) {
    const container = document.getElementById('fxContainer');
    const colors = ['#ff4d4d','#ffaa00','#ffff00','#66ff66','#66ccff','#ff66cc','#ffd700'];
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const x = Math.random() * innerWidth * 0.8 + innerWidth * 0.1;
            const y = Math.random() * innerHeight * 0.45 + innerHeight * 0.15;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const trailW = document.createElement('div');
            trailW.className = 'firework';
            trailW.style.left = x + 'px';
            trailW.style.bottom = '0px';
            const t = document.createElement('div');
            t.className = 'trail';
            t.style.background = color;
            trailW.appendChild(t);
            container.appendChild(trailW);
            setTimeout(() => trailW.remove(), 700);
            const burst = document.createElement('div');
            burst.className = 'firework';
            burst.style.left = x + 'px';
            burst.style.top = y + 'px';
            const flash = document.createElement('div');
            flash.className = 'flash';
            burst.appendChild(flash);
            for (let j = 0; j < 50; j++) {
                const p = document.createElement('div');
                p.className = 'burst';
                const sz = 4 + Math.random() * 8;
                p.style.width = sz + 'px';
                p.style.height = sz + 'px';
                const angle = Math.random() * 2 * Math.PI;
                const dist = 100 + Math.random() * 200;
                p.style.setProperty('--fx', Math.cos(angle) * dist + 'px');
                p.style.setProperty('--fy', Math.sin(angle) * dist + 'px');
                p.style.background = color;
                p.style.color = color;
                p.style.animationDelay = Math.random() * 0.3 + 's';
                burst.appendChild(p);
            }
            container.appendChild(burst);
            setTimeout(() => burst.remove(), 1500);
            playSound('firework');
        }, i * 500);
    }
}

function playDeathEffect(count) {
    const container = document.getElementById('fxContainer');
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const x = Math.random() * innerWidth * 0.6 + innerWidth * 0.2;
            const y = Math.random() * innerHeight * 0.4 + innerHeight * 0.2;
            const el = document.createElement('div');
            el.className = 'death-anim';
            el.textContent = '😵';
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            container.appendChild(el);
            for (let k = 0; k < 12; k++) {
                const p = document.createElement('div');
                p.className = 'death-particle';
                const angle = Math.random() * 2 * Math.PI;
                const dist = 30 + Math.random() * 80;
                p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
                p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
                p.style.width = (4 + Math.random() * 6) + 'px';
                p.style.height = p.style.width;
                p.style.left = x + 'px';
                p.style.top = y + 'px';
                p.style.animationDelay = Math.random() * 0.2 + 's';
                container.appendChild(p);
                setTimeout(() => p.remove(), 1000);
            }
            setTimeout(() => el.remove(), 1200);
            playSound('kneel');
        }, i * 550);
    }
}

function editStudent(studentId){
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    editingStudentId = studentId;
    document.getElementById('editModalTitle').textContent = '✏️ 编辑学生';
    document.getElementById('editName').value = student.name;
    document.getElementById('editGender').value = student.gender || '男';
    document.getElementById('editDuty').value = student.duty || '';
    document.getElementById('editLeave').checked = student.onLeave || false;
    document.getElementById('btnDelete').style.display = 'inline-block';
    pendingPetForEdit = student.animal || '🐱';
    document.getElementById('currentPetDisplay').textContent = pendingPetForEdit;
    document.getElementById('editModal').classList.add('show');
}
function addStudentAtIndex(gridIndex){
    editingStudentId = null;
    document.getElementById('editModalTitle').textContent = '➕ 添加学生';
    document.getElementById('editName').value = '';
    document.getElementById('editGender').value = '男';
    document.getElementById('editDuty').value = '';
    document.getElementById('editLeave').checked = false;
    document.getElementById('btnDelete').style.display = 'none';
    pendingPetForEdit = '🐱';
    document.getElementById('currentPetDisplay').textContent = '🐱';
    document.getElementById('editModal').dataset.targetIndex = gridIndex;
    document.getElementById('editModal').classList.add('show');
}
function saveStudent(){
    const name = document.getElementById('editName').value.trim();
    if (!name) { showFloatToast('⚠️ 姓名不能为空'); return; }
    const gender = document.getElementById('editGender').value || '男';
    const duty = document.getElementById('editDuty').value.trim();
    const onLeave = document.getElementById('editLeave').checked;
    const animal = pendingPetForEdit;
    if (editingStudentId !== null) {
        const student = students.find(s => s.id === editingStudentId);
        if (student) {
            student.name = name; student.gender = gender; student.duty = duty;
            student.onLeave = onLeave; student.animal = animal;
        }
    } else {
        const targetIndex = parseInt(document.getElementById('editModal').dataset.targetIndex);
        const newStudent = {
            id: Date.now(), name, gender, duty, onLeave, animal, petState: 'normal',
            groupName: '未分组', cats: CATEGORIES.map(()=>0),
            seatOrder: Math.min(Math.max(students.length + 1, 1), 9),
            quantTotal:0, personalTotal:0, gridIndex: targetIndex,
        };
        SUBJECTS.forEach(sub => newStudent['subject_'+sub] = 0);
        students.push(newStudent);
    }
    closeEditModal();
    updateSubjectRanks();
    updateRankingUIBar();
    render();
    showFloatToast('✅ 学生信息已保存');
}
function deleteStudent(){
    if (editingStudentId === null) return;
    if (!confirm('确定要删除该学生吗？此操作不可恢复。')) return;
    students = students.filter(s => s.id !== editingStudentId);
    closeEditModal();
    updateSubjectRanks();
    updateRankingUIBar();
    render();
    showFloatToast('🗑️ 学生已删除');
}
function closeEditModal(e){
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('editModal').classList.remove('show');
    editingStudentId = null;
}
function openPetSelectorInEdit(){
    const existing = document.getElementById('petModalPopup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.id = 'petModalPopup';
    popup.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:100000; background:#1a2a3a; padding:20px; border-radius:16px; border:1px solid #ffd700; max-width:90%; max-height:80vh; overflow-y:auto;';
    popup.innerHTML = `<h3 style="text-align:center;color:#ffd700;margin-bottom:12px;">🎉 选择宠物</h3><div class="pet-grid" id="petGridPopup"></div><div style="text-align:center;margin-top:12px;"><button onclick="document.getElementById('petModalPopup').remove()" class="toolbar-btn">关闭</button></div>`;
    popup.onclick = function(e){ if(e.target === popup) popup.remove(); };
    document.body.appendChild(popup);
    const grid = document.getElementById('petGridPopup');
    grid.innerHTML = '';
    ANIMALS.forEach(animal => {
        const btn = document.createElement('button');
        btn.textContent = animal;
        btn.style.cssText = 'background:rgba(255,255,255,0.06); border:2px solid rgba(255,255,255,0.1); border-radius:12px; font-size:24px; padding:6px 8px; cursor:pointer; color:#fff;';
        if (animal === pendingPetForEdit) btn.style.borderColor = '#ffd700';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            pendingPetForEdit = animal;
            document.getElementById('currentPetDisplay').textContent = animal;
            popup.remove();
        });
        grid.appendChild(btn);
    });
}

function openGroupPanel(groupId){
    const panel = document.getElementById('groupPanel');
    const wasOpen = panel.classList.contains('active');
    if (currentGroupId !== null && currentGroupId !== groupId) {
        if (chartQuant)   { chartQuant.dispose();   chartQuant = null; }
        if (chartSubject) { chartSubject.dispose(); chartSubject = null; }
        if (chartMember)  { chartMember.dispose();  chartMember = null; }
    }
    const g = groups.find(gr => gr.id === groupId);
    if (!g) return;
    currentGroupId = groupId;
    updateGroupPanel(g);
    bindGroupEvents(groupId);
    clearTimeout(panel._renderTimer);
    if (panel._onTransitionEnd) {
        panel.removeEventListener('transitionend', panel._onTransitionEnd);
        panel._onTransitionEnd = null;
    }
    if (wasOpen) {
        renderGroupRadar(groupId);
        return;
    }
    panel.classList.add('active');
    const doRender = () => {
        if (currentGroupId !== groupId) return;
        renderGroupRadar(groupId);
    };
    const onEnd = (e) => {
        if (e.target !== panel || e.propertyName !== 'transform') return;
        panel.removeEventListener('transitionend', onEnd);
        panel._onTransitionEnd = null;
        clearTimeout(panel._renderTimer);
        doRender();
    };
    panel._onTransitionEnd = onEnd;
    panel.addEventListener('transitionend', onEnd);
    panel._renderTimer = setTimeout(() => {
        if (panel._onTransitionEnd) {
            panel.removeEventListener('transitionend', panel._onTransitionEnd);
            panel._onTransitionEnd = null;
        }
        doRender();
    }, 450);
}

function updateGroupPanel(g){
    document.getElementById('panelGroupNameText').textContent = g.name;
    document.getElementById('panelGroupTotal').textContent = `总分：${g.groupTotal.toFixed(1)}`;
    document.getElementById('panelSloganInput').value = g.slogan || '';
}

function bindGroupEvents(groupId){
    const g = groups.find(gr => gr.id === groupId);
    if (!g) return;
    const renameBtn = document.getElementById('panelRenameBtn');
    renameBtn.onclick = function(e) {
        e.stopPropagation();
        const newName = prompt('请输入新的小组名称：', g.name);
        if (newName && newName.trim() !== '') renameGroup(groupId, newName.trim());
    };
    const sloganInput = document.getElementById('panelSloganInput');
    sloganInput.onchange = function() {
        const val = this.value.trim();
        groupSloganMap[g.name] = val;
        saveToLocal();
        const group = groups.find(gr => gr.id === groupId);
        if (group) group.slogan = val;
        showFloatToast('✅ 口号已保存');
    };
    document.getElementById('panelPrevBtn').onclick = function() {
        const idx = groups.findIndex(gr => gr.id === groupId);
        const newIdx = (idx - 1 + groups.length) % groups.length;
        openGroupPanel(groups[newIdx].id);
    };
    document.getElementById('panelNextBtn').onclick = function() {
        const idx = groups.findIndex(gr => gr.id === groupId);
        const newIdx = (idx + 1) % groups.length;
        openGroupPanel(groups[newIdx].id);
    };
}
function closeGroupPanel(){
    if (chartQuant) { chartQuant.dispose(); chartQuant = null; }
    if (chartSubject) { chartSubject.dispose(); chartSubject = null; }
    if (chartMember) { chartMember.dispose(); chartMember = null; }
    document.getElementById('groupPanel').classList.remove('active');
    currentGroupId = null;
}

function renameGroup(groupId, newName){
    const g = groups.find(gr => gr.id === groupId);
    if (!g) return;
    const oldName = g.name;
    g.members.forEach(m => { m.groupName = newName; });
    if (groupColorMap[oldName]) {
        groupColorMap[newName] = groupColorMap[oldName];
        delete groupColorMap[oldName];
    } else {
        const used = Object.values(groupColorMap);
        const avail = COLOR_PALETTE.filter(c => !used.includes(c));
        groupColorMap[newName] = avail.length ? avail[0] : COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    }
    if (groupSloganMap[oldName]) {
        groupSloganMap[newName] = groupSloganMap[oldName];
        delete groupSloganMap[oldName];
    }
    g.name = newName;
    groups = buildGroups();
    const newGroup = groups.find(gr => gr.name === newName);
    if (newGroup) {
        currentGroupId = newGroup.id;
        updateGroupPanel(newGroup);
        renderGroupRadar(newGroup.id);
        bindGroupEvents(newGroup.id);
    }
    render();
    showFloatToast(`✅ 小组已重命名：${oldName} → ${newName}`);
    speak(`小组更名为 ${newName}`);
}

function renderGroupRadar(groupId){
    const g = groups.find(gr => gr.id === groupId);
    if (!g) return;
    const active = g.activeMembers;
    if (active.length === 0) {
        showEmptyChart('chartQuant', '无活跃成员');
        showEmptyChart('chartSubject', '无活跃成员');
        showEmptyChart('chartMember', '无活跃成员');
        return;
    }
    const quantData = CATEGORIES.map((cat, idx) => {
        const sum = active.reduce((acc, m) => acc + (m.cats[idx] || 0), 0);
        return Math.round((sum / active.length) * 10) / 10;
    });
    const quantMax = Math.max(1, Math.max(...quantData) * 1.2);
    const subjectData = SUBJECTS.map(sub => {
        const sum = active.reduce((acc, m) => acc + (m['subject_'+sub] || 0), 0);
        return Math.round((sum / active.length) * 10) / 10;
    });
    const subjectMax = Math.max(1, Math.max(...subjectData) * 1.2);
    const memberNames = active.map(m => m.name);
    const memberScores = active.map(m => Math.round(m.personalTotal * 10) / 10);
    const memberMax = Math.max(1, Math.max(...memberScores) * 1.2);

    const quantOption = {
        radar: {
            indicator: CATEGORIES.map(cat => ({ name: cat, max: quantMax })),
            center: ['50%', '50%'], radius: '90%', shape: 'polygon',
            axisName: { gap: 0, position: 'inside', textStyle: { color: '#ccc', fontSize: 8 } },
            splitArea: { areaStyle: { color: ['rgba(255,215,0,0.02)'] } },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } }
        },
        series: [{
            type: 'radar',
            data: [{ value: quantData, name: '量化', areaStyle: { color: 'rgba(52,152,219,0.3)' }, lineStyle: { color: '#3498db', width: 2 } }],
            symbol: 'none', tooltip: { trigger: 'item' }
        }]
    };
    renderChart('chartQuant', quantOption);

    const subjectOption = {
        radar: {
            indicator: SUBJECTS.map(sub => ({ name: sub, max: subjectMax })),
            center: ['50%', '50%'], radius: '90%', shape: 'polygon',
            axisName: { gap: 0, position: 'inside', textStyle: { color: '#ccc', fontSize: 8 } },
            splitArea: { areaStyle: { color: ['rgba(46,204,113,0.02)'] } },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } }
        },
        series: [{
            type: 'radar',
            data: [{ value: subjectData, name: '成绩', areaStyle: { color: 'rgba(46,204,113,0.3)' }, lineStyle: { color: '#2ecc71', width: 2 } }],
            symbol: 'none', tooltip: { trigger: 'item' }
        }]
    };
    renderChart('chartSubject', subjectOption);

    const memberOption = {
        radar: {
            indicator: memberNames.map(name => ({ name: name, max: memberMax })),
            center: ['50%', '50%'], radius: '90%', shape: 'polygon',
            axisName: { gap: 0, position: 'inside', textStyle: { color: '#ccc', fontSize: 8 } },
            splitArea: { areaStyle: { color: ['rgba(241,196,15,0.02)'] } },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } }
        },
        series: [{
            type: 'radar',
            data: [{ value: memberScores, name: '总分', areaStyle: { color: 'rgba(241,196,15,0.3)' }, lineStyle: { color: '#f1c40f', width: 2 } }],
            symbol: 'none', tooltip: { trigger: 'item' }
        }]
    };
    renderChart('chartMember', memberOption);
}

function renderChart(containerId, option){
    const dom = document.getElementById(containerId);
    if (!dom) return;
    let chart = null;
    if (containerId === 'chartQuant') chart = chartQuant;
    else if (containerId === 'chartSubject') chart = chartSubject;
    else if (containerId === 'chartMember') chart = chartMember;
    if (!chart) {
        chart = echarts.init(dom);
        if (containerId === 'chartQuant') chartQuant = chart;
        else if (containerId === 'chartSubject') chartSubject = chart;
        else if (containerId === 'chartMember') chartMember = chart;
        window.addEventListener('resize', () => chart.resize());
    }
    chart.setOption(option, true);
    setTimeout(() => chart.resize(), 50);
    setTimeout(() => chart.resize(), 300);
}

function showEmptyChart(containerId, message){
    const dom = document.getElementById(containerId);
    if (!dom) return;
    dom.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#888;font-size:14px;">${message}</div>`;
    let chart = null;
    if (containerId === 'chartQuant') { chart = chartQuant; chartQuant = null; }
    else if (containerId === 'chartSubject') { chart = chartSubject; chartSubject = null; }
    else if (containerId === 'chartMember') { chart = chartMember; chartMember = null; }
    if (chart) { chart.dispose(); }
}

function updateSidePanels(studentId, keepDelta = false) {
    const student = students.find(s => s.id === studentId);
    if (!student || student.onLeave) return hideSidePanels();
    if (activeStudentId !== null && activeStudentId !== studentId) {
        speakSummaryForCurrent();
        studentScoreDelta = {};
        subjectScoreDelta = {};
        CATEGORIES.forEach((_, idx) => { studentScoreDelta[idx] = 0; });
    }
    document.querySelectorAll('.seat.active-student').forEach(s => s.classList.remove('active-student'));
    activeStudentId = studentId;
    const currentSeat = document.querySelector(`.seat[data-student-id="${studentId}"]`);
    if (currentSeat) currentSeat.classList.add('active-student');
    if (!studentScoreDelta) {
        studentScoreDelta = {};
        CATEGORIES.forEach((_, idx) => { studentScoreDelta[idx] = 0; });
    }
    if (!subjectScoreDelta) {
        subjectScoreDelta = {};
        SUBJECTS.forEach(sub => { subjectScoreDelta[sub] = 0; });
    }
    const leftList = document.getElementById('leftPanelList');
    leftList.innerHTML = '';
    const totalQuant = student.cats.reduce((a, b) => a + b, 0);
    const totalQuantDiv = document.createElement('div');
    totalQuantDiv.className = 'panel-item';
    totalQuantDiv.style.cssText = `background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 8px; margin-bottom: 4px; padding: 6px 10px; font-weight: 700; font-size: 14px; color: #ffd700; cursor: default; pointer-events: none;`;
    totalQuantDiv.innerHTML = `<span>汇总:</span><span style="font-size:16px;">${totalQuant.toFixed(1)}</span>`;
    leftList.appendChild(totalQuantDiv);
    CATEGORIES.forEach((cat, idx) => {
        const score = student.cats[idx] || 0;
        const div = document.createElement('div');
        div.className = 'panel-item';
        div.innerHTML = `
            <span class="item-icon" title="筛选${cat}冠军">${CAT_ICONS[idx]}</span>
            <span class="item-score" title="加减分">${score.toFixed(1)}</span>
        `;
        div.querySelector('.item-icon').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleCategory(idx);
        });
        div.querySelector('.item-score').addEventListener('click', function(e) {
            e.stopPropagation();
            const delta = ringModeAdd ? 1 : -1;
            if (student.cats[0] < 0 && idx !== 0 && delta > 0) {
                showFloatToast(`🔒 安全分为负，只能给安全项加分！其他项只能减分。`);
                return;
            }
            student.cats[idx] += delta;
            saveDailySnapshot();
            if (!studentScoreDelta[idx]) studentScoreDelta[idx] = 0;
            studentScoreDelta[idx] += delta;
            recalcAll();
            updateSidePanels(studentId, true);
            const seat = document.querySelector(`.seat[data-student-id='${student.id}']`);
            if (seat) {
                seat.querySelector('.score').textContent = student.personalTotal.toFixed(1);
                seat.classList.remove('flash'); void seat.offsetWidth; seat.classList.add('flash');
                const rect = seat.getBoundingClientRect();
                if (delta > 0) launchRocket(rect.left+rect.width/2, rect.top, CAT_COLORS[idx]);
                else launchCry(rect.left+rect.width/2, rect.top);
                if (student.cats[0] < 0) seat.classList.add('locked');
                else seat.classList.remove('locked');
            }
            showFloatToast(`${student.name} ${delta>0?'+':''}${delta} ${CATEGORIES[idx]}`);
            if (currentGroupId !== null) {
                const g = groups.find(gr => gr.id === currentGroupId);
                if (g && g.activeMembers.some(m => m.id === student.id)) {
                    renderGroupRadar(currentGroupId);
                }
            }
            render();
            saveToLocal();
        });
        leftList.appendChild(div);
    });

    const rightList = document.getElementById('rightPanelList');
    rightList.innerHTML = '';
    let totalSubject = 0;
    SUBJECTS.forEach(sub => { totalSubject += student['subject_'+sub] || 0; });
    const totalSubjectDiv = document.createElement('div');
    totalSubjectDiv.className = 'panel-item';
    totalSubjectDiv.style.cssText = `background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 8px; margin-bottom: 4px; padding: 6px 10px; font-weight: 700; font-size: 14px; color: #ffd700; cursor: default; pointer-events: none;`;
    totalSubjectDiv.innerHTML = `<span>汇总:</span><span style="font-size:16px;">${totalSubject.toFixed(1)}</span>`;
    rightList.appendChild(totalSubjectDiv);
    SUBJECTS.forEach(sub => {
        const key = 'subject_' + sub;
        const score = student[key] || 0;
        const div = document.createElement('div');
        div.className = 'panel-item sub-item';
        div.innerHTML = `
            <span class="item-icon" title="筛选${sub}冠军">${SUB_ABBR[sub]}</span>
            <input type="number" value="${score.toFixed(1)}" onclick="event.stopPropagation();" onchange="updateSubjectScore(${student.id}, '${sub}', this.value, this.dataset.oldValue)" data-old-value="${score}">
        `;
        div.querySelector('.item-icon').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleSubject(sub);
        });
        rightList.appendChild(div);
    });
    document.getElementById('leftPanel').classList.add('show');
    document.getElementById('rightPanel').classList.add('show');
}

function speakSummaryForCurrent() {
    if (!activeStudentId) return;
    const student = students.find(s => s.id === activeStudentId);
    if (!student) return;
    const parts = [];
    CATEGORIES.forEach((cat, idx) => {
        const delta = studentScoreDelta[idx] || 0;
        if (delta !== 0) parts.push(`${delta>0?'加':'减'}${Math.abs(delta).toFixed(1)}分 ${cat}`);
    });
    SUBJECTS.forEach(sub => {
        const delta = subjectScoreDelta[sub] || 0;
        if (delta !== 0) parts.push(`${sub} ${delta>0?'加':'减'}${Math.abs(delta).toFixed(1)}分`);
    });
    if (parts.length > 0) speak(`${student.name} ${parts.join('、')}`);
}

function hideSidePanels() {
    if (activeStudentId !== null) speakSummaryForCurrent();
    if (multiSelectMode && !multiPanelsHidden) {
        speakMultiSelectSummary();
        multiSelectDeltas = {};
        multiSelectSubjectDeltas = {};
    }
    document.getElementById('leftPanel').classList.remove('show');
    document.getElementById('rightPanel').classList.remove('show');
    document.querySelectorAll('.seat.active-student').forEach(s => s.classList.remove('active-student'));
    activeStudentId = null;
    studentScoreDelta = {};
    subjectScoreDelta = {};
    if (multiSelectMode) multiPanelsHidden = true;
}

function fmtDeltaNum(v) {
    const a = Math.abs(v);
    return a % 1 === 0 ? a.toString() : a.toFixed(1);
}

function speakMultiSelectSummary() {
    const n = selectedStudentIds.size;
    if (n === 0) return;
    const parts = [];
    CATEGORIES.forEach((cat, idx) => {
        const d = multiSelectDeltas[idx] || 0;
        if (d !== 0) parts.push(cat + '各' + (d > 0 ? '加' : '减') + fmtDeltaNum(d) + '分');
    });
    SUBJECTS.forEach(sub => {
        const d = multiSelectSubjectDeltas[sub] || 0;
        if (d !== 0) parts.push(sub + '各' + (d > 0 ? '加' : '减') + fmtDeltaNum(d) + '分');
    });
    if (parts.length === 0) return;
    speak('已对 ' + n + ' 人调整：' + parts.join('、'));
}

function updateSubjectScore(studentId, sub, value, oldValue) {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const key = 'subject_' + sub;
    const newVal = parseFloat(value) || 0;
    const oldVal = parseFloat(oldValue) || 0;
    student[key] = newVal;
    saveDailySnapshot();
    if (!subjectScoreDelta[sub]) subjectScoreDelta[sub] = 0;
    subjectScoreDelta[sub] += (newVal - oldVal);
    recalcAll();
    updateSubjectRanks();
    render();
    showFloatToast(`${student.name} ${sub} ${oldVal.toFixed(1)}→${newVal.toFixed(1)}`);
    saveToLocal();
}

document.getElementById('leftModeBtn').addEventListener('click', function(e) {
    e.stopPropagation();
    ringModeAdd = !ringModeAdd;
    this.textContent = ringModeAdd ? '➕ 加分' : '➖ 减分';
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('.seat') && !e.target.closest('.side-panel') && !e.target.closest('#editModal') && !e.target.closest('#petModalPopup') && !e.target.closest('.group-panel') && !e.target.closest('#subjectModeHint') && !e.target.closest('#rankingToggleBtn')) {
        hideSidePanels();
    }
});

function computeChampions(){
    const champ = new Set();
    activeCategories.forEach(idx => {
        let maxV = -Infinity;
        students.forEach(s => { if(!s.onLeave && s.cats[idx]>maxV) maxV=s.cats[idx]; });
        if(maxV > 0) students.forEach(s => { if(!s.onLeave && s.cats[idx]===maxV) champ.add(s.id); });
    });
    activeSubjects.forEach(sub => {
        const key = 'subject_'+sub;
        let maxV = -Infinity;
        students.forEach(s => { if(!s.onLeave) { const v = s[key]||0; if(v>maxV) maxV=v; } });
        if(maxV > 0) students.forEach(s => { if(!s.onLeave && (s[key]||0)===maxV) champ.add(s.id); });
    });
    return champ;
}

function renderGrid(topScoreStudents, topGroupIds, championStudents){
    const grid = document.getElementById('classroomGrid');
    grid.innerHTML = '';
    const total = COLS * ROWS;
    const posMap = {};
    students.forEach(s => { if(s.gridIndex>=0 && s.gridIndex<total) posMap[s.gridIndex]=s.id; });
    let nextFree = 0;
    students.forEach(s => { if(s.gridIndex<0||s.gridIndex>=total) { while(nextFree<total && posMap[nextFree]!==undefined) nextFree++; if(nextFree<total) { s.gridIndex=nextFree; posMap[nextFree]=s.id; nextFree++; } } });
    const col = podiumStartIndex % COLS;
    if(col > COLS - PODIUM_WIDTH) podiumStartIndex = podiumStartIndex - (col - (COLS - PODIUM_WIDTH));
    const firstSeatMap = {};
    groups.forEach(g => { let minI=Infinity; g.activeMembers.forEach(m=>{ if(m.gridIndex<minI) minI=m.gridIndex; }); if(minI<Infinity) firstSeatMap[g.name]=minI; });

    for (let idx=0; idx<total; idx++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = idx;
        if (idx === podiumStartIndex) {
            cell.style.overflow = 'visible';
            const podium = document.createElement('div'); podium.className = 'podium'; podium.textContent = '🏫 讲台'; podium.draggable = true;
            podium.addEventListener('dragstart', e => { isDraggingPodium=true; e.dataTransfer.setData('text/plain','podium'); });
            podium.addEventListener('dragend', e => { isDraggingPodium=false; });
            cell.appendChild(podium);
            grid.appendChild(cell);
            const nc = document.createElement('div'); nc.className='cell'; nc.dataset.index=idx+1; grid.appendChild(nc);
            idx++;
            continue;
        }
        const sid = posMap[idx];
        if (sid !== undefined) {
            const student = students.find(s=>s.id===sid);
            if (student) {
                ensureSubjectFields(student);
                const seat = document.createElement('div');
                seat.className = 'seat' + (selectedStudentIds.has(student.id)?' selected':'');
                seat.dataset.studentId = student.id;
                seat.dataset.groupName = student.groupName;
                seat.draggable = true;
                seat.style.borderColor = getGroupColor(student.groupName);
                seat.style.backgroundColor = `rgba(${hexToRgb(getGroupColor(student.groupName))}, 0.2)`;
                const genderIcon = student.gender === '女' ? '♀' : (student.gender === '男' ? '♂' : '');
                const genderClass = student.gender === '女' ? 'female' : 'male';
                seat.innerHTML = `<div class="name">${student.name}${genderIcon ? `<span class="gender-mini ${genderClass}">${genderIcon}</span>` : ''}</div><div class="score">${student.personalTotal.toFixed(1)}</div>`;
                if (student.cats[0] < 0) seat.classList.add('locked');
                if (student.onLeave) seat.classList.add('leave');
                if (topScoreStudents.has(student.id)) seat.classList.add('top-score');
                const displayOrder = subjectRanks[student.id] || 0;
                if (displayOrder >= 1 && displayOrder <= 9) {
                    const badge = document.createElement('span');
                    badge.className = `order-badge color-${displayOrder}`;
                    badge.textContent = displayOrder;
                    if (currentSubject) badge.title = `${currentSubject}排号 ${displayOrder}`;
                    else badge.title = `综合总分排号 ${displayOrder}`;
                    seat.appendChild(badge);
                }
                if (student.duty) {
                    const d = document.createElement('span'); d.className='duty-tag'; d.textContent=student.duty; seat.appendChild(d);
                }
                if (championStudents.has(student.id)) {
                    const catIcons = [], subIcons = [];
                    activeCategories.forEach(i => { 
                        const maxV = Math.max(...students.map(s=>s.cats[i]||0)); 
                        if(maxV > 0 && (student.cats[i]||0)===maxV) catIcons.push(CAT_ICONS[i]); 
                    });
                    activeSubjects.forEach(sub => { 
                        const key='subject_'+sub; 
                        const maxV = Math.max(...students.map(s=>s[key]||0)); 
                        if(maxV > 0 && (student[key]||0)===maxV) subIcons.push(SUB_ABBR[sub]); 
                    });
                    if (catIcons.length) { const b=document.createElement('span'); b.className='champion-icon cat-champ'; b.textContent=catIcons[0]; seat.appendChild(b); }
                    if (subIcons.length) { const b=document.createElement('span'); b.className='champion-icon sub-champ'; b.textContent=subIcons[0]; seat.appendChild(b); }
                }
                const group = groups.find(g=>g.name===student.groupName);
                if(group && firstSeatMap[group.name]===student.gridIndex) {
                    const label = document.createElement('div'); label.className='group-label-float' + (topGroupIds.has(group.id)?' top-group-label':'');
                    label.innerHTML = `<span class="gname">${group.name}</span> <span class="gtotal">⭐${group.groupTotal.toFixed(1)}</span>`;
                    label.style.pointerEvents='auto';
                    label.addEventListener('click', e => { e.stopPropagation(); openGroupPanel(group.id); });
                    seat.appendChild(label);
                }
                seat.addEventListener('dragstart', function(e) { dragSelectedIds = selectedStudentIds.size>1? Array.from(selectedStudentIds):[parseInt(this.dataset.studentId)]; });
                seat.addEventListener('dragend', function() { dragSelectedIds=[]; });
                if (!student.onLeave) {
                    seat.addEventListener('click', function(e) {
                        const id = parseInt(this.dataset.studentId);
                        if (multiSelectMode || e.ctrlKey || e.metaKey) { toggleSelect(id); return; }
                        if (activeStudentId === id) { hideSidePanels(); }
                        else { updateSidePanels(id); }
                    });
                }
                seat.addEventListener('dblclick', function(e) { e.preventDefault(); editStudent(parseInt(this.dataset.studentId)); });
                cell.appendChild(seat);
            }
        } else {
            cell.addEventListener('dblclick', function(e) { e.preventDefault(); addStudentAtIndex(parseInt(this.dataset.index)); });
        }
        cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave', e => { cell.classList.remove('drag-over'); });
        cell.addEventListener('drop', function(e) {
            e.preventDefault(); cell.classList.remove('drag-over');
            const ti = parseInt(this.dataset.index);
            const data = e.dataTransfer.getData('text/plain');
            if (data === 'podium') handlePodiumDrop(ti);
            else { const ids = dragSelectedIds.length>0? dragSelectedIds:[parseInt(data)]; handleMultiDrop(ids, ti); }
        });
        grid.appendChild(cell);
    }
}

function hexToRgb(hex) { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? `${parseInt(r[1],16)},${parseInt(r[2],16)},${parseInt(r[3],16)}` : '255,255,255'; }

function handleMultiDrop(ids, targetIndex) {
    if (ids.length === 0) return;
    const studentsToMove = ids.map(id => students.find(s => s.id === id)).filter(s => s);
    if (studentsToMove.length === 0) return;
    studentsToMove.sort((a,b)=>a.gridIndex-b.gridIndex);
    const firstIdx = studentsToMove[0].gridIndex;
    const offset = targetIndex - firstIdx;
    const targetIndices = studentsToMove.map(s => s.gridIndex + offset);
    const total = COLS * ROWS;
    for (let idx of targetIndices) { if (idx < 0 || idx >= total) { showFloatToast('⚠️ 目标位置超出教室范围'); return; } if (idx === podiumStartIndex || idx === podiumStartIndex + 1) { showFloatToast('⚠️ 目标位置有讲台，不能放置'); return; } const occupied = students.some(s => !studentsToMove.includes(s) && s.gridIndex === idx); if (occupied) { showFloatToast('⚠️ 目标位置已被其他座位占用'); return; } }
    studentsToMove.forEach((s,i)=>{ s.gridIndex = targetIndices[i]; });
    render();
    showFloatToast(`✅ 移动了 ${studentsToMove.length} 个座位`);
}

function handlePodiumDrop(targetIndex) { const total = COLS * ROWS; if (targetIndex < 0 || targetIndex >= total) return; const col = targetIndex % COLS; if (col > COLS - PODIUM_WIDTH) return; const hasSeat = (idx) => students.some(s => s.gridIndex === idx); if (hasSeat(targetIndex) || hasSeat(targetIndex + 1)) return; if (targetIndex === podiumStartIndex) return; podiumStartIndex = targetIndex; render(); showFloatToast('🏫 讲台已移动'); }

function render() {
    recalcAll(); 
    groups = buildGroups();
    students.forEach(s => { if(!s.animal) s.animal='🐱'; if(!s.petState) s.petState='normal'; });
    const champ = computeChampions();
    const topScore = new Set(); const topGroup = new Set();
    groups.forEach(g => { let maxS=-Infinity; g.activeMembers.forEach(m=>{ if(m.personalTotal>maxS) maxS=m.personalTotal; }); if(maxS>0) g.activeMembers.forEach(m=>{ if(m.personalTotal===maxS) topScore.add(m.id); }); });
    let maxGT=-Infinity, hasPos=false; groups.forEach(g=>{ if(g.groupTotal>0) hasPos=true; if(g.groupTotal>maxGT) maxGT=g.groupTotal; }); if(hasPos) groups.forEach(g=>{ if(g.groupTotal===maxGT) topGroup.add(g.id); });
    renderGrid(topScore, topGroup, champ);
    updateStatusBar();
    if (currentGroupId !== null) {
        const g = groups.find(gr => gr.id === currentGroupId);
        if (g) { updateGroupPanel(g); renderGroupRadar(currentGroupId); }
        else { closeGroupPanel(); }
    }
    if (multiSelectMode) {
        if (selectedStudentIds.size > 0 && !multiPanelsHidden) {
            updateMultiSelectPanels();
        } else if (selectedStudentIds.size === 0) {
            document.getElementById('leftPanel').classList.remove('show');
            document.getElementById('rightPanel').classList.remove('show');
        }
    } else if (activeStudentId) {
        updateSidePanels(activeStudentId);
    }
    saveToLocal();
}

function updateStatusBar() { 
    const countEl = document.getElementById('studentCount');
    const groupEl = document.getElementById('groupCount');
    if (countEl) countEl.textContent = students.length;
    if (groupEl) groupEl.textContent = groups.length;
}
function toggleSelect(studentId) {
    if (selectedStudentIds.has(studentId)) selectedStudentIds.delete(studentId);
    else selectedStudentIds.add(studentId);
    multiPanelsHidden = false;
    render();
}
function clearSelection() { selectedStudentIds.clear(); render(); }

function toggleMultiSelectMode() {
    const wasOn = multiSelectMode;
    multiSelectMode = !multiSelectMode;
    const btn = document.getElementById('multiSelectBtn');
    if (btn) {
        btn.textContent = multiSelectMode ? '❌ 取消多选' : '☑️ 多选';
        btn.style.background = multiSelectMode ? 'rgba(46,204,113,0.3)' : '';
        btn.style.borderColor = multiSelectMode ? '#2ecc71' : '';
        btn.style.color = multiSelectMode ? '#fff' : '';
    }
    if (multiSelectMode) {
        if (activeStudentId !== null) {
            document.querySelectorAll('.seat.active-student').forEach(s => s.classList.remove('active-student'));
            activeStudentId = null;
        }
        selectedStudentIds.clear();
        multiPanelsHidden = false;
        multiSelectDeltas = {};
        multiSelectSubjectDeltas = {};
        render();
        showFloatToast('✅ 多选模式已开启，点击学生进行选择');
    } else {
        if (wasOn && !multiPanelsHidden) {
            speakMultiSelectSummary();
        }
        selectedStudentIds.clear();
        multiPanelsHidden = false;
        multiSelectDeltas = {};
        multiSelectSubjectDeltas = {};
        hideSidePanels();
        render();
        showFloatToast('✅ 已退出多选模式');
    }
}

function updateMultiSelectPanels() {
    const ids = Array.from(selectedStudentIds);
    const selected = students.filter(s => ids.includes(s.id) && !s.onLeave);
    if (selected.length === 0) { hideSidePanels(); return; }
    const n = selected.length;

    const leftList = document.getElementById('leftPanelList');
    leftList.innerHTML = '';
    const totalQuantAvg = selected.reduce((sum, s) => {
        const t = (s.cats || []).reduce((a, b) => a + (parseFloat(b) || 0), 0);
        return sum + t;
    }, 0) / n;
    const totalQuantDiv = document.createElement('div');
    totalQuantDiv.className = 'panel-item';
    totalQuantDiv.style.cssText = 'background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 8px; margin-bottom: 4px; padding: 6px 10px; font-weight: 700; font-size: 14px; color: #ffd700; cursor: default; pointer-events: none;';
    totalQuantDiv.innerHTML = '<span>汇总:</span><span style="font-size:16px;">' + totalQuantAvg.toFixed(1) + '</span>';
    leftList.appendChild(totalQuantDiv);

    CATEGORIES.forEach((cat, idx) => {
        const avg = selected.reduce((sum, s) => sum + (parseFloat((s.cats || [])[idx]) || 0), 0) / n;
        const div = document.createElement('div');
        div.className = 'panel-item';
        div.innerHTML = '<span class="item-icon" title="筛选' + cat + '冠军">' + CAT_ICONS[idx] + '</span>' +
            '<span class="item-score" title="点击' + (ringModeAdd ? '加' : '减') + '分（所有人）">' + avg.toFixed(1) + '</span>';
        div.querySelector('.item-icon').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleCategory(idx);
        });
        div.querySelector('.item-score').addEventListener('click', function(e) {
            e.stopPropagation();
            multiSelectAdjust(idx, ringModeAdd ? 1 : -1);
        });
        leftList.appendChild(div);
    });

    const rightList = document.getElementById('rightPanelList');
    rightList.innerHTML = '';
    const totalSubjectAvg = selected.reduce((sum, s) => {
        let sub = 0;
        SUBJECTS.forEach(k => sub += parseFloat(s['subject_' + k]) || 0);
        return sum + sub;
    }, 0) / n;
    const totalSubjectDiv = document.createElement('div');
    totalSubjectDiv.className = 'panel-item';
    totalSubjectDiv.style.cssText = 'background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); border-radius: 8px; margin-bottom: 4px; padding: 6px 10px; font-weight: 700; font-size: 14px; color: #ffd700; cursor: default; pointer-events: none;';
    totalSubjectDiv.innerHTML = '<span>汇总:</span><span style="font-size:16px;">' + totalSubjectAvg.toFixed(1) + '</span>';
    rightList.appendChild(totalSubjectDiv);

    SUBJECTS.forEach(sub => {
        const avg = selected.reduce((sum, s) => sum + (parseFloat(s['subject_' + sub]) || 0), 0) / n;
        const div = document.createElement('div');
        div.className = 'panel-item sub-item';
        div.innerHTML = '<span class="item-icon" title="筛选' + sub + '冠军">' + SUB_ABBR[sub] + '</span>' +
            '<input type="number" step="any" value="' + avg.toFixed(1) + '" data-sub="' + sub + '" data-old-avg="' + avg + '">';
        div.querySelector('.item-icon').addEventListener('click', function(e) {
            e.stopPropagation();
            toggleSubject(sub);
        });
        div.querySelector('input').addEventListener('change', function(e) {
            e.stopPropagation();
            multiSelectAdjustSubject(this.dataset.sub, this.value, this.dataset.oldAvg);
        });
        rightList.appendChild(div);
    });
    document.getElementById('leftPanel').classList.add('show');
    document.getElementById('rightPanel').classList.add('show');
}

function multiSelectAdjust(dimIdx, delta) {
    const ids = Array.from(selectedStudentIds);
    const selected = students.filter(s => ids.includes(s.id) && !s.onLeave);
    if (selected.length === 0) return;
    let applied = 0, blocked = 0;
    selected.forEach(s => {
        if (!s.cats) s.cats = CATEGORIES.map(() => 0);
        if (delta > 0 && s.cats[0] < 0 && dimIdx !== 0) { blocked++; return; }
        s.cats[dimIdx] = (parseFloat(s.cats[dimIdx]) || 0) + delta;
        applied++;
    });
    if (applied > 0) {
        if (!multiSelectDeltas[dimIdx]) multiSelectDeltas[dimIdx] = 0;
        multiSelectDeltas[dimIdx] += delta;
    }
    saveDailySnapshot();
    recalcAll();
    saveToLocal();
    render();
    if (applied > 0) showFloatToast('已对 ' + applied + ' 人 ' + (delta > 0 ? '+' : '') + delta + ' ' + CATEGORIES[dimIdx]);
    if (blocked > 0) setTimeout(() => showFloatToast('⚠️ ' + blocked + ' 人安全分为负，已跳过'), 400);
}

function multiSelectAdjustSubject(sub, newAvgStr, oldAvgStr) {
    const ids = Array.from(selectedStudentIds);
    const selected = students.filter(s => ids.includes(s.id) && !s.onLeave);
    if (selected.length === 0) return;
    const newAvg = parseFloat(newAvgStr);
    const oldAvg = parseFloat(oldAvgStr);
    if (isNaN(newAvg) || isNaN(oldAvg)) return;
    const delta = newAvg - oldAvg;
    if (Math.abs(delta) < 0.001) return;
    const key = 'subject_' + sub;
    selected.forEach(s => { s[key] = (parseFloat(s[key]) || 0) + delta; });
    if (!multiSelectSubjectDeltas[sub]) multiSelectSubjectDeltas[sub] = 0;
    multiSelectSubjectDeltas[sub] += delta;
    saveDailySnapshot();
    recalcAll();
    updateSubjectRanks();
    saveToLocal();
    render();
    showFloatToast('已对 ' + selected.length + ' 人 ' + sub + ' ' + (delta > 0 ? '+' : '') + delta.toFixed(1));
}

function createGroup() {
    if (selectedStudentIds.size < 2) {
        showFloatToast('⚠️ 请按住 Ctrl 点击至少选择两个学生');
        return;
    }
    const formalGroups = groups.filter(g => g.name !== '未分组');
    const defaultName = `第${formalGroups.length + 1}组`;
    const groupName = prompt('请输入小组名称：', defaultName);
    if (!groupName || groupName.trim() === '') return;
    const newGroupName = groupName.trim();
    const selected = students.filter(s => selectedStudentIds.has(s.id));
    selected.forEach(s => { s.groupName = newGroupName; });
    if (!groupColorMap[newGroupName]) {
        const usedColors = Object.values(groupColorMap);
        const available = COLOR_PALETTE.filter(c => !usedColors.includes(c));
        groupColorMap[newGroupName] = available.length > 0 ? available[0] : COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
    }
    selectedStudentIds.clear();
    render();
    showFloatToast(`✅ 已创建小组：${newGroupName}（${selected.length}人`);
    speak(`创建了小组 ${newGroupName}，共 ${selected.length} 人`);
}
function resetGroups(){
    const groupNames = [...new Set(students.map(s => s.groupName))];
    const grouped = {};
    students.forEach(s => { const key = s.groupName || '未分组'; if (!grouped[key]) grouped[key] = []; grouped[key].push(s); });
    let newStudents = [];
    Object.keys(grouped).sort().forEach(key => { const members = grouped[key]; members.sort((a, b) => a.seatOrder - b.seatOrder); newStudents = newStudents.concat(members); });
    students = newStudents;
    students.forEach((s, idx) => { s.gridIndex = idx; });
    const allGroups = [...new Set(students.map(s => s.groupName || '未分组'))];
    const usedColors = Object.values(groupColorMap);
    allGroups.forEach(name => { if (!groupColorMap[name]) { const avail = COLOR_PALETTE.filter(c => !usedColors.includes(c)); groupColorMap[name] = avail.length > 0 ? avail[0] : COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]; } });
    selectedStudentIds.clear();
    render();
    showFloatToast('🔄 已重置分组');
}

function importCSV(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) { alert('CSV格式错误：至少需要标题行和数据行'); return; }
        const headers = lines[0].split(',').map(h => h.trim());
        const idxMap = {
            seatIndex: headers.findIndex(h => h.includes('座位索引') || h.includes('gridIndex')),
            group: headers.findIndex(h => h.includes('组') || h.includes('学期分组')),
            name: headers.findIndex(h => h.includes('姓名') || (h.includes('名') && !h.includes('性别'))),
            order: headers.findIndex(h => h.includes('月考排号')),
            week: headers.findIndex(h => h.includes('周测')),
            gender: headers.findIndex(h => h.includes('性别')),
            duty: headers.findIndex(h => h.includes('职务')),
            animal: headers.findIndex(h => h.includes('宠物') && !h.includes('状态')),
            leave: headers.findIndex(h => h.includes('休假')),
        };
        const catIndices = CATEGORIES.map(cat => headers.findIndex(h => h.includes(cat)));
        const subjectIndices = {}; SUBJECTS.forEach(sub => { const idx = headers.findIndex(h => h.includes(sub)); if (idx !== -1) subjectIndices[sub] = idx; });
        const newStudents = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());
            if (cols.length === 0) continue;
            const name = idxMap.name >= 0 ? cols[idxMap.name] : '';
            if (!name || name.trim() === '') continue;
            const group = idxMap.group >= 0 ? cols[idxMap.group] || '未分组' : '未分组';
            const order = idxMap.order >= 0 ? parseInt(cols[idxMap.order]) || i : i;
            const week = idxMap.week >= 0 ? parseFloat(cols[idxMap.week]) || 0 : 0;
            const cats = CATEGORIES.map((_, ci) => { const idx = catIndices[ci]; return (idx >= 0 && idx < cols.length) ? parseFloat(cols[idx]) || 0 : 0; });
            const genderRaw = (idxMap.gender >= 0 && cols[idxMap.gender]) ? cols[idxMap.gender].trim() : '';
            const gender = (genderRaw === '女') ? '女' : '男';
            const duty = (idxMap.duty >= 0 && cols[idxMap.duty]) ? cols[idxMap.duty].trim() : '';
            const animal = (idxMap.animal >= 0 && cols[idxMap.animal]) ? cols[idxMap.animal].trim() : '🐱';
            const onLeave = (idxMap.leave >= 0 && cols[idxMap.leave]) ? (cols[idxMap.leave].trim() === '是') : false;
            const newStudent = {
                id: Date.now() + i, name, gender, groupName: group,
                seatOrder: Math.min(Math.max(order, 1), 6), cats, weekTest: week,
                quantTotal: 0, personalTotal: 0,
                gridIndex: (idxMap.seatIndex >= 0 && !isNaN(parseInt(cols[idxMap.seatIndex])) ? parseInt(cols[idxMap.seatIndex]) : (i-1)),
                animal, petState: 'normal', onLeave, duty
            };
            SUBJECTS.forEach(sub => { newStudent['subject_'+sub] = (subjectIndices[sub] >= 0 && subjectIndices[sub] < cols.length) ? parseFloat(cols[subjectIndices[sub]]) || 0 : 0; });
            newStudents.push(newStudent);
        }
        if (newStudents.length === 0) { alert('未解析到有效数据'); return; }
        const groupNames = [...new Set(newStudents.map(s => s.groupName || '未分组'))];
        const shuffled = [...COLOR_PALETTE]; for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
        const newColorMap = {}; groupNames.forEach((name, idx) => { newColorMap[name] = shuffled[idx % shuffled.length]; });
        groupColorMap = newColorMap;
        groupNames.forEach(name => { if (!groupSloganMap[name]) groupSloganMap[name] = ''; });
        if (newStudents.some(s => s.gridIndex >= 0)) { const sorted = newStudents.sort((a, b) => a.gridIndex - b.gridIndex); const usedIndices = new Set(); sorted.forEach((s, idx) => { if (usedIndices.has(s.gridIndex)) { let freeIdx = sorted.length; while (usedIndices.has(freeIdx)) freeIdx++; s.gridIndex = freeIdx; } usedIndices.add(s.gridIndex); }); students = sorted; }
        else { const grouped = {}; newStudents.forEach(s => { const key = s.groupName || '未分组'; if (!grouped[key]) grouped[key] = []; grouped[key].push(s); }); let sortedStudents = []; Object.keys(grouped).sort().forEach(key => { const members = grouped[key]; members.sort((a, b) => a.seatOrder - b.seatOrder); sortedStudents = sortedStudents.concat(members); }); sortedStudents.forEach((s, idx) => { s.gridIndex = idx; }); students = sortedStudents; }

        const total = COLS * ROWS;
        const podium1 = podiumStartIndex;
        const podium2 = podiumStartIndex + 1;
        const used = new Set();
        students.forEach(s => {
            const idx = s.gridIndex;
            const row = Math.floor(idx / COLS);
            const col = idx % COLS;
            const isEdge = (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1);
            const isPodium = (idx === podium1 || idx === podium2);
            if (!isEdge && !isPodium) used.add(idx);
        });
        students.forEach(s => {
            const idx = s.gridIndex;
            const row = Math.floor(idx / COLS);
            const col = idx % COLS;
            const isEdge = (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1);
            const isPodium = (idx === podium1 || idx === podium2);
            if (isEdge || isPodium) {
                let newIdx = -1;
                for (let i = 0; i < total; i++) {
                    const r = Math.floor(i / COLS);
                    const c = i % COLS;
                    const edge = (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1);
                    const pod = (i === podium1 || i === podium2);
                    if (!edge && !pod && !used.has(i)) { newIdx = i; break; }
                }
                if (newIdx !== -1) { used.delete(idx); s.gridIndex = newIdx; used.add(newIdx); }
            }
        });
        selectedStudentIds.clear();
        updateSubjectRanks();
        updateRankingUIBar();
        render();
        saveToLocal();
        alert(`✅ 成功导入 ${students.length} 名学生`);
        event.target.value = '';
    };
    reader.readAsText(file);
}

function exportData() {
    const week = document.getElementById('weekInput').value || '1';
    const classId = CURRENT_CLASS || 'unknown';
    let className = classId;
    try {
        const raw = localStorage.getItem('homepage_classes_data');
        if (raw) {
            const data = JSON.parse(raw);
            const found = data.classes.find(c => c.id === classId);
            if (found && found.name) className = found.name;
        }
    } catch(e) {}
    const headers = ['姓名','性别','学期分组','座位索引','班级职务','宠物','宠物状态','休假', ...CATEGORIES, ...SUBJECTS.map(s=>'学科_'+s)];
    const rows = students.map(s => {
        const row = [s.name, s.gender || '', s.groupName || '未分组', s.gridIndex, s.duty || '', s.animal || '🐱', s.petState || 'normal', s.onLeave ? '是' : '否'];
        CATEGORIES.forEach((_, i) => row.push(s.cats[i] || 0));
        SUBJECTS.forEach(sub => row.push(s['subject_'+sub] || 0));
        return row;
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `班级量化_${className}_第${week}周_${new Date().toISOString().slice(0,10)}_ID_${classId}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showFloatToast(students.length > 0 ? '✅ 导出成功' : '✅ 已导出空模板（无学生）');
}
function saveToLocal() {
    const data = {
        students: students,
        groupColorMap: groupColorMap,
        groupSloganMap: groupSloganMap,
        podiumStartIndex: podiumStartIndex,
        week: currentWeek
    };
    DataManager.saveClassData(data, CURRENT_CLASS);
}
function loadFromLocal() {
    const data = DataManager.loadClassData(CURRENT_CLASS);
    if (!data || !data.students || data.students.length === 0) return false;
    students = data.students;
    groupColorMap = data.groupColorMap || {};
    groupSloganMap = data.groupSloganMap || {};
    podiumStartIndex = data.podiumStartIndex !== undefined ? data.podiumStartIndex : 5;
    if (data.week) {
        currentWeek = data.week;
        const weekInput = document.getElementById('weekInput');
        if (weekInput) weekInput.value = data.week;
    }
    students.forEach(s => {
        if (!s.cats || s.cats.length !== CATEGORIES.length) s.cats = CATEGORIES.map(() => 0);
        if (!s.animal) s.animal = '🐱';
        if (!s.petState) s.petState = 'normal';
        if (s.onLeave === undefined) s.onLeave = false;
        if (!s.duty) s.duty = '';
        ensureSubjectFields(s);
    });
    const groupNames = [...new Set(students.map(s => s.groupName || '未分组'))];
    groupNames.forEach(name => {
        if (!groupColorMap[name]) {
            const used = Object.values(groupColorMap);
            const avail = COLOR_PALETTE.filter(c => !used.includes(c));
            groupColorMap[name] = avail.length ? avail[0] : COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
        }
        if (!groupSloganMap[name]) groupSloganMap[name] = '';
    });
    return true;
}
function init() {
    loadWeekNumber();
    const weekInput = document.getElementById('weekInput');
    if (weekInput) {
        weekInput.addEventListener('blur', saveWeekNumber);
        weekInput.addEventListener('input', saveWeekNumberWithPassword);
        window.addEventListener('beforeunload', saveWeekNumber);
    }
    const loaded = loadFromLocal();
    if (!loaded) students = [];
    loadActiveFilters();
    students.forEach(s => { if (!s.animal) s.animal = '🐱'; if (!s.petState) s.petState = 'normal'; });
    loadRankingSettings();
    loadRankingBarState();
    updateSubjectRanks();
    updateRankingUIBar();
    render();
    const sel = document.getElementById('rankingModeSelect');
    if (sel) {
        sel.addEventListener('change', function() {
            rankingMode = this.value;
            saveRankingSettings();
            updateRankingUIBar();
            updateSubjectRanks();
            render();
        });
    }
    const scoreInp = document.getElementById('fullScoreInput');
    if (scoreInp) {
        scoreInp.addEventListener('change', function() {
            const v = parseFloat(this.value);
            if (!isNaN(v) && v > 0) {
                subjectFullScore = v;
                saveRankingSettings();
                updateSubjectRanks();
                render();
            } else { this.value = subjectFullScore; }
        });
    }
    const totalInp = document.getElementById('totalCountInput');
    if (totalInp) {
        totalInp.addEventListener('change', function() {
            const v = parseInt(this.value, 10);
            if (!isNaN(v) && v > 0) {
                rankingTotalCount = v;
                saveRankingSettings();
                updateSubjectRanks();
                render();
            } else {
                this.value = students.length;
                rankingTotalCount = 0;
                saveRankingSettings();
                updateSubjectRanks();
                render();
            }
        });
    }
}

init();

window.goToPetPark = goToPetPark;
window.importCSV = importCSV;
window.exportData = exportData;
window.createGroup = createGroup;
window.clearSelection = clearSelection;
window.toggleMultiSelectMode = toggleMultiSelectMode;
window.resetGroups = resetGroups;
window.changePassword = changePassword;
window.editStudent = editStudent;
window.addStudentAtIndex = addStudentAtIndex;
window.saveStudent = saveStudent;
window.deleteStudent = deleteStudent;
window.closeEditModal = closeEditModal;
window.openPetSelectorInEdit = openPetSelectorInEdit;
window.openGroupPanel = openGroupPanel;
window.closeGroupPanel = closeGroupPanel;
window.zoomGrid = zoomGrid;
window.toggleCategory = toggleCategory;
window.toggleSubject = toggleSubject;
window.updateSubjectScore = updateSubjectScore;
window.handleWeekReset = handleWeekReset;
window.saveWeekNumber = saveWeekNumber;
window.toggleRankingBar = toggleRankingBar;