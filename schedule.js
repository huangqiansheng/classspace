// 班级管理系统 | Copyright (c) 2026 黄迁胜 | 根据 MIT 许可证授权
// 周课程表脚本（完整版）

// ==================== 基础常量 ====================
const params = new URLSearchParams(window.location.search);
const CURRENT_CLASS = params.get('classId') || params.get('class') || localStorage.getItem('currentClassId') || '一班';
const STORAGE_KEY = 'scheduleData_' + CURRENT_CLASS;
const WORK_FOCUS_KEY = 'workFocus_' + CURRENT_CLASS;
const CALENDAR_KEY = 'calendarData_' + CURRENT_CLASS;
const DAYS = ['周一', '周二', '周三', '周四', '周五', '📝 科目', '⏰ 时间'];
const EXAM_SUBJECT_INDEX = 5;
const EXAM_TIME_INDEX = 6;
const STANDARD_SUBJECTS = ['语文','数学','英语','物理','化学','历史','地理','生物','政治'];
const SCORE_DEFAULT = 5;
const MARQUEE_SPEED = 30;
const LONG_PRESS_MS = 600;
const DAY_MS = 24 * 60 * 60 * 1000;
let lastRenderedDateStr = new Date().toDateString();

// ==================== 通用工具 ====================
function getTodayIndex() { return (new Date().getDay() + 6) % 7; }
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ==================== 下拉菜单 ====================
function closeAllDropdowns() { document.querySelectorAll('.dropdown-wrap.open').forEach(el => el.classList.remove('open')); }
function toggleExportMenu(e) {
    if (e) e.stopPropagation();
    const wrap = document.getElementById('exportDropdown');
    const isOpen = wrap.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) wrap.classList.add('open');
}
function toggleImportMenu(e) {
    if (e) e.stopPropagation();
    const wrap = document.getElementById('importDropdown');
    const isOpen = wrap.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) wrap.classList.add('open');
}
document.addEventListener('click', closeAllDropdowns);

// ==================== 节次时间 ====================
function parsePeriodTime(name) {
    if (!name) return null;
    const m = name.match(/(\d{1,2})[:：.．](\d{1,2})\s*[-~—–－至到]\s*(\d{1,2})[:：.．](\d{1,2})/);
    if (!m) return null;
    const start = parseInt(m[1]) * 60 + parseInt(m[2]);
    let end = parseInt(m[3]) * 60 + parseInt(m[4]);
    if (end <= start) end += 24 * 60;
    return { start, end };
}
const DEFAULT_PERIOD_TIMES = {
    '早读':      { start: 7*60+30,  end: 8*60      },
    '上午第1节': { start: 8*60,     end: 8*60+45   },
    '上午第2节': { start: 8*60+55,  end: 9*60+40   },
    '上午第3节': { start: 10*60,    end: 10*60+45  },
    '上午第4节': { start: 10*60+55, end: 11*60+40  },
    '下午第1节': { start: 14*60,    end: 14*60+45  },
    '下午第2节': { start: 14*60+55, end: 15*60+40  },
    '下午第3节': { start: 16*60,    end: 16*60+45  },
    '下午第4节': { start: 16*60+55, end: 17*60+40  },
    '晚自习':    { start: 19*60,    end: 20*60+30  }
};
function hmToMin(hm) {
    if (!hm) return null;
    const parts = hm.split(':');
    if (parts.length !== 2) return null;
    const h = parseInt(parts[0]), m = parseInt(parts[1]);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
}
function getPeriodTime(period) {
    if (!period) return null;
    if (period.start && period.end) {
        const s = hmToMin(period.start), e = hmToMin(period.end);
        if (s !== null && e !== null) return { start: s, end: e <= s ? e + 24 * 60 : e };
    }
    const parsed = parsePeriodTime(period.name);
    if (parsed) return parsed;
    if (!period.name) return null;
    for (const key in DEFAULT_PERIOD_TIMES) {
        if (period.name.includes(key) || key.includes(period.name)) return DEFAULT_PERIOD_TIMES[key];
    }
    return null;
}
function getCurrentPeriodIndex() {
    const now = new Date();
    const rawToday = (now.getDay() + 6) % 7;
    if (rawToday >= 5) return -1;
    const curMin = now.getHours() * 60 + now.getMinutes();
    for (let i = 0; i < scheduleData.periods.length; i++) {
        const p = scheduleData.periods[i];
        if (p.banner) continue;
        const t = getPeriodTime(p);
        if (t && curMin >= t.start && curMin < t.end) return i;
    }
    return -1;
}
let currentPeriodTimer = null;
function updateCurrentPeriodHighlight() {
    const now = new Date();
    const todayStr = now.toDateString();
    if (todayStr !== lastRenderedDateStr) { lastRenderedDateStr = todayStr; renderTable(); return; }
    document.querySelectorAll('.current-period').forEach(el => el.classList.remove('current-period'));
    const rawToday = (now.getDay() + 6) % 7;
    if (rawToday >= 5) return;
    const idx = getCurrentPeriodIndex();
    if (idx === -1) return;
    const cell = document.querySelector(`td.course-cell[data-day="${rawToday}"][data-period="${idx}"]`);
    if (cell) cell.classList.add('current-period');
}
function startCurrentPeriodTimer() {
    if (currentPeriodTimer) clearInterval(currentPeriodTimer);
    updateCurrentPeriodHighlight();
    currentPeriodTimer = setInterval(updateCurrentPeriodHighlight, 30000);
}
function getCellTimeStatus(dayIdx, periodIdx) {
    if (dayIdx === EXAM_SUBJECT_INDEX || dayIdx === EXAM_TIME_INDEX) return 'none';
    const now = new Date();
    const rawToday = (now.getDay() + 6) % 7;
    if (dayIdx < rawToday) return 'past';
    if (dayIdx > rawToday) return 'future';
    const period = scheduleData.periods[periodIdx];
    if (!period) return 'future';
    const t = getPeriodTime(period);
    if (t) {
        const curMin = now.getHours() * 60 + now.getMinutes();
        if (curMin < t.start) return 'future';
        if (curMin >= t.end) return 'past';
        return 'now';
    }
    const curIdx = getCurrentPeriodIndex();
    if (curIdx === -1) return 'future';
    if (periodIdx < curIdx) return 'past';
    if (periodIdx > curIdx) return 'future';
    return 'now';
}
function matchSubject(courseName) {
    if (!courseName) return null;
    for (const sub of STANDARD_SUBJECTS) if (courseName === sub) return sub;
    for (const sub of STANDARD_SUBJECTS) if (courseName.includes(sub)) return sub;
    return null;
}
function genReviewId() { return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
function formatTimeShort(hhmm) {
    if (!hhmm) return '';
    const parts = hhmm.split(':');
    if (parts.length !== 2) return hhmm;
    return parseInt(parts[0], 10) + ':' + parts[1];
}
function formatTimeFull(hhmm) {
    if (!hhmm) return '';
    const parts = hhmm.split(':');
    if (parts.length !== 2) return '';
    const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return '';
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function formatCommentTime(iso) {
    try {
        const d = new Date(iso);
        return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch(e) { return ''; }
}
function getAvgScore(course) {
    if (!course || !course.reviews || course.reviews.length === 0) return null;
    const valid = course.reviews.filter(r => r.score != null && !isNaN(r.score));
    if (valid.length === 0) return null;
    return valid.reduce((a, r) => a + parseFloat(r.score), 0) / valid.length;
}
function getCommentsText(course) {
    if (!course || !course.reviews || course.reviews.length === 0) return '';
    return course.reviews.filter(r => r.text && r.text.trim()).map(r => {
        const net = r.likes || 0;
        let likeStr = '';
        if (net > 0) likeStr = ` 👍${net}`;
        else if (net < 0) likeStr = ` 👎${-net}`;
        return `🌹${r.score} ${r.text.trim()}${likeStr}`;
    }).join('  ·  ');
}
function getTopComment(course) {
    if (!course || !course.reviews || course.reviews.length === 0) return '';
    const withText = course.reviews.filter(r => r.text && r.text.trim());
    if (withText.length === 0) return '';
    const sorted = [...withText].sort((a, b) => {
        const diff = (b.likes || 0) - (a.likes || 0);
        if (diff !== 0) return diff;
        return new Date(b.time || 0) - new Date(a.time || 0);
    });
    const top = sorted[0];
    const net = top.likes || 0;
    let likeStr = '';
    if (net > 0) likeStr = ` 👍${net}`;
    else if (net < 0) likeStr = ` 👎${-net}`;
    return `🌹${top.score} ${top.text.trim()}${likeStr}`;
}

// ==================== 跑马灯 ====================
function applyMarqueeToElement(track, container) {
    if (!track || !container) return;
    const contents = track.querySelectorAll('.note-content');
    for (let i = contents.length - 1; i > 0; i--) contents[i].remove();
    track.classList.remove('scrolling');
    track.style.animationDuration = '';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const first = track.querySelector('.note-content');
        if (!first) return;
        const firstWidth = first.offsetWidth;
        if (firstWidth > container.clientWidth) {
            track.appendChild(first.cloneNode(true));
            const duration = firstWidth / MARQUEE_SPEED;
            track.style.animationDuration = duration.toFixed(2) + 's';
            track.classList.add('scrolling');
        }
    }));
}
function applyMarquee() {
    document.querySelectorAll('.course-third.marquee').forEach(el => {
        const track = el.querySelector('.note-track');
        if (track) applyMarqueeToElement(track, el);
    });
}

// ==================== 工作重点 ====================
function renderWorkFocus() {
    const text = localStorage.getItem(WORK_FOCUS_KEY) || '';
    const el = document.getElementById('workFocusText');
    el.classList.remove('scrolling');
    el.style.animationDuration = '';
    if (text) {
        el.innerHTML = `<div class="note-track"><span class="note-content">${escapeHtml(text)}</span></div>`;
        el.classList.remove('empty');
        applyMarqueeForWorkFocus();
    } else {
        el.innerHTML = '点击此处设置本周工作重点';
        el.classList.add('empty');
    }
}
function applyMarqueeForWorkFocus() {
    const el = document.getElementById('workFocusText');
    if (!el || el.classList.contains('empty') || el.contentEditable === 'true') return;
    const track = el.querySelector('.note-track');
    if (track) applyMarqueeToElement(track, el);
}
function editWorkFocus() {
    const el = document.getElementById('workFocusText');
    if (el.contentEditable === 'true') return;
    const text = localStorage.getItem(WORK_FOCUS_KEY) || '';
    el.classList.remove('empty', 'scrolling');
    el.innerHTML = '';
    el.textContent = text;
    el.contentEditable = 'true';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.onblur = () => {
        el.contentEditable = 'false';
        el.onblur = null; el.onkeydown = null;
        const newText = el.innerText.replace(/\s+/g, ' ').trim();
        if (newText) localStorage.setItem(WORK_FOCUS_KEY, newText);
        else localStorage.removeItem(WORK_FOCUS_KEY);
        renderWorkFocus();
    };
    el.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); el.blur(); }
    };
}

// ==================== 数据层 ====================
const DEFAULT_PERIODS = ['早读', '上午第1节', '上午第2节', '上午第3节', '上午第4节', '下午第1节', '下午第2节', '下午第3节', '下午第4节', '晚自习'];
let scheduleData = { periods: [], courses: {} };
let editingDay = -1, editingPeriod = -1;
let selectedScore = null;
let activePanelDay = -1, activePanelPeriod = -1;
let activeNoteDay = -1, activeNotePeriod = -1;
let dragSource = null, touchSource = null, longPressTimer = null, justLongPressed = false, cellClickTimer = null;

function migrateOldData(data) {
    if (!data) return data;
    if (Array.isArray(data.periods)) {
        data.periods = data.periods.map(p => {
            if (typeof p === 'string') return { name: p, banner: false };
            if (!p || typeof p !== 'object') return { name: String(p || ''), banner: false };
            if (p.name === undefined) p.name = '';
            if (p.banner === undefined) p.banner = false;
            return p;
        });
    }
    if (data.courses) {
        Object.keys(data.courses).forEach(dIdx => {
            Object.keys(data.courses[dIdx]).forEach(pIdx => {
                const c = data.courses[dIdx][pIdx];
                if (!c) return;
                if (c.teacher && !c.note) c.note = c.teacher;
                delete c.teacher;
                if (!c.reviews) c.reviews = [];
                c.reviews = c.reviews.map(r => {
                    if (!r.id) r.id = genReviewId();
                    if (r.likes === undefined && r.dislikes === undefined) r.likes = 0;
                    else if (r.likes !== undefined && r.dislikes !== undefined) {
                        r.likes = (r.likes || 0) - (r.dislikes || 0);
                        delete r.dislikes;
                    } else if (r.dislikes !== undefined) {
                        r.likes = -(r.dislikes || 0);
                        delete r.dislikes;
                    }
                    if (r.score === undefined) r.score = SCORE_DEFAULT;
                    return r;
                });
            });
        });
    }
    return data;
}
function loadData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            scheduleData = JSON.parse(saved);
            if (!scheduleData.periods || scheduleData.periods.length === 0) scheduleData.periods = DEFAULT_PERIODS.map(n => ({ name: n, banner: false }));
            if (!scheduleData.courses) scheduleData.courses = {};
            migrateOldData(scheduleData);
        } else {
            scheduleData = { periods: DEFAULT_PERIODS.map(n => ({ name: n, banner: false })), courses: {} };
            saveData();
        }
    } catch(e) {
        console.warn('读取失败：', e);
        scheduleData = { periods: DEFAULT_PERIODS.map(n => ({ name: n, banner: false })), courses: {} };
        saveData();
    }
}
function saveData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scheduleData)); }
    catch(e) { console.warn('保存失败：', e); }
}

// ==================== 表头 / 表格渲染 ====================
function getCurrentWeekNumber() {
    if (typeof calendarData === 'undefined' || !calendarData || !calendarData.startDate) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const base = new Date(calendarData.startDate + 'T00:00:00');
    const dw = base.getDay();
    const offset = (dw === 0) ? 6 : dw - 1;
    const week1Monday = new Date(base);
    week1Monday.setDate(week1Monday.getDate() - offset);
    week1Monday.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - week1Monday) / DAY_MS);
    const weekNum = Math.floor(diffDays / 7) + 1;
    return weekNum >= 1 ? weekNum : 0;
}
function renderHeader() {
    const rawTodayIndex = getTodayIndex();
    const isWeekendToday = rawTodayIndex >= 5;
    const head = document.getElementById('tableHead');
    const weekNum = getCurrentWeekNumber();
    const thInner = weekNum > 0 ? `<div class="header-week-badge">第${weekNum}周</div>` : `节次 / 日期`;
    let html = `<tr><th style="width:100px;">${thInner}</th>`;
    const now = new Date();
    for (let i = 0; i < 5; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() - rawTodayIndex + i);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        let cls = '';
        if (isWeekendToday) cls = 'future-header';
        else if (i < rawTodayIndex) cls = 'past-header';
        else if (i === rawTodayIndex) cls = 'today-header';
        else cls = 'future-header';
        html += `<th class="${cls}" style="width:13%;">${DAYS[i]} ${mm}/${dd}</th>`;
    }
    html += `<th class="exam-header" style="width:12%;">${DAYS[5]}</th>`;
    html += `<th class="exam-header" style="width:12%;">${DAYS[6]}</th></tr>`;
    head.innerHTML = html;
}
function renderTable() {
    const rawTodayIndex = getTodayIndex();
    const isWeekendToday = rawTodayIndex >= 5;
    lastRenderedDateStr = new Date().toDateString();
    const body = document.getElementById('tableBody');
    renderHeader();
    let html = '';
    scheduleData.periods.forEach((period, pIdx) => {
        if (period.banner) {
            html += '<tr class="banner-row" data-period-index="' + pIdx + '">';
            html += `<td class="banner-period-label" ondblclick="openPeriodEditModal(${pIdx})" title="双击编辑">${escapeHtml(period.name)}</td>`;
            for (let dIdx = 0; dIdx < 5; dIdx++) {
                let cls = 'banner-cell';
                if (isWeekendToday) cls += ' future-banner';
                else if (dIdx < rawTodayIndex) cls += ' past-banner';
                else if (dIdx === rawTodayIndex) cls += ' today-banner';
                else cls += ' future-banner';
                html += `<td class="${cls}" ondblclick="openPeriodEditModal(${pIdx})" title="双击编辑">${dIdx === 2 ? escapeHtml(period.name) : ''}</td>`;
            }
            html += `<td class="banner-exam"></td><td class="banner-exam"></td></tr>`;
            return;
        }
        html += '<tr>';
        html += `<td><span class="period-label" title="双击编辑节次" ondblclick="openPeriodEditModal(${pIdx})">${escapeHtml(period.name)}</span></td>`;
        for (let dIdx = 0; dIdx < 7; dIdx++) {
            const course = (scheduleData.courses[dIdx] && scheduleData.courses[dIdx][pIdx]) || null;
            let timeColClass = '';
            if (dIdx === EXAM_SUBJECT_INDEX || dIdx === EXAM_TIME_INDEX) timeColClass = 'exam-col';
            else if (isWeekendToday) timeColClass = 'future-col';
            else if (dIdx < rawTodayIndex) timeColClass = 'past-col';
            else if (dIdx === rawTodayIndex) timeColClass = 'today-col';
            else timeColClass = 'future-col';
            const isSelected = (activePanelDay === dIdx && activePanelPeriod === pIdx);
            const selectedClass = isSelected ? 'selected-cell' : '';
            const isSwapSource = (touchSource && touchSource.day === dIdx && touchSource.period === pIdx);
            const swapClass = isSwapSource ? 'swap-source' : '';
            let emptyTip = '双击添加';
            if (dIdx === EXAM_SUBJECT_INDEX) emptyTip = '双击添加科目';
            else if (dIdx === EXAM_TIME_INDEX) emptyTip = '双击选时间';
            const isTodayCol = (!isWeekendToday && dIdx === rawTodayIndex);
            const isDraggableCol = (dIdx !== EXAM_SUBJECT_INDEX && dIdx !== EXAM_TIME_INDEX);
            let innerHtml;
            if (course) {
                const avg = getAvgScore(course);
                const avgHtml = (avg !== null) ? `<span class="course-avg">🌹${avg.toFixed(1)}</span>` : '';
                const nameHtml = `<div class="course-name"><span>${escapeHtml(course.name)}</span>${avgHtml}</div>`;
                const infoParts = [];
                if (course.teacher && course.teacher.trim()) infoParts.push(course.teacher.trim());
                if (course.room && course.room.trim()) infoParts.push(course.room.trim());
                const infoHtml = infoParts.length > 0 ? `<div class="course-info">${escapeHtml(infoParts.join(' · '))}</div>` : '';
                let thirdContent = '', thirdIsMarquee = false, thirdIsNote = false;
                if (course.note && course.note.trim()) { thirdContent = course.note.trim(); thirdIsNote = true; }
                else if (isTodayCol) { thirdContent = getCommentsText(course); thirdIsMarquee = true; }
                else { thirdContent = getTopComment(course); }
                let thirdHtml = '';
                if (thirdContent) {
                    if (thirdIsMarquee) thirdHtml = `<div class="course-third marquee"><div class="note-track"><span class="note-content">${escapeHtml(thirdContent)}</span></div></div>`;
                    else if (thirdIsNote) thirdHtml = `<div class="course-third static is-note"><span class="note-content">${escapeHtml(thirdContent)}</span></div>`;
                    else thirdHtml = `<div class="course-third static"><span class="note-content">${escapeHtml(thirdContent)}</span></div>`;
                }
                innerHtml = nameHtml + infoHtml + thirdHtml;
            } else {
                innerHtml = `<span class="empty-tip">${emptyTip}</span>`;
            }
            const hasClass = course ? 'has-course' : '';
            const draggableAttr = (course && isDraggableCol) ? 'draggable="true"' : '';
            const hasCourseAttr = course ? ' data-has-course="1"' : '';
            html += `<td class="course-cell ${hasClass} ${timeColClass} ${selectedClass} ${swapClass}" ${draggableAttr} data-day="${dIdx}" data-period="${pIdx}"${hasCourseAttr} onclick="handleCellClick(this)" ondblclick="handleCellDoubleClick(event, this)"><div class="cell-content">${innerHtml}</div></td>`;
        }
        html += '</tr>';
    });
    body.innerHTML = html;
    applyMarquee();
    requestAnimationFrame(() => requestAnimationFrame(applyRowHeights));
    setTimeout(applyRowHeights, 100);
    updateCurrentPeriodHighlight();
}
function applyRowHeights() {
    const wrap = document.querySelector('.table-wrap');
    const table = document.getElementById('scheduleTable');
    const thead = table.querySelector('thead');
    const rows = table.querySelectorAll('tbody tr');
    if (!wrap || !thead || rows.length === 0) return;
    rows.forEach(tr => { tr.style.height = ''; });
    const wrapH = wrap.getBoundingClientRect().height
        - parseFloat(getComputedStyle(wrap).borderTopWidth)
        - parseFloat(getComputedStyle(wrap).borderBottomWidth);
    const theadH = thead.getBoundingClientRect().height;
    const available = wrapH - theadH - 8;
    if (available <= 0) return;
    let totalWeight = 0;
    rows.forEach(tr => { totalWeight += tr.classList.contains('banner-row') ? 0.5 : 1; });
    const unit = available / totalWeight;
    rows.forEach(tr => {
        const isBanner = tr.classList.contains('banner-row');
        tr.style.height = (isBanner ? unit * 0.5 : unit) + 'px';
    });
}
window.addEventListener('resize', () => {
    applyMarquee();
    applyMarqueeForWorkFocus();
    applyRowHeights();
    updateCurrentPeriodHighlight();
});

// ==================== 点击 / 双击 / 交换 ====================
function handleCellClick(td) {
    if (justLongPressed) return;
    if (cellClickTimer) clearTimeout(cellClickTimer);
    cellClickTimer = setTimeout(() => { cellClickTimer = null; handleCellClickDelayed(td); }, 250);
}
function handleCellClickDelayed(td) {
    const dayIdx = parseInt(td.dataset.day);
    const periodIdx = parseInt(td.dataset.period);
    if (touchSource) {
        if (touchSource.day === dayIdx && touchSource.period === periodIdx) {
            touchSource = null; renderTable(); return;
        }
        if (dayIdx !== EXAM_SUBJECT_INDEX && dayIdx !== EXAM_TIME_INDEX) {
            const src = touchSource;
            touchSource = null;
            swapCourses(src.day, src.period, dayIdx, periodIdx);
            return;
        }
        touchSource = null; renderTable(); return;
    }
    if (dayIdx === EXAM_SUBJECT_INDEX || dayIdx === EXAM_TIME_INDEX) return;
    if (!td.dataset.hasCourse) { closePanels(); closeNotePanel(); return; }
    const status = getCellTimeStatus(dayIdx, periodIdx);
    if (status === 'now') {
        const course = scheduleData.courses[dayIdx] && scheduleData.courses[dayIdx][periodIdx];
        if (!course) return;
        const subject = matchSubject(course.name);
        let url = 'seat.html?classId=' + encodeURIComponent(CURRENT_CLASS);
        if (subject) url += '&subject=' + encodeURIComponent(subject);
        window.open(url, '_blank');
        return;
    }
    if (status === 'past') {
        if (activePanelDay === dayIdx && activePanelPeriod === periodIdx) { closePanels(); return; }
        closeNotePanel();
        openPanels(dayIdx, periodIdx);
        return;
    }
    if (status === 'future') { closePanels(); openNotePanel(dayIdx, periodIdx); return; }
}
function handleCellDoubleClick(event, td) {
    event.stopPropagation();
    if (cellClickTimer) { clearTimeout(cellClickTimer); cellClickTimer = null; }
    editCourse(parseInt(td.dataset.day), parseInt(td.dataset.period));
}
function swapCourses(day1, period1, day2, period2) {
    if (day1 === day2 && period1 === period2) return;
    if (!scheduleData.courses[day1]) scheduleData.courses[day1] = {};
    if (!scheduleData.courses[day2]) scheduleData.courses[day2] = {};
    const c1 = scheduleData.courses[day1][period1] || null;
    const c2 = scheduleData.courses[day2][period2] || null;
    if (c2) scheduleData.courses[day1][period1] = c2; else delete scheduleData.courses[day1][period1];
    if (c1) scheduleData.courses[day2][period2] = c1; else delete scheduleData.courses[day2][period2];
    saveData(); renderTable();
}

// ==================== 拖拽 / 触摸 ====================
(function setupDragAndDrop() {
    const table = document.getElementById('scheduleTable');
    table.addEventListener('dragstart', e => {
        const td = e.target.closest('td.course-cell');
        if (!td) { e.preventDefault(); return; }
        const day = parseInt(td.dataset.day), period = parseInt(td.dataset.period);
        if (day === EXAM_SUBJECT_INDEX || day === EXAM_TIME_INDEX) { e.preventDefault(); return; }
        const course = scheduleData.courses[day] && scheduleData.courses[day][period];
        if (!course) { e.preventDefault(); return; }
        dragSource = { day, period };
        td.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', `d${day}p${period}`); } catch(err) {}
    });
    table.addEventListener('dragend', () => {
        document.querySelectorAll('.course-cell.dragging').forEach(el => el.classList.remove('dragging'));
        document.querySelectorAll('.course-cell.drag-over-cell').forEach(el => el.classList.remove('drag-over-cell'));
        dragSource = null;
    });
    table.addEventListener('dragover', e => {
        const td = e.target.closest('td.course-cell');
        if (!td) return;
        const day = parseInt(td.dataset.day);
        if (day === EXAM_SUBJECT_INDEX || day === EXAM_TIME_INDEX) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.course-cell.drag-over-cell').forEach(el => el.classList.remove('drag-over-cell'));
        td.classList.add('drag-over-cell');
    });
    table.addEventListener('dragleave', e => {
        const td = e.target.closest('td.course-cell');
        if (td) td.classList.remove('drag-over-cell');
    });
    table.addEventListener('drop', e => {
        e.preventDefault();
        document.querySelectorAll('.course-cell.drag-over-cell').forEach(el => el.classList.remove('drag-over-cell'));
        const td = e.target.closest('td.course-cell');
        if (!td) return;
        const day = parseInt(td.dataset.day), period = parseInt(td.dataset.period);
        if (day === EXAM_SUBJECT_INDEX || day === EXAM_TIME_INDEX) return;
        if (!dragSource) return;
        const src = dragSource; dragSource = null;
        swapCourses(src.day, src.period, day, period);
    });
})();
(function setupTouchSwap() {
    const table = document.getElementById('scheduleTable');
    table.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        const td = e.target.closest('td.course-cell');
        if (!td) return;
        const day = parseInt(td.dataset.day), period = parseInt(td.dataset.period);
        if (day === EXAM_SUBJECT_INDEX || day === EXAM_TIME_INDEX) return;
        const course = scheduleData.courses[day] && scheduleData.courses[day][period];
        if (!course) return;
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            longPressTimer = null;
            justLongPressed = true;
            setTimeout(() => { justLongPressed = false; }, 500);
            if (touchSource && touchSource.day === day && touchSource.period === period) {
                touchSource = null; renderTable(); return;
            }
            touchSource = { day, period }; renderTable();
        }, LONG_PRESS_MS);
    }, { passive: true });
    table.addEventListener('touchend', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });
    table.addEventListener('touchmove', () => {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });
})();

// ==================== 评分 / 评论 ====================
function openPanels(dayIdx, periodIdx) {
    const course = scheduleData.courses[dayIdx] && scheduleData.courses[dayIdx][periodIdx];
    if (!course) return;
    activePanelDay = dayIdx; activePanelPeriod = periodIdx;
    document.getElementById('ratingPanelCourseName').textContent = course.name;
    document.getElementById('ratingPanelSlotInfo').textContent = `${DAYS[dayIdx]} · ${scheduleData.periods[periodIdx].name}`;
    updateRatingPanelAvg(course);
    selectedScore = null;
    document.querySelectorAll('#ratingPicker .rating-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('ratingCommentInput').value = '';
    document.getElementById('ratingPanel').classList.add('active');
    updateCommentsPanel(course);
    document.getElementById('commentsPanel').classList.add('active');
    renderTable();
}
function closePanels() {
    activePanelDay = -1; activePanelPeriod = -1;
    document.getElementById('ratingPanel').classList.remove('active');
    document.getElementById('commentsPanel').classList.remove('active');
    renderTable();
}
function openNotePanel(dayIdx, periodIdx) {
    const course = scheduleData.courses[dayIdx] && scheduleData.courses[dayIdx][periodIdx];
    if (!course) return;
    activeNoteDay = dayIdx; activeNotePeriod = periodIdx;
    document.getElementById('notePanelCourseName').textContent = course.name;
    document.getElementById('notePanelSlotInfo').textContent = `${DAYS[dayIdx]} · ${scheduleData.periods[periodIdx].name}`;
    document.getElementById('notePanelText').value = course.note || '';
    document.getElementById('notePanel').classList.add('active');
    setTimeout(() => document.getElementById('notePanelText').focus(), 200);
}
function closeNotePanel() {
    document.getElementById('notePanel').classList.remove('active');
    activeNoteDay = -1; activeNotePeriod = -1;
}
function saveNotePanel() {
    if (activeNoteDay < 0 || activeNotePeriod < 0) { closeNotePanel(); return; }
    const text = document.getElementById('notePanelText').value.trim();
    const course = scheduleData.courses[activeNoteDay] && scheduleData.courses[activeNoteDay][activeNotePeriod];
    if (!course) { closeNotePanel(); return; }
    course.note = text;
    saveData(); closeNotePanel(); renderTable();
}
function updateRatingPanelAvg(course) {
    const avg = getAvgScore(course);
    const count = (course.reviews || []).length;
    const numEl = document.getElementById('ratingPanelAvgNum');
    const cntEl = document.getElementById('ratingPanelAvgCount');
    if (avg === null) { numEl.textContent = '🌹 -'; cntEl.textContent = '暂无评分'; }
    else { numEl.textContent = `🌹 ${avg.toFixed(1)}`; cntEl.textContent = `${count} 人参与`; }
}
function updateCommentsPanel(course) {
    const list = document.getElementById('commentsList');
    const countEl = document.getElementById('commentsPanelCount');
    const reviews = course.reviews || [];
    countEl.textContent = `(${reviews.length})`;
    if (reviews.length === 0) { list.innerHTML = '<div class="comment-empty">暂无评论</div>'; return; }
    const sorted = [...reviews].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    list.innerHTML = sorted.map(r => {
        const net = r.likes || 0;
        const likeDisplay = net >= 0 ? `👍 ${net}` : `👎 ${-net}`;
        const likeClass = net >= 0 ? 'like-btn' : 'dislike-btn';
        return `<div class="comment-item">
            <span class="comment-score">🌹${r.score || SCORE_DEFAULT}</span>
            <span class="comment-text">${escapeHtml(r.text || '(无文字)')}</span>
            <span class="comment-time">${formatCommentTime(r.time)}</span>
            <span class="comment-actions">
                <button class="action-btn ${likeClass}" onclick="toggleLike('${r.id}', 1)" title="赞同">👍</button>
                <button class="action-btn dislike-btn" onclick="toggleLike('${r.id}', -1)" title="踩">👎</button>
                <button class="action-btn like-btn" style="pointer-events:none;border:none;background:transparent;min-width:36px;justify-content:center;" tabindex="-1">${likeDisplay}</button>
                <button class="action-btn copy-btn" onclick="copyComment('${r.id}')" title="复制">📋</button>
                <button class="action-btn del-btn" onclick="deleteComment('${r.id}')" title="删除">✕</button>
            </span>
        </div>`;
    }).join('');
}
function toggleLike(reviewId, delta) {
    if (activePanelDay < 0) return;
    const course = scheduleData.courses[activePanelDay] && scheduleData.courses[activePanelDay][activePanelPeriod];
    if (!course || !course.reviews) return;
    const r = course.reviews.find(x => x.id === reviewId);
    if (!r) return;
    r.likes = (r.likes || 0) + delta;
    saveData(); updateCommentsPanel(course); renderTable();
}
function copyComment(reviewId) {
    if (activePanelDay < 0) return;
    const course = scheduleData.courses[activePanelDay] && scheduleData.courses[activePanelDay][activePanelPeriod];
    if (!course || !course.reviews) return;
    const r = course.reviews.find(x => x.id === reviewId);
    if (!r) return;
    const text = r.text || '';
    if (!text.trim()) { flashToast('没有文字'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => flashToast('已复制 ✓')).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
}
function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); flashToast('已复制 ✓'); }
    catch(e) { flashToast('复制失败'); }
    document.body.removeChild(ta);
}
function flashToast(msg) {
    const tip = document.createElement('div');
    tip.textContent = msg;
    tip.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#27ae60;color:#fff;padding:6px 18px;border-radius:30px;font-size:13px;z-index:9999;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.4);';
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 1200);
}
function deleteComment(reviewId) {
    if (activePanelDay < 0) return;
    const course = scheduleData.courses[activePanelDay] && scheduleData.courses[activePanelDay][activePanelPeriod];
    if (!course || !course.reviews) return;
    const r = course.reviews.find(x => x.id === reviewId);
    if (!r) return;
    const preview = (r.text || '').slice(0, 20);
    if (!confirm(`确定删除？\n\n🌹${r.score} ${preview}${r.text && r.text.length > 20 ? '...' : ''}`)) return;
    course.reviews = course.reviews.filter(x => x.id !== reviewId);
    saveData(); updateRatingPanelAvg(course); updateCommentsPanel(course); renderTable();
}
function submitRating() {
    if (activePanelDay < 0 || activePanelPeriod < 0) return;
    if (selectedScore === null) { alert('请先选评分（1~9）'); return; }
    const dayIdx = activePanelDay, periodIdx = activePanelPeriod;
    const course = scheduleData.courses[dayIdx] && scheduleData.courses[dayIdx][periodIdx];
    if (!course) return;
    if (!course.reviews) course.reviews = [];
    const text = document.getElementById('ratingCommentInput').value.trim();
    course.reviews.push({ id: genReviewId(), score: selectedScore, text, time: new Date().toISOString(), likes: 0 });
    saveData();
    selectedScore = null;
    document.querySelectorAll('#ratingPicker .rating-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('ratingCommentInput').value = '';
    updateRatingPanelAvg(course); updateCommentsPanel(course); renderTable();
}

// ==================== 课程编辑 ====================
function editCourse(dayIdx, periodIdx) {
    const course = (scheduleData.courses[dayIdx] && scheduleData.courses[dayIdx][periodIdx]) || null;
    editingDay = dayIdx; editingPeriod = periodIdx;
    document.getElementById('editDayIndex').value = dayIdx;
    document.getElementById('editPeriodIndex').value = periodIdx;
    const nameGroup = document.getElementById('courseNameGroup');
    const timeGroup = document.getElementById('courseTimeGroup');
    const teacherGroup = document.getElementById('courseTeacherGroup');
    const roomGroup = document.getElementById('courseRoomGroup');
    const noteGroup = document.getElementById('courseNoteGroup');
    const nameInput = document.getElementById('courseName');
    nameGroup.style.display = 'block'; timeGroup.style.display = 'none';
    teacherGroup.style.display = 'block'; roomGroup.style.display = 'block'; noteGroup.style.display = 'block';
    if (dayIdx === EXAM_TIME_INDEX) {
        nameGroup.style.display = 'none'; timeGroup.style.display = 'block';
        teacherGroup.style.display = 'none'; roomGroup.style.display = 'none'; noteGroup.style.display = 'none';
        let s = '', e = '';
        if (course && course.name) {
            const parts = course.name.split('-');
            if (parts.length >= 1) s = formatTimeFull(parts[0]);
            if (parts.length >= 2) e = formatTimeFull(parts[1]);
        }
        document.getElementById('courseTimeStart').value = s;
        document.getElementById('courseTimeEnd').value = e;
        document.getElementById('modalTitle').textContent = `⏰ 考试时间 - ${scheduleData.periods[periodIdx].name}`;
        document.getElementById('clearCourseBtn').style.display = course ? 'inline-flex' : 'none';
        document.getElementById('courseModal').classList.add('active');
        setTimeout(() => document.getElementById('courseTimeStart').focus(), 100);
        return;
    }
    if (dayIdx === EXAM_SUBJECT_INDEX) {
        timeGroup.style.display = 'none'; teacherGroup.style.display = 'none';
        roomGroup.style.display = 'none'; noteGroup.style.display = 'none';
        document.getElementById('courseNameLabel').textContent = '考试科目';
        nameInput.value = course ? course.name : '';
        nameInput.placeholder = '如：数学、语文、英语';
        document.getElementById('modalTitle').textContent = `📝 考试科目 - ${scheduleData.periods[periodIdx].name}`;
        document.getElementById('clearCourseBtn').style.display = course ? 'inline-flex' : 'none';
        document.getElementById('courseModal').classList.add('active');
        setTimeout(() => nameInput.focus(), 100);
        return;
    }
    document.getElementById('courseNameLabel').textContent = '课程名称';
    nameInput.value = course ? course.name : '';
    nameInput.placeholder = '如：数学、语文、体育...';
    document.getElementById('courseTeacher').value = course ? (course.teacher || '') : '';
    document.getElementById('courseRoom').value = course ? (course.room || '') : '';
    document.getElementById('courseNote').value = course ? (course.note || '') : '';
    document.getElementById('modalTitle').textContent = `编辑课程 - ${DAYS[dayIdx]} ${scheduleData.periods[periodIdx].name}`;
    document.getElementById('clearCourseBtn').style.display = course ? 'inline-flex' : 'none';
    document.getElementById('courseModal').classList.add('active');
    setTimeout(() => nameInput.focus(), 100);
}
function closeCourseModal() {
    document.getElementById('courseModal').classList.remove('active');
    editingDay = -1; editingPeriod = -1;
    renderTable();
}
function saveCourse() {
    if (editingDay < 0 || editingPeriod < 0) { closeCourseModal(); return; }
    const dayIdx = editingDay, periodIdx = editingPeriod;
    if (!scheduleData.courses[dayIdx]) scheduleData.courses[dayIdx] = {};
    const existing = scheduleData.courses[dayIdx][periodIdx] || { reviews: [] };
    if (!existing.reviews) existing.reviews = [];
    if (dayIdx === EXAM_TIME_INDEX) {
        const s = document.getElementById('courseTimeStart').value;
        const e = document.getElementById('courseTimeEnd').value;
        let t = '';
        if (s && e) t = formatTimeShort(s) + '-' + formatTimeShort(e);
        else if (s) t = formatTimeShort(s);
        else if (e) t = formatTimeShort(e);
        if (t) scheduleData.courses[dayIdx][periodIdx] = { ...existing, name: t };
        else delete scheduleData.courses[dayIdx][periodIdx];
    } else {
        const name = document.getElementById('courseName').value.trim();
        if (name) {
            existing.name = name;
            if (dayIdx !== EXAM_SUBJECT_INDEX) {
                existing.teacher = document.getElementById('courseTeacher').value.trim();
                existing.room = document.getElementById('courseRoom').value.trim();
                existing.note = document.getElementById('courseNote').value.trim();
            }
            scheduleData.courses[dayIdx][periodIdx] = existing;
        } else delete scheduleData.courses[dayIdx][periodIdx];
    }
    saveData(); closeCourseModal();
}
function clearCourse() {
    if (editingDay < 0 || editingPeriod < 0) return;
    if (!confirm('确定清空？\n\n（含课程名、教师、教室、备注、评分和评论）')) return;
    if (scheduleData.courses[editingDay]) delete scheduleData.courses[editingDay][editingPeriod];
    saveData(); closeCourseModal();
}

// ==================== CSV 解析 ====================
function parseCSV(text) {
    const rows = [];
    let cur = '', row = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) {
            if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
            else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
        else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
}
function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('导入将覆盖课程表所有数据，确定继续？')) { event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result.replace(/^\uFEFF/, '');
            const rows = parseCSV(text).filter(r => r.some(c => c && c.trim()));
            if (rows.length < 2) { alert('❌ 文件无效'); return; }
            const headers = rows[0].map(h => (h || '').trim());
            if (headers[0] !== '节次') { alert('❌ 格式不正确'); return; }
            const totalCols = headers.length;
            const isOld = (totalCols === 8 && headers[6] === '周六');
            const isMerged = (totalCols === 7 && headers[6] === '考试科目');
            const newPeriods = [], newCourses = {};
            for (let i = 1; i < rows.length; i++) {
                const cols = rows[i].map(c => (c || '').trim());
                if (cols.length < 1 || !cols[0]) continue;
                newPeriods.push({ name: cols[0], banner: false });
                for (let d = 0; d < 5; d++) {
                    const raw = (cols[d + 1] || '').trim();
                    if (raw) {
                        let cn = raw, note = '';
                        const m = raw.match(/^(.*?)\((.*?)\)$/);
                        if (m) { cn = m[1].trim(); note = m[2].trim(); }
                        if (!newCourses[d]) newCourses[d] = {};
                        newCourses[d][i - 1] = { name: cn, note, reviews: [] };
                    }
                }
                if (isOld) {
                    const mg = (cols[6] || '').trim() || (cols[7] || '').trim();
                    if (mg) { if (!newCourses[EXAM_SUBJECT_INDEX]) newCourses[EXAM_SUBJECT_INDEX] = {}; newCourses[EXAM_SUBJECT_INDEX][i - 1] = { name: mg, reviews: [] }; }
                } else if (isMerged) {
                    const ev = (cols[6] || '').trim();
                    if (ev) { if (!newCourses[EXAM_SUBJECT_INDEX]) newCourses[EXAM_SUBJECT_INDEX] = {}; newCourses[EXAM_SUBJECT_INDEX][i - 1] = { name: ev, reviews: [] }; }
                } else {
                    const sv = (cols[6] || '').trim(), tv = (cols[7] || '').trim();
                    if (sv) { if (!newCourses[EXAM_SUBJECT_INDEX]) newCourses[EXAM_SUBJECT_INDEX] = {}; newCourses[EXAM_SUBJECT_INDEX][i - 1] = { name: sv, reviews: [] }; }
                    if (tv) { if (!newCourses[EXAM_TIME_INDEX]) newCourses[EXAM_TIME_INDEX] = {}; newCourses[EXAM_TIME_INDEX][i - 1] = { name: tv, reviews: [] }; }
                }
            }
            scheduleData.periods = newPeriods;
            scheduleData.courses = newCourses;
            saveData(); renderTable();
            alert('✅ 导入成功！');
        } catch (err) { alert('❌ 导入失败：' + err.message); }
    };
    reader.readAsText(file, 'utf-8');
    event.target.value = '';
}
function exportData() {
    if (!scheduleData.periods || scheduleData.periods.length === 0) { alert('暂无数据'); return; }
    const headers = ['节次', '周一', '周二', '周三', '周四', '周五', '考试科目', '考试时间'];
    const rows = [];
    scheduleData.periods.forEach((period, pIdx) => {
        const row = [period.name];
        for (let dIdx = 0; dIdx < 7; dIdx++) {
            const course = (scheduleData.courses[dIdx] && scheduleData.courses[dIdx][pIdx]) || null;
            if (!course) { row.push(''); continue; }
            let cell = course.name;
            const extras = [];
            if (course.teacher) extras.push('师:' + course.teacher);
            if (course.room) extras.push('室:' + course.room);
            if (course.note) extras.push('注:' + course.note);
            if (extras.length) cell += '(' + extras.join(' ') + ')';
            row.push(cell);
        }
        rows.push(row);
    });
    let csv = '\uFEFF' + headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => {
            const str = String(cell).replace(/"/g, '""');
            return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str}"` : str;
        }).join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.download = `课程表_${CURRENT_CLASS}_${date}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}
function exportJSON() {
    closeAllDropdowns();
    if (!scheduleData || !scheduleData.periods) { alert('暂无数据'); return; }
    const backup = { _type: 'schedule-backup', _version: 1, _class: CURRENT_CLASS, _exportTime: new Date().toISOString(), data: scheduleData };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.download = `课程表备份_${CURRENT_CLASS}_${date}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    flashToast('✅ 已导出备份');
}
function handleImportJSON(event) {
    closeAllDropdowns();
    const file = event.target.files[0];
    if (!file) { event.target.value = ''; return; }
    if (!confirm('导入将覆盖所有数据，确定继续？')) { event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed || parsed._type !== 'schedule-backup' || !parsed.data) { alert('❌ 不是有效备份'); event.target.value = ''; return; }
            const data = parsed.data;
            if (!Array.isArray(data.periods)) { alert('❌ 缺少节次数据'); event.target.value = ''; return; }
            if (!data.courses) data.courses = {};
            scheduleData = data;
            migrateOldData(scheduleData);
            saveData(); renderTable(); updateCurrentPeriodHighlight();
            flashToast('✅ 恢复成功');
        } catch(err) { alert('❌ 导入失败：' + err.message); }
        event.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
}

// ==================== 节次编辑 ====================
function openPeriodEditModal(index) {
    document.getElementById('editPeriodRowIndex').value = index;
    const p = scheduleData.periods[index];
    document.getElementById('periodEditNameInput').value = p.name;
    document.getElementById('periodIsBanner').checked = !!p.banner;
    document.getElementById('periodStartTime').value = p.start || '';
    document.getElementById('periodEndTime').value = p.end || '';
    document.getElementById('periodModalTitle').textContent = `编辑节次 - 第${index + 1}行`;
    document.getElementById('periodEditModal').classList.add('active');
    setTimeout(() => document.getElementById('periodEditNameInput').focus(), 100);
}
function closePeriodEditModal() { document.getElementById('periodEditModal').classList.remove('active'); }
function savePeriodName() {
    const index = parseInt(document.getElementById('editPeriodRowIndex').value);
    const name = document.getElementById('periodEditNameInput').value.trim();
    const isBanner = document.getElementById('periodIsBanner').checked;
    const start = document.getElementById('periodStartTime').value;
    const end = document.getElementById('periodEndTime').value;
    if (!name) { alert('名称不能为空'); return; }
    if ((start && !end) || (!start && end)) { alert('开始和结束需同时填写或同时留空'); return; }
    scheduleData.periods[index].name = name;
    scheduleData.periods[index].banner = isBanner;
    if (start && end) { scheduleData.periods[index].start = start; scheduleData.periods[index].end = end; }
    else { delete scheduleData.periods[index].start; delete scheduleData.periods[index].end; }
    saveData(); closePeriodEditModal(); renderTable(); updateCurrentPeriodHighlight();
}
function insertPeriodAbove() {
    const index = parseInt(document.getElementById('editPeriodRowIndex').value);
    const name = prompt('新节次名称：', '新节次');
    if (!name || !name.trim()) return;
    scheduleData.periods.splice(index, 0, { name: name.trim(), banner: false });
    for (let d = 0; d < 7; d++) {
        if (scheduleData.courses[d]) {
            const nd = {};
            for (let o = 0; o < scheduleData.periods.length - 1; o++) {
                if (o < index) { if (scheduleData.courses[d][o]) nd[o] = scheduleData.courses[d][o]; }
                else { if (scheduleData.courses[d][o]) nd[o + 1] = scheduleData.courses[d][o]; }
            }
            scheduleData.courses[d] = nd;
        }
    }
    saveData(); closePeriodEditModal(); renderTable();
}
function insertPeriodBelow() {
    const index = parseInt(document.getElementById('editPeriodRowIndex').value);
    const name = prompt('新节次名称：', '新节次');
    if (!name || !name.trim()) return;
    const insertAt = index + 1;
    scheduleData.periods.splice(insertAt, 0, { name: name.trim(), banner: false });
    for (let d = 0; d < 7; d++) {
        if (scheduleData.courses[d]) {
            const nd = {};
            for (let o = 0; o < scheduleData.periods.length - 1; o++) {
                if (o < insertAt) { if (scheduleData.courses[d][o]) nd[o] = scheduleData.courses[d][o]; }
                else { if (scheduleData.courses[d][o]) nd[o + 1] = scheduleData.courses[d][o]; }
            }
            scheduleData.courses[d] = nd;
        }
    }
    saveData(); closePeriodEditModal(); renderTable();
}
function deletePeriod() {
    const index = parseInt(document.getElementById('editPeriodRowIndex').value);
    if (!confirm(`删除"${scheduleData.periods[index].name}"？该节所有课程将清空！`)) return;
    scheduleData.periods.splice(index, 1);
    for (let d = 0; d < 7; d++) {
        if (scheduleData.courses[d]) {
            const nd = {};
            for (let o = 0; o < scheduleData.periods.length + 1; o++) {
                if (o === index) continue;
                if (scheduleData.courses[d][o]) nd[o < index ? o : o - 1] = scheduleData.courses[d][o];
            }
            scheduleData.courses[d] = nd;
        }
    }
    saveData(); closePeriodEditModal(); renderTable();
}
document.querySelectorAll('#ratingPicker .rating-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('#ratingPicker .rating-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        selectedScore = parseInt(this.dataset.score);
    });
});

// ==================== 时钟 ====================
let clockAnimId = null;
let clockPaused = false;
let clockManualDate = null;

function toggleClock() {
    const drawer = document.getElementById('clockDrawer');
    const handle = document.getElementById('clockHandle');
    const isOpen = drawer.classList.toggle('open');
    handle.classList.toggle('hidden', isOpen);
    if (isOpen) startClock(); else stopClock();
}
function startClock() {
    stopClock();
    const loop = () => { drawClock(); clockAnimId = requestAnimationFrame(loop); };
    loop();
}
function stopClock() {
    if (clockAnimId) { cancelAnimationFrame(clockAnimId); clockAnimId = null; }
}
function updatePauseBtn() {
    const btn = document.getElementById('clockPauseBtn');
    if (!btn) return;
    btn.textContent = clockPaused ? '▶ 继续' : '⏸ 暂停';
    btn.classList.toggle('active', clockPaused);
}
function toggleClockPause() {
    clockPaused = !clockPaused;
    if (!clockPaused) clockManualDate = null;
    else if (!clockManualDate) clockManualDate = new Date();
    updatePauseBtn();
}
function clockStepMinute(delta) {
    if (!clockPaused || !clockManualDate) {
        clockManualDate = new Date();
        clockPaused = true;
        updatePauseBtn();
    }
    clockManualDate = new Date(clockManualDate.getTime() + delta * 60 * 1000);
}
function clockResetReal() {
    clockPaused = false;
    clockManualDate = null;
    updatePauseBtn();
    const h = document.getElementById('clockHourInput');
    const m = document.getElementById('clockMinuteInput');
    if (h) h.value = '';
    if (m) m.value = '';
}
function applyClockTimeInput() {
    const hStr = document.getElementById('clockHourInput').value;
    const mStr = document.getElementById('clockMinuteInput').value;
    if (hStr === '' || mStr === '') return;
    const hh = parseInt(hStr), mm = parseInt(mStr);
    if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) { alert('请输入有效时间'); return; }
    const now = new Date();
    clockManualDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
    clockPaused = true;
    updatePauseBtn();
}
function getClockStatus() {
    if (typeof scheduleData === 'undefined' || !scheduleData || !scheduleData.periods) return { text: '--', inClass: false };
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7;
    if (dayIdx >= 5) return { text: '周末', inClass: false };
    const curMin = now.getHours() * 60 + now.getMinutes();
    const curTotalSec = curMin * 60 + now.getSeconds();
    for (let i = 0; i < scheduleData.periods.length; i++) {
        const p = scheduleData.periods[i];
        if (p.banner) continue;
        const t = getPeriodTime(p);
        if (t && curMin >= t.start && curMin < t.end) {
            const remain = Math.max(0, Math.ceil((t.end * 60 - curTotalSec) / 60));
            return { text: `距离下课 ${remain} 分钟`, inClass: true };
        }
    }
    let nextStart = Infinity;
    for (let i = 0; i < scheduleData.periods.length; i++) {
        const p = scheduleData.periods[i];
        if (p.banner) continue;
        const t = getPeriodTime(p);
        if (t && t.start > curMin && t.start < nextStart) nextStart = t.start;
    }
    if (nextStart !== Infinity) {
        const remain = Math.max(0, Math.ceil((nextStart * 60 - curTotalSec) / 60));
        return { text: `距离上课 ${remain} 分钟`, inClass: false };
    }
    return { text: '今日课程已结束', inClass: false };
}
function drawClock() {
    const canvas = document.getElementById('clockCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    const parentRect = canvas.parentElement.getBoundingClientRect();
    const size = Math.max(160, Math.floor(Math.min(parentRect.width, parentRect.height)));
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const cssW = size, cssH = size;
    const targetW = Math.round(cssW * DPR), targetH = Math.round(cssH * DPR);
    if (canvas.width !== targetW || canvas.height !== targetH) { canvas.width = targetW; canvas.height = targetH; }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const W = cssW, H = cssH, cx = W / 2, cy = H / 2;
    const R = Math.round(size * 170 / 380);
    const displayDate = (clockPaused && clockManualDate) ? clockManualDate : new Date();
    ctx.clearRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.18);
    glow.addColorStop(0, 'rgba(247,151,30,0.18)');
    glow.addColorStop(1, 'rgba(247,151,30,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(cx, cy - R * 0.1, R * 0.05, cx, cy, R);
    bg.addColorStop(0, '#1e2f47'); bg.addColorStop(1, '#0b1626');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(247,151,30,0.55)';
    ctx.lineWidth = Math.max(2, size * 3 / 380);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 60; i++) {
        const angle = (Math.PI * 2 / 60) * i - Math.PI / 2;
        const isHour = i % 5 === 0;
        const outerR = R - size * 8 / 380;
        const innerR = isHour ? R - size * 24 / 380 : R - size * 14 / 380;
        ctx.strokeStyle = isHour ? '#ffd700' : 'rgba(255,215,0,0.32)';
        ctx.lineWidth = isHour ? Math.max(2, size * 3 / 380) : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
        ctx.lineTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
        ctx.stroke();
    }
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${Math.round(size * 24 / 380)}px -apple-system, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
        const angle = (Math.PI * 2 / 12) * i - Math.PI / 2;
        const numR = R - size * 48 / 380;
        ctx.fillText(String(i), cx + Math.cos(angle) * numR, cy + Math.sin(angle) * numR);
    }
    const h = displayDate.getHours() % 12;
    const m = displayDate.getMinutes();
    const s = displayDate.getSeconds();
    const ms = displayDate.getMilliseconds();
    const hAngle = ((h + m / 60 + s / 3600) / 12) * Math.PI * 2;
    const mAngle = ((m + s / 60) / 60) * Math.PI * 2;
    const sAngle = ((s + ms / 1000) / 60) * Math.PI * 2;
    let a1, a2;
    if (Math.abs(hAngle - mAngle) <= Math.PI) { a1 = Math.min(hAngle, mAngle); a2 = Math.max(hAngle, mAngle); }
    else { a1 = Math.max(hAngle, mAngle); a2 = Math.min(hAngle, mAngle) + Math.PI * 2; }
    const sectorR = R - size * 30 / 380;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, sectorR, a1 - Math.PI / 2, a2 - Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 215, 0, 0.16)';
    ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(hAngle);
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(4, size * 8 / 380);
    ctx.beginPath(); ctx.moveTo(0, size * 12 / 380); ctx.lineTo(0, -size * 85 / 380); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,215,0,0.65)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -size * 20 / 380); ctx.lineTo(0, -size * 82 / 380); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(mAngle);
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, size * 5 / 380);
    ctx.beginPath(); ctx.moveTo(0, size * 16 / 380); ctx.lineTo(0, -size * 125 / 380); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,215,0,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -size * 30 / 380); ctx.lineTo(0, -size * 122 / 380); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(sAngle);
    ctx.strokeStyle = '#ff4d4d'; ctx.lineCap = 'round'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, size * 24 / 380); ctx.lineTo(0, -size * 142 / 380); ctx.stroke();
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(0, -size * 142 / 380, Math.max(2, size * 4 / 380), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, size * 24 / 380, Math.max(2, size * 4 / 380), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0b1626';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(6, size * 14 / 380), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = Math.max(2, size * 3 / 380); ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, size * 5 / 380), 0, Math.PI * 2); ctx.fill();
    const hDeg = ((h + m / 60 + s / 3600) / 12) * 360;
    const mDeg = ((m + s / 60) / 60) * 360;
    let diffDeg = Math.abs(hDeg - mDeg);
    if (diffDeg > 180) diffDeg = 360 - diffDeg;
    const hEl = document.getElementById('hourAngleVal');
    const mEl = document.getElementById('minuteAngleVal');
    const bEl = document.getElementById('betweenAngleVal');
    if (hEl) { const v = hDeg.toFixed(1) + '°'; if (hEl.textContent !== v) hEl.textContent = v; }
    if (mEl) { const v = mDeg.toFixed(1) + '°'; if (mEl.textContent !== v) mEl.textContent = v; }
    if (bEl) { const v = diffDeg.toFixed(1) + '°'; if (bEl.textContent !== v) bEl.textContent = v; }
    const digital = document.getElementById('clockDigital');
    if (digital) {
        const t = String(displayDate.getHours()).padStart(2, '0') + ':' + String(displayDate.getMinutes()).padStart(2, '0') + ':' + String(displayDate.getSeconds()).padStart(2, '0');
        if (digital.textContent !== t) digital.textContent = t;
    }
    const status = getClockStatus();
    const statusEl = document.getElementById('clockStatus');
    if (statusEl) {
        if (statusEl.textContent !== status.text) statusEl.textContent = status.text;
        statusEl.classList.toggle('in-class', status.inClass);
    }
}
window.toggleClock = toggleClock;

// ==================== 校历 ====================
let calendarData = { schoolYear: '', term: '', termLabel: '', startDate: '', endDate: '', holidays: {}, makeupDays: {}, customEvents: {}, lastSync: '', startDateUserSet: false, endDateUserSet: false };
let manualEditMode = false;
let pickDateMode = null;

function pickDateFor(which) {
    if (pickDateMode === which) {
        pickDateMode = null;
    } else {
        pickDateMode = which;
    }
    document.getElementById('calStartDateValue').classList.toggle('picking', pickDateMode === 'start');
    document.getElementById('calEndDateValue').classList.toggle('picking', pickDateMode === 'end');
    document.getElementById('calendarGrid').classList.toggle('editing', !!pickDateMode || manualEditMode);
}
function applyPendingDate(dateStr) {
    if (!pickDateMode) return false;
    if (pickDateMode === 'start') {
        if (calendarData.endDate && dateStr > calendarData.endDate) { alert('开学日不能晚于期末日'); return true; }
        calendarData.startDate = dateStr;
        calendarData.startDateUserSet = true;
        const d = new Date(dateStr + 'T00:00:00');
        const y = d.getFullYear(), m = d.getMonth() + 1;
        const ay = (m >= 9 || m === 1) ? (m === 1 ? y - 1 : y) : y - 1;
        const term = (m >= 9 || m === 1) ? '第一学期' : '第二学期';
        calendarData.schoolYear = `${ay}–${ay + 1}`;
        calendarData.term = term;
        calendarData.termLabel = term === '第一学期' ? '秋季' : '春季';
    } else {
        if (calendarData.startDate && dateStr < calendarData.startDate) { alert('期末日不能早于开学日'); return true; }
        calendarData.endDate = dateStr;
        calendarData.endDateUserSet = true;
    }
    saveCalendarData();
    pickDateMode = null;
    document.getElementById('calStartDateValue').classList.remove('picking');
    document.getElementById('calEndDateValue').classList.remove('picking');
    renderCalendar();
    return true;
}
function syncDateDisplay() {
    const s = document.getElementById('calStartDateValue');
    const e = document.getElementById('calEndDateValue');
    if (s) s.textContent = calendarData.startDate || '未设置';
    if (e) e.textContent = calendarData.endDate || '未设置';
}

function editDateValue(which) {
    const el = document.getElementById(which === 'start' ? 'calStartDateValue' : 'calEndDateValue');
    if (!el || el.contentEditable === 'true') return;

    const currentVal = which === 'start' ? (calendarData.startDate || '') : (calendarData.endDate || '');
    el.textContent = currentVal;
    el.contentEditable = 'true';
    el.classList.add('editing');
    el.focus();

    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    el.onblur = () => commitDateEdit(which, el);
    el.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            el.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            el.onblur = null;
            el.contentEditable = 'false';
            el.classList.remove('editing');
            syncDateDisplay();
        }
    };
}

function commitDateEdit(which, el) {
    el.contentEditable = 'false';
    el.classList.remove('editing');
    el.onblur = null;
    el.onkeydown = null;

    const val = el.textContent.trim();

    // 支持 2026-09-01 / 2026-9-1 / 2026/9/1 / 2026.9.1 / 2026年9月1日
    const m = val.match(/^(\d{4})[-/.．年](\d{1,2})[-/.．月](\d{1,2})日?$/);
    if (!m) {
        flashToast('❌ 格式错误，请用 2026-09-01');
        syncDateDisplay();
        return;
    }
    const normalized = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;

    // 验证日期真实存在（拒绝 2026-02-30 这种）
    const testDate = new Date(normalized + 'T00:00:00');
    if (isNaN(testDate.getTime())
        || testDate.getFullYear() !== parseInt(m[1])
        || (testDate.getMonth() + 1) !== parseInt(m[2])
        || testDate.getDate() !== parseInt(m[3])) {
        flashToast('❌ 日期无效：' + normalized);
        syncDateDisplay();
        return;
    }

    if (which === 'start') {
        if (calendarData.endDate && normalized > calendarData.endDate) {
            flashToast('❌ 开学日不能晚于期末日');
            syncDateDisplay();
            return;
        }
        calendarData.startDate = normalized;
        calendarData.startDateUserSet = true;
        const d = new Date(normalized + 'T00:00:00');
        const y = d.getFullYear(), mm = d.getMonth() + 1;
        const ay = (mm >= 9 || mm === 1) ? (mm === 1 ? y - 1 : y) : y - 1;
        const term = (mm >= 9 || mm === 1) ? '第一学期' : '第二学期';
        calendarData.schoolYear = `${ay}–${ay + 1}`;
        calendarData.term = term;
        calendarData.termLabel = term === '第一学期' ? '秋季' : '春季';
        flashToast('✅ 开学日：' + normalized);
    } else {
        if (calendarData.startDate && normalized < calendarData.startDate) {
            flashToast('❌ 期末日不能早于开学日');
            syncDateDisplay();
            return;
        }
        calendarData.endDate = normalized;
        calendarData.endDateUserSet = true;
        flashToast('✅ 期末日：' + normalized);
    }

    saveCalendarData();
    renderCalendar();
}

function editEndDate() {
    const input = document.getElementById('calendarEndDateInput');
    if (!input) return;
    input.value = calendarData.endDate || '';
    try {
        if (input.showPicker) input.showPicker();
        else input.click();
    } catch(e) { input.click(); }
}
function setEndDate(v) {
    if (!v) return;
    calendarData.endDate = v;
    calendarData.endDateUserSet = true;
    saveCalendarData();
    renderCalendar();
    flashToast('✅ 学期结束日已更新');
}
function getTermContext(d) {
    const y = d.getFullYear(), m = d.getMonth() + 1;
    let ay, term;
    if (m >= 9 || m === 1) { ay = (m === 1) ? y - 1 : y; term = '第一学期'; }
    else { ay = y - 1; term = '第二学期'; }
    return {
        schoolYear: `${ay}–${ay + 1}`,
        term,
        termLabel: term === '第一学期' ? '秋季' : '春季',
        defaultStartDate: term === '第一学期' ? `${ay}-09-01` : `${ay + 1}-02-15`,
        defaultEndDate: term === '第一学期' ? `${ay + 1}-01-20` : `${ay + 1}-07-10`
    };
}
function loadCalendarData() {
    try {
        const saved = localStorage.getItem(CALENDAR_KEY);
        if (saved) {
            calendarData = JSON.parse(saved);
            if (!calendarData.holidays) calendarData.holidays = {};
            if (!calendarData.makeupDays) calendarData.makeupDays = {};
            if (!calendarData.customEvents) calendarData.customEvents = {};
            if (calendarData.startDateUserSet === undefined) calendarData.startDateUserSet = false;
            if (calendarData.endDateUserSet === undefined) calendarData.endDateUserSet = false;
        } else {
            calendarData = { schoolYear: '', term: '', termLabel: '', startDate: '', endDate: '', holidays: {}, makeupDays: {}, customEvents: {}, lastSync: '', startDateUserSet: false, endDateUserSet: false };
        }
        const ctx = (calendarData.startDateUserSet && calendarData.startDate)
            ? getTermContext(new Date(calendarData.startDate + 'T00:00:00'))
            : getTermContext(new Date());
        if (!calendarData.startDateUserSet) calendarData.startDate = ctx.defaultStartDate;
        if (!calendarData.endDateUserSet) calendarData.endDate = ctx.defaultEndDate;
        calendarData.schoolYear = ctx.schoolYear;
        calendarData.term = ctx.term;
        calendarData.termLabel = ctx.termLabel;
        saveCalendarData();
    } catch(e) { console.warn('读取校历失败：', e); }
}
function saveCalendarData() {
    try { localStorage.setItem(CALENDAR_KEY, JSON.stringify(calendarData)); }
    catch(e) { console.warn('保存校历失败：', e); }
}
function toggleCalendar() {
    const drawer = document.getElementById('calendarDrawer');
    const handle = document.getElementById('calendarHandle');
    const isOpen = drawer.classList.toggle('open');
    handle.classList.toggle('hidden', isOpen);
    if (isOpen) {
        renderCalendar();
        requestAnimationFrame(() => requestAnimationFrame(scrollCalendarToToday));
    }
}
function scrollCalendarToToday() {
    const wrap = document.getElementById('calendarGridWrap');
    if (!wrap) return;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const el = wrap.querySelector(`.calendar-day[data-date="${todayStr}"]`);
    if (!el) return;
    const wrapRect = wrap.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = (elRect.left + elRect.width / 2) - (wrapRect.left + wrapRect.width / 2);
    if (Math.abs(delta) > 4) wrap.scrollLeft = wrap.scrollLeft + delta;
}
function getCalendarDateStatus(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'today';
    if (d < today) return 'past';
    const custom = calendarData.customEvents[dateStr];
    if (custom) return custom.type === 'makeup' ? 'makeup-workday' : 'holiday';
    if (calendarData.holidays[dateStr]) return 'holiday';
    if (calendarData.makeupDays[dateStr]) return 'makeup-workday';
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return 'weekend';
    return 'future-workday';
}
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const titleEl = document.getElementById('calendarTermTitle');
    const wrapEl = document.getElementById('calendarGridWrap');
    if (!grid || !titleEl || !wrapEl) return;
    const prevScroll = wrapEl.scrollLeft;
    if (calendarData.schoolYear && calendarData.term) {
        titleEl.innerHTML = `<div>${calendarData.schoolYear} 学年</div><div>${calendarData.term}</div><div>${calendarData.termLabel || ''}</div>`;
    } else {
        titleEl.innerHTML = '<div>未设置学期</div>';
    }
    let startDate;
    if (calendarData.startDate) startDate = new Date(calendarData.startDate + 'T00:00:00');
    else startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    let endDate;
    if (calendarData.endDate) endDate = new Date(calendarData.endDate + 'T00:00:00');
    else {
        const y = new Date().getFullYear(), m = new Date().getMonth() + 1;
        const ay = m >= 8 ? y : y - 1;
        endDate = calendarData.term === '第二学期' ? new Date(ay + 1, 6, 10) : new Date(ay + 1, 0, 20);
    }
    endDate.setHours(0, 0, 0, 0);
    const startDow = startDate.getDay();
    const startOffset = (startDow === 0) ? 6 : startDow - 1;
    const firstMonday = new Date(startDate);
    firstMonday.setDate(firstMonday.getDate() - startOffset);
    const endDow = endDate.getDay();
    const endOffset = (endDow === 0) ? 0 : 7 - endDow;
    const lastSunday = new Date(endDate);
    lastSunday.setDate(lastSunday.getDate() + endOffset);
    const weeks = [];
    let cursor = new Date(firstMonday);
    let weekIdx = 1;
    while (cursor <= lastSunday) {
        const week = { weekNum: weekIdx, days: [] };
        for (let i = 0; i < 7; i++) { week.days.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
        weeks.push(week); weekIdx++;
    }
    let html = '';
    html += `<div class="cal-corner"></div>`;
    weeks.forEach(w => { html += `<div class="cal-week-header">第${w.weekNum}周</div>`; });
    const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
    for (let di = 0; di < 7; di++) {
        html += `<div class="cal-day-header">${dayNames[di]}</div>`;
        weeks.forEach(w => {
            const d = w.days[di];
            if (d < startDate || d > endDate) { html += `<div class="calendar-day blank"></div>`; return; }
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const status = getCalendarDateStatus(dateStr);
            const custom = calendarData.customEvents[dateStr];
            const hInfo = calendarData.holidays[dateStr];
            const mInfo = calendarData.makeupDays[dateStr];
            let tag = '';
            if (custom && custom.name) tag = custom.name.length > 2 ? custom.name.slice(0, 2) : custom.name;
            else if (hInfo && hInfo.name) tag = hInfo.name.length > 2 ? hInfo.name.slice(0, 2) : hInfo.name;
            else if (mInfo && mInfo.name) tag = '补';
            const isMonthStart = d.getDate() === 1;
            const monthLabel = isMonthStart ? `<span class="day-month">${d.getMonth() + 1}月</span>` : '';
            html += `<div class="calendar-day ${status}" data-date="${dateStr}" title="${dateStr}${tag ? ' · ' + tag : ''}">${monthLabel}<span class="day-num">${d.getDate()}</span>${tag ? `<span class="day-tag">${tag}</span>` : ''}</div>`;
        });
    }
    grid.innerHTML = html;
    grid.style.setProperty('--num-weeks', weeks.length);
    const n = weeks.length;
    grid.classList.toggle('compact', n > 20 && n <= 24);
    grid.classList.toggle('tiny', n > 24);
    wrapEl.scrollLeft = prevScroll;
    if (manualEditMode) grid.classList.add('editing'); else grid.classList.remove('editing');
    updateCalendarStats();
    syncDateDisplay();
}
function updateCalendarStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let end;
    if (calendarData.endDate) end = new Date(calendarData.endDate + 'T00:00:00');
    else end = new Date(today.getFullYear(), 11, 31);
    let workdays = 0, holidays = 0;
    const cursor = new Date(today);
    while (cursor <= end) {
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        const status = getCalendarDateStatus(dateStr);
        if (status === 'holiday' || status === 'weekend') holidays++;
        else if (status === 'future-workday' || status === 'today' || status === 'makeup-workday') workdays++;
        cursor.setDate(cursor.getDate() + 1);
    }
    document.getElementById('statRemainingWorkdays').textContent = workdays + ' 天';
    document.getElementById('statRemainingHolidays').textContent = holidays + ' 天';
}
async function syncCalendar() {
    const btn = document.getElementById('calendarSyncBtn');
    btn.disabled = true; btn.textContent = '⏳ 同步中...';
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    const ay = m >= 8 ? y : y - 1;
    const years = [ay, ay + 1];
    const allHolidays = {};
    let success = false;
    for (const year of years) {
        try { const data = await fetchHolidayCnYear(year); if (Object.keys(data.holidays).length > 0) { Object.assign(allHolidays, data.holidays); success = true; } }
        catch(e) { console.warn(`holiday-cn ${year} 失败：`, e); }
    }
    if (!success) {
        for (const year of years) {
            try { const data = await fetchTimorYear(year); if (Object.keys(data.holidays).length > 0) { Object.assign(allHolidays, data.holidays); success = true; } }
            catch(e) { console.warn(`timor.tech ${year} 失败：`, e); }
        }
    }
    if (success) {
        calendarData.holidays = allHolidays;
        calendarData.lastSync = new Date().toLocaleString('zh-CN', { hour12: false });
        if (!calendarData.startDate) calendarData.startDate = `${ay}-09-01`;
        saveCalendarData(); renderCalendar();
        flashToast('✅ 同步成功');
    } else alert('❌ 同步失败，请稍后重试，或使用"手动选择节假日"。');
    btn.disabled = false; btn.textContent = '同步法定节假日';
}
async function fetchHolidayCnYear(year) {
    const url = `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const holidays = {};
    (json.days || []).forEach(item => { if (item.date && item.isOffDay) holidays[item.date] = { name: item.name || '节日', type: 'holiday' }; });
    return { holidays };
}
async function fetchTimorYear(year) {
    const url = `https://timor.tech/api/holiday/year/${year}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const raw = json.holiday || {};
    const holidays = {};
    for (const key in raw) {
        const item = raw[key];
        if (!item || !item.date) continue;
        if (item.holiday === true) holidays[item.date] = { name: item.name || '节日', type: 'holiday' };
    }
    return { holidays };
}
function toggleManualEdit() {
    manualEditMode = !manualEditMode;
    const btn = document.getElementById('calendarManualBtn');
    if (manualEditMode) { btn.textContent = '✅ 完成保存'; btn.classList.add('active'); }
    else { btn.textContent = '手动选择节假日'; btn.classList.remove('active'); saveCalendarData(); flashToast('✅ 已保存'); }
    renderCalendar();
}
function cycleDateState(dateStr) {
    const custom = calendarData.customEvents[dateStr];
    let cur;
    if (custom) cur = custom.type;
    else if (calendarData.holidays[dateStr]) cur = 'holiday';
    else if (calendarData.makeupDays[dateStr]) cur = 'makeup';
    else cur = 'normal';
    delete calendarData.customEvents[dateStr];
    delete calendarData.holidays[dateStr];
    delete calendarData.makeupDays[dateStr];
    if (cur === 'normal') calendarData.customEvents[dateStr] = { name: '假期', type: 'holiday' };
    else if (cur === 'holiday') calendarData.customEvents[dateStr] = { name: '补班', type: 'makeup' };
}

// ==================== 事件绑定 & 初始化 ====================
document.getElementById('notePanelText').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNotePanel(); }
    if (e.key === 'Escape') { e.preventDefault(); closeNotePanel(); }
});
document.getElementById('calendarGrid').addEventListener('click', e => {
    const day = e.target.closest('.calendar-day');
    if (!day || day.classList.contains('blank')) return;
    const dateStr = day.dataset.date;
    if (!dateStr) return;
    if (applyPendingDate(dateStr)) return;
    if (manualEditMode) { cycleDateState(dateStr); saveCalendarData(); renderCalendar(); }
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pickDateMode) {
        e.preventDefault();
        pickDateMode = null;
        document.getElementById('calStartDateValue').classList.remove('picking');
        document.getElementById('calEndDateValue').classList.remove('picking');
        document.getElementById('calendarGrid').classList.remove('editing');
        flashToast('已取消');
    }
});

loadCalendarData();
renderWorkFocus();
loadData();
renderTable();
startCurrentPeriodTimer();
renderCalendar();
syncDateDisplay();