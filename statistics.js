// 班级管理系统 | Copyright (c) 2026 黄迁胜 | 根据 MIT 许可证授权
// ================================================================
//  自由维度统计引擎（独立拆分 + 旋转自适应）
// ================================================================

(function() {
    'use strict';

    // ---------- 班级 & 维度 ----------
    const params = new URLSearchParams(window.location.search);
    const CURRENT_CLASS = params.get('classId') || params.get('class') || localStorage.getItem('currentClassId') || '一班';
    document.getElementById('classDisplay').textContent = '🏫 班级：' + CURRENT_CLASS;

    const CATEGORIES_KEYS = ['安全', '道德', '艺体', '学习', '纪律', '卫生', '仪态', '就餐', '住宿', '走读'];
    const SUBJECTS_KEYS = ['语文', '数学', '英语', '物理', '化学', '历史', '地理', '生物', '政治'];
    const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

    const DIM_GROUPS = {
        time: ['date', 'week'],
        unit: ['student', 'group'],
        type: ['subject', 'dimension']
    };
    const DIM_LABELS = {
        week: '📅 周次', date: '📅 日期',
        group: '🏷️ 小组', student: '👤 学生',
        subject: '📚 学科', dimension: '🎯 维度'
    };

    // ---------- 数据 ----------
    let rawHistory = [];
    let rawDaily = {};
    let allStudentsInfo = [];
    let allDates = [];

    // ---------- 状态 ----------
    const state = {
        chartType: 'bar',
        aggMode: 'avg',
        xAxis: 'week',
        splitDim: 'student',
        isRotated: false,
        selectedWeeks: [],
        selectedDays: [],
        selectedGroups: [],
        selectedStudents: [],
        selectedSubjects: [],
        selectedDimensions: [],
        startDate: null,
        endDate: null,
        pureMode: false
    };

    // ---------- 存储键 ----------
    const STORAGE_PREFIX = 'stats_freedom_';
    const DATE_RANGE_KEY = STORAGE_PREFIX + 'date_range_' + CURRENT_CLASS;
    const SELECTED_DAYS_KEY = STORAGE_PREFIX + 'selected_days_' + CURRENT_CLASS;
    const SELECTED_WEEKS_KEY = STORAGE_PREFIX + 'selected_weeks_' + CURRENT_CLASS;
    const CONFIG_KEY = STORAGE_PREFIX + 'config_' + CURRENT_CLASS;
    const FILTERS_KEY = STORAGE_PREFIX + 'filters_' + CURRENT_CLASS;

    // ---------- 存储辅助 ----------
    function saveDateRange() {
        try { localStorage.setItem(DATE_RANGE_KEY, JSON.stringify({ start: state.startDate, end: state.endDate })); } catch (e) {}
    }
    function loadDateRange() {
        try {
            const raw = localStorage.getItem(DATE_RANGE_KEY);
            if (raw) { const data = JSON.parse(raw); if (data.start) state.startDate = data.start; if (data.end) state.endDate = data.end; }
        } catch (e) {}
    }
    function saveSelectedDays() {
        try { localStorage.setItem(SELECTED_DAYS_KEY, JSON.stringify(state.selectedDays)); } catch (e) {}
    }
    function loadSelectedDays() {
        try {
            const raw = localStorage.getItem(SELECTED_DAYS_KEY);
            if (raw) { const data = JSON.parse(raw); if (Array.isArray(data)) state.selectedDays = data; }
        } catch (e) {}
    }
    function saveSelectedWeeks() {
        try { localStorage.setItem(SELECTED_WEEKS_KEY, JSON.stringify(state.selectedWeeks)); } catch (e) {}
    }
    function loadSelectedWeeks() {
        try {
            const raw = localStorage.getItem(SELECTED_WEEKS_KEY);
            if (raw) { const data = JSON.parse(raw); if (Array.isArray(data)) state.selectedWeeks = data; }
        } catch (e) {}
    }
    function saveConfig() {
        try {
            const cfg = {
                chartType: state.chartType,
                aggMode: state.aggMode,
                xAxis: state.xAxis,
                splitDim: state.splitDim,
                isRotated: state.isRotated
            };
            localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
        } catch (e) {}
    }
    function loadConfig() {
        try {
            const raw = localStorage.getItem(CONFIG_KEY);
            if (raw) {
                const cfg = JSON.parse(raw);
                if (cfg.chartType) state.chartType = cfg.chartType;
                if (cfg.aggMode) state.aggMode = cfg.aggMode;
                if (cfg.xAxis) state.xAxis = cfg.xAxis;
                if (cfg.splitDim) state.splitDim = cfg.splitDim;
                if (cfg.isRotated !== undefined) state.isRotated = cfg.isRotated;
                return true;
            }
        } catch (e) {}
        return false;
    }
    function saveFilters() {
        try {
            const f = {
                groups: state.selectedGroups,
                students: state.selectedStudents,
                subjects: state.selectedSubjects,
                dimensions: state.selectedDimensions
            };
            localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
        } catch (e) {}
    }
    function loadFilters() {
        try {
            const raw = localStorage.getItem(FILTERS_KEY);
            if (raw) {
                const f = JSON.parse(raw);
                if (f.groups) state.selectedGroups = f.groups;
                if (f.students) state.selectedStudents = f.students;
                if (f.subjects) state.selectedSubjects = f.subjects;
                if (f.dimensions) state.selectedDimensions = f.dimensions;
                return true;
            }
        } catch (e) {}
        return false;
    }

    // ---------- 工具 ----------
    function getHierarchyState(selected, all) {
        if (!all || all.length === 0) return 'none';
        const selectedCount = selected.filter(item => all.includes(item)).length;
        if (selectedCount === 0) return 'none';
        if (selectedCount === all.length) return 'all';
        return 'partial';
    }
    function getStateSymbol(s) {
        if (s === 'all') return '☑';
        if (s === 'partial') return '☒';
        return '☐';
    }
    function getDimGroup(dim) {
        if (dim === 'date' || dim === 'week') return 'time';
        if (dim === 'student' || dim === 'group') return 'unit';
        if (dim === 'subject' || dim === 'dimension') return 'type';
        return null;
    }
    function getDimLabel(dim) {
        return DIM_LABELS[dim] || dim;
    }

    // ---------- 数据加载 ----------
    function loadAllData() {
        const classData = DataManager.loadClassData(CURRENT_CLASS);
        const students = classData ? classData.students : [];
        rawHistory = DataManager.loadHistory(CURRENT_CLASS);
        rawDaily = DataManager.loadAllDailySnapshots(CURRENT_CLASS);

        if (Object.keys(rawDaily).length === 0 && students.length > 0) {
            const today = new Date().toISOString().slice(0, 10);
            const snapshot = students.map(s => ({
                id: s.id,
                name: s.name,
                groupName: s.groupName || '未分组',
                cats: s.cats ? [...s.cats] : CATEGORIES_KEYS.map(() => 0),
                subjects: SUBJECTS_KEYS.map(sub => s['subject_' + sub] || 0)
            }));
            DataManager.saveDailySnapshot(today, snapshot, CURRENT_CLASS);
            rawDaily[today] = snapshot;
        }

        if (rawHistory.length === 0 && Object.keys(rawDaily).length === 0 && students.length > 0) {
            const week = DataManager.loadWeek(CURRENT_CLASS);
            const snapshot = students.map(s => ({
                id: s.id,
                name: s.name,
                groupName: s.groupName || '未分组',
                seatOrder: s.seatOrder || 0,
                duty: s.duty || '',
                animal: s.animal || '🐱',
                petState: s.petState || 'normal',
                cats: s.cats ? [...s.cats] : CATEGORIES_KEYS.map(() => 0),
                subjects: SUBJECTS_KEYS.map(sub => s['subject_' + sub] || 0)
            }));
            rawHistory.push({ week: week, data: snapshot, timestamp: new Date().toISOString() });
            DataManager.saveHistory(rawHistory, CURRENT_CLASS);
        }

        if (rawHistory.length > 0 && rawHistory[rawHistory.length - 1].data) {
            allStudentsInfo = rawHistory[rawHistory.length - 1].data.map(s => ({ name: s.name, group: s.groupName || '未分组' }));
        } else {
            const dates = Object.keys(rawDaily).sort();
            if (dates.length > 0) {
                const snap = rawDaily[dates[dates.length - 1]];
                if (snap) allStudentsInfo = snap.map(s => ({ name: s.name, group: s.groupName || '未分组' }));
            } else if (students.length > 0) {
                allStudentsInfo = students.map(s => ({ name: s.name, group: s.groupName || '未分组' }));
            }
        }

        allDates = Object.keys(rawDaily).sort();
    }

    // ---------- 周次 ↔ 日期 ----------
    function getWeekNumber(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
        const week1 = new Date(d.getFullYear(), 0, 4);
        return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    }
    function getDatesForWeek(weekNum) {
        return allDates.filter(d => getWeekNumber(d) === weekNum);
    }
    function getAllWeeks() {
        const weeks = new Set();
        allDates.forEach(d => weeks.add(getWeekNumber(d)));
        return Array.from(weeks).sort((a, b) => a - b);
    }

    // ================================================================
    //  获取总分（所有勾选学科+维度）
    // ================================================================
    function getTotalScore(studentSnap) {
        let sum = 0;
        state.selectedSubjects.forEach(sub => {
            const idx = SUBJECTS_KEYS.indexOf(sub);
            if (idx !== -1) sum += studentSnap.subjects[idx] || 0;
        });
        state.selectedDimensions.forEach(dim => {
            const idx = CATEGORIES_KEYS.indexOf(dim);
            if (idx !== -1) sum += studentSnap.cats[idx] || 0;
        });
        return sum;
    }

    // ================================================================
    //  获取单个学科或维度的分数
    // ================================================================
    function getItemScore(studentSnap, dim, value) {
        if (dim === 'subject') {
            const idx = SUBJECTS_KEYS.indexOf(value);
            return idx !== -1 ? studentSnap.subjects[idx] || 0 : 0;
        } else if (dim === 'dimension') {
            const idx = CATEGORIES_KEYS.indexOf(value);
            return idx !== -1 ? studentSnap.cats[idx] || 0 : 0;
        }
        return 0;
    }

    // ================================================================
    //  获取该维度下的具体值列表
    // ================================================================
    function getDimValues(dim, context) {
        const { includedStudentNames, targetDates } = context;
        if (dim === 'student') {
            return includedStudentNames;
        } else if (dim === 'group') {
            const groups = new Set(allStudentsInfo.filter(s => includedStudentNames.includes(s.name)).map(s => s.group));
            return [...groups].filter(g => g !== '未分组');
        } else if (dim === 'subject') {
            return state.selectedSubjects.filter(d => SUBJECTS_KEYS.includes(d));
        } else if (dim === 'dimension') {
            return state.selectedDimensions.filter(d => CATEGORIES_KEYS.includes(d));
        } else if (dim === 'date') {
            return targetDates;
        } else if (dim === 'week') {
            const weeks = {};
            targetDates.forEach(d => {
                const wn = getWeekNumber(d);
                if (!weeks[wn]) weeks[wn] = [];
                weeks[wn].push(d);
            });
            return Object.keys(weeks).sort((a, b) => parseInt(a) - parseInt(b));
        }
        return [];
    }

    // ================================================================
    //  核心聚合（独立拆分修复 - 全部维度正常工作）
    // ================================================================
    function getFilteredData() {
        // ===== 时间 =====
        if (state.selectedDays.length === 0) return null;
        let targetDates = state.selectedDays.slice().sort((a, b) => a.localeCompare(b));

        // ===== 单位 =====
        let includedStudentNames = [];
        if (state.selectedStudents.length > 0) {
            includedStudentNames = state.selectedStudents;
        } else if (state.selectedGroups.length > 0) {
            includedStudentNames = allStudentsInfo
                .filter(s => state.selectedGroups.includes(s.group))
                .map(m => m.name);
        } else {
            return null;
        }
        includedStudentNames = [...new Set(includedStudentNames)];
        if (includedStudentNames.length === 0) return null;

        // ===== 类型 =====
        if (state.selectedSubjects.length === 0 && state.selectedDimensions.length === 0) return null;

        const context = { includedStudentNames, targetDates };

        // ===== X轴 =====
        const xDim = state.xAxis;
        const xValues = getDimValues(xDim, context);
        if (xValues.length === 0) return null;

        // ===== Y轴聚合方式 =====
        const aggMode = state.aggMode;

        // ===== 确定拆分维度（独立显示模式） =====
        const isRaw = (aggMode === 'raw');
        let splitDim = null;
        let splitValues = [];
        if (isRaw) {
            splitDim = state.splitDim;
            if (splitDim === xDim) {
                const group = getDimGroup(xDim);
                const dims = DIM_GROUPS[group] || [];
                const alt = dims.find(d => d !== xDim);
                if (alt) {
                    splitDim = alt;
                    state.splitDim = alt;
                    saveConfig();
                }
            }
            const rawValues = getDimValues(splitDim, context);
            splitValues = rawValues.filter(v => v !== undefined && v !== null && v !== '');
            if (splitValues.length === 0) {
                const group = getDimGroup(splitDim);
                const dims = DIM_GROUPS[group] || [];
                const alt = dims.find(d => d !== splitDim && d !== xDim);
                if (alt) {
                    splitDim = alt;
                    state.splitDim = alt;
                    saveConfig();
                    splitValues = getDimValues(splitDim, context).filter(v => v !== undefined && v !== null && v !== '');
                }
            }
            if (splitValues.length === 0) return null;
        }

        // ===== 构建结果 =====
        const result = {
            subjects: xValues.map(v => ({ name: v, value: v })),
            dates: targetDates,
            dimensions: [],
            data: {},
            aggMode: aggMode,
            isRaw: isRaw,
            splitDim: splitDim,
            splitValues: splitValues,
            xDim: xDim
        };
        const labelMap = {
            'avg': '📐 平均',
            'sum': '➕ 求和',
            'raw': '📊 独立',
            'ranking': '🏆 排行'
        };
        result.dimensions = [labelMap[aggMode] || aggMode];

        // ===== 计算数据（修复日期/周次拆分） =====
        if (isRaw && splitValues.length > 0) {
            const groups = {};
            const xLabels = xValues;

            splitValues.forEach(sv => {
                groups[sv] = { x: [], y: [], label: sv };
            });

            // 预计算每个 X 值对应的日期列表
            const xDateMap = {};
            xValues.forEach(xVal => {
                let xDateList = [];
                if (xDim === 'date') {
                    xDateList = [xVal];
                } else if (xDim === 'week') {
                    xDateList = getDatesForWeek(parseInt(xVal)).filter(d => targetDates.includes(d));
                } else {
                    xDateList = targetDates;
                }
                xDateMap[xVal] = xDateList;
            });

            // 预计算每个拆分值对应的日期列表
            const splitDateMap = {};
            splitValues.forEach(sv => {
                let splitDateList = [];
                if (splitDim === 'date') {
                    splitDateList = [sv];
                } else if (splitDim === 'week') {
                    splitDateList = getDatesForWeek(parseInt(sv)).filter(d => targetDates.includes(d));
                } else {
                    splitDateList = targetDates;
                }
                splitDateMap[sv] = splitDateList;
            });

            // 外层循环：X 轴每个值
            xValues.forEach(xVal => {
                const xDateList = xDateMap[xVal] || targetDates;

                // 对于每个拆分值，计算该 X 值下的聚合值
                splitValues.forEach(sv => {
                    const splitDateList = splitDateMap[sv] || targetDates;

                    // 取两个日期列表的交集
                    const commonDates = xDateList.filter(d => splitDateList.includes(d));
                    if (commonDates.length === 0) {
                        groups[sv].x.push(xVal);
                        groups[sv].y.push(0);
                        return;
                    }

                    let values = [];

                    // 确定该 X 值对应的学生列表
                    let xStudents = [];
                    if (xDim === 'student') {
                        xStudents = [xVal];
                    } else if (xDim === 'group') {
                        xStudents = allStudentsInfo.filter(s => s.group === xVal && includedStudentNames.includes(s.name)).map(m => m.name);
                    } else if (xDim === 'subject' || xDim === 'dimension') {
                        xStudents = includedStudentNames;
                    } else if (xDim === 'date' || xDim === 'week') {
                        xStudents = includedStudentNames;
                    } else {
                        xStudents = includedStudentNames;
                    }

                    // 确定该拆分值对应的学生列表
                    let splitStudents = [];
                    if (splitDim === 'student') {
                        splitStudents = [sv];
                    } else if (splitDim === 'group') {
                        splitStudents = allStudentsInfo.filter(s => s.group === sv && includedStudentNames.includes(s.name)).map(m => m.name);
                    } else if (splitDim === 'subject' || splitDim === 'dimension') {
                        splitStudents = includedStudentNames;
                    } else if (splitDim === 'date' || splitDim === 'week') {
                        splitStudents = includedStudentNames;
                    } else {
                        splitStudents = includedStudentNames;
                    }

                    const targetStudents = xStudents.filter(name => splitStudents.includes(name));

                    // 遍历公共日期
                    commonDates.forEach(date => {
                        const snap = rawDaily[date];
                        if (!snap) return;
                        targetStudents.forEach(name => {
                            const ss = snap.find(s => s.name === name);
                            if (!ss) return;
                            let val;
                            if (xDim === 'subject') {
                                val = getItemScore(ss, 'subject', xVal);
                            } else if (xDim === 'dimension') {
                                val = getItemScore(ss, 'dimension', xVal);
                            } else {
                                if (splitDim === 'subject') {
                                    const idx = SUBJECTS_KEYS.indexOf(sv);
                                    if (idx !== -1) val = ss.subjects[idx] || 0;
                                    else val = 0;
                                } else if (splitDim === 'dimension') {
                                    const idx = CATEGORIES_KEYS.indexOf(sv);
                                    if (idx !== -1) val = ss.cats[idx] || 0;
                                    else val = 0;
                                } else {
                                    val = getTotalScore(ss);
                                }
                            }
                            if (val !== null && val !== undefined) values.push(val);
                        });
                    });

                    let aggVal = 0;
                    if (values.length > 0) {
                        if (aggMode === 'sum') {
                            aggVal = Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;
                        } else { // avg
                            aggVal = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
                        }
                    }
                    if (!groups[sv]) groups[sv] = { x: [], y: [], label: sv };
                    groups[sv].x.push(xVal);
                    groups[sv].y.push(aggVal);
                });
            });

            result.groups = groups;
            result.splitValues = splitValues;
            result.xLabels = xLabels;
            return result;
        }

        // ===== 非独立模式：普通聚合 =====
        xValues.forEach(xVal => {
            let rawValues = [];

            let xStudents = [];
            if (xDim === 'student') {
                xStudents = [xVal];
            } else if (xDim === 'group') {
                xStudents = allStudentsInfo.filter(s => s.group === xVal && includedStudentNames.includes(s.name)).map(m => m.name);
            } else if (xDim === 'subject' || xDim === 'dimension') {
                xStudents = includedStudentNames;
            } else if (xDim === 'date' || xDim === 'week') {
                xStudents = includedStudentNames;
            }

            let xDates = [];
            if (xDim === 'date') {
                xDates = [xVal];
            } else if (xDim === 'week') {
                xDates = getDatesForWeek(parseInt(xVal)).filter(d => targetDates.includes(d));
            } else {
                xDates = targetDates;
            }

            xDates.forEach(date => {
                const snap = rawDaily[date];
                if (!snap) return;
                xStudents.forEach(name => {
                    const ss = snap.find(s => s.name === name);
                    if (!ss) return;
                    let val;
                    if (xDim === 'subject') {
                        val = getItemScore(ss, 'subject', xVal);
                    } else if (xDim === 'dimension') {
                        val = getItemScore(ss, 'dimension', xVal);
                    } else {
                        val = getTotalScore(ss);
                    }
                    if (val !== null && val !== undefined) rawValues.push(val);
                });
            });

            let finalValue;
            if (aggMode === 'sum') {
                finalValue = Math.round(rawValues.reduce((a, b) => a + b, 0) * 10) / 10;
            } else if (aggMode === 'ranking') {
                finalValue = rawValues.length > 0 ? Math.round((rawValues.reduce((a, b) => a + b, 0) / rawValues.length) * 10) / 10 : 0;
            } else {
                finalValue = rawValues.length > 0 ? Math.round((rawValues.reduce((a, b) => a + b, 0) / rawValues.length) * 10) / 10 : 0;
            }

            result.data[xVal] = {
                value: finalValue,
                raw: rawValues,
                count: rawValues.length
            };
        });

        return result;
    }

    // ---------- 渲染：左侧周次 ↔ 日期 ----------
    function formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return (d.getMonth() + 1) + '/' + d.getDate();
    }

    function renderWeekList() {
        const container = document.getElementById('weekListContainer');
        const allWeeks = getAllWeeks();
        if (allWeeks.length === 0) {
            container.innerHTML = '<div style="color:#94a3b8;font-size:13px;">暂无数据</div>';
            return;
        }

        let start = state.startDate ? new Date(state.startDate + 'T00:00:00') : new Date(allDates[0] + 'T00:00:00');
        let end = state.endDate ? new Date(state.endDate + 'T00:00:00') : new Date(allDates[allDates.length - 1] + 'T00:00:00');
        const startWeek = getWeekNumber(start.toISOString().slice(0, 10));
        const endWeek = getWeekNumber(end.toISOString().slice(0, 10));
        const filteredWeeks = allWeeks.filter(w => w >= startWeek && w <= endWeek);

        if (filteredWeeks.length === 0) {
            container.innerHTML = '<div style="color:#94a3b8;font-size:13px;">当前日期范围内无周次</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        const wrapper = document.createElement('div');
        wrapper.className = 'week-list';

        const weekState = getHierarchyState(state.selectedWeeks, filteredWeeks);
        const weekSymbol = getStateSymbol(weekState);
        const masterDiv = document.createElement('div');
        masterDiv.className = 'week-master';
        masterDiv.id = 'weekMasterLabel';
        masterDiv.innerHTML = `
            <input type="checkbox" id="weekMaster" ${weekState === 'all' ? 'checked' : ''} />
            <span>📅 全部周次</span>
            <span class="state-indicator">${weekSymbol}</span>
        `;
        wrapper.appendChild(masterDiv);

        const headerDiv = document.createElement('div');
        headerDiv.className = 'day-header-global';
        WEEK_DAYS.forEach(day => {
            const span = document.createElement('span');
            span.textContent = day;
            headerDiv.appendChild(span);
        });
        wrapper.appendChild(headerDiv);

        filteredWeeks.forEach(wn => {
            const datesInWeek = getDatesForWeek(wn).filter(d => {
                const dObj = new Date(d + 'T00:00:00');
                const startObj = state.startDate ? new Date(state.startDate + 'T00:00:00') : new Date(0);
                const endObj = state.endDate ? new Date(state.endDate + 'T00:00:00') : new Date(8640000000000000);
                return dObj >= startObj && dObj <= endObj;
            });
            if (datesInWeek.length === 0) return;

            const weekSelected = state.selectedWeeks.includes(wn);
            const allDaysSelected = datesInWeek.every(d => state.selectedDays.includes(d));
            const someDaysSelected = datesInWeek.some(d => state.selectedDays.includes(d));
            const dayState = allDaysSelected ? 'all' : (someDaysSelected ? 'partial' : 'none');
            const daySymbol = getStateSymbol(dayState);
            const weekClass = weekSelected ? 'active-week' : '';
            const startDisplay = formatDate(datesInWeek[0]);
            const endDisplay = formatDate(datesInWeek[datesInWeek.length - 1]);

            const row = document.createElement('div');
            row.className = `week-row ${weekClass}`;
            row.dataset.week = wn;

            const labelDiv = document.createElement('div');
            labelDiv.className = 'week-label';
            labelDiv.innerHTML = `
                <span style="display:flex;align-items:center;gap:4px;">
                    <input type="checkbox" class="week-checkbox" data-week="${wn}" ${weekSelected ? 'checked' : ''} />
                    <span>第${wn}周</span>
                    <span style="font-size:10px;color:#94a3b8;">${daySymbol}</span>
                </span>
                <span class="week-range">${startDisplay} - ${endDisplay}</span>
            `;
            row.appendChild(labelDiv);

            const dayRow = document.createElement('div');
            dayRow.className = 'day-row';
            datesInWeek.forEach(d => {
                const isActive = state.selectedDays.includes(d);
                const hasData = allDates.includes(d);
                const cls = `day-item${hasData ? ' has-data' : ' no-data'}${isActive ? ' active-day' : ''}`;
                const div = document.createElement('div');
                div.className = cls;
                div.dataset.date = d;
                div.textContent = formatDate(d);
                dayRow.appendChild(div);
            });
            row.appendChild(dayRow);
            wrapper.appendChild(row);
        });

        fragment.appendChild(wrapper);
        container.innerHTML = '';
        container.appendChild(fragment);

        document.getElementById('weekMaster').onchange = function() {
            if (this.checked) {
                filteredWeeks.forEach(wn => {
                    if (!state.selectedWeeks.includes(wn)) state.selectedWeeks.push(wn);
                    getDatesForWeek(wn).forEach(d => {
                        if (!state.selectedDays.includes(d)) state.selectedDays.push(d);
                    });
                });
            } else {
                filteredWeeks.forEach(wn => {
                    state.selectedWeeks = state.selectedWeeks.filter(w => w !== wn);
                    getDatesForWeek(wn).forEach(d => {
                        state.selectedDays = state.selectedDays.filter(dd => dd !== d);
                    });
                });
            }
            saveSelectedWeeks();
            saveSelectedDays();
            renderWeekList();
            updateChart();
        };

        container.querySelectorAll('.week-checkbox').forEach(cb => {
            cb.onchange = function() {
                const wn = parseInt(this.dataset.week);
                const dates = getDatesForWeek(wn);
                if (this.checked) {
                    if (!state.selectedWeeks.includes(wn)) state.selectedWeeks.push(wn);
                    dates.forEach(d => { if (!state.selectedDays.includes(d)) state.selectedDays.push(d); });
                } else {
                    state.selectedWeeks = state.selectedWeeks.filter(w => w !== wn);
                    dates.forEach(d => { state.selectedDays = state.selectedDays.filter(dd => dd !== d); });
                }
                saveSelectedWeeks();
                saveSelectedDays();
                renderWeekList();
                updateChart();
            };
        });

        container.querySelectorAll('.day-item.has-data').forEach(el => {
            el.onclick = function() {
                const date = this.dataset.date;
                const idx = state.selectedDays.indexOf(date);
                if (idx > -1) {
                    state.selectedDays.splice(idx, 1);
                } else {
                    state.selectedDays.push(date);
                }
                state.selectedDays.sort((a, b) => a.localeCompare(b));
                const wn = getWeekNumber(date);
                const datesInWeek = getDatesForWeek(wn);
                const allSelected = datesInWeek.every(d => state.selectedDays.includes(d));
                if (allSelected) {
                    if (!state.selectedWeeks.includes(wn)) state.selectedWeeks.push(wn);
                } else {
                    state.selectedWeeks = state.selectedWeeks.filter(w => w !== wn);
                }
                saveSelectedWeeks();
                saveSelectedDays();
                renderWeekList();
                updateChart();
            };
        });
    }

    // ---------- 渲染：右侧数据类型 ----------
    function renderDimensions() {
        const container = document.getElementById('dimensionList');
        container.innerHTML = '';

        const subjectGroup = document.createElement('div');
        subjectGroup.className = 'dimension-group';
        const subState = getHierarchyState(state.selectedSubjects, SUBJECTS_KEYS);
        const subSymbol = getStateSymbol(subState);
        subjectGroup.innerHTML = `
            <div class="group-title" id="subjectMasterLabel">
                <input type="checkbox" id="subjectMaster" ${subState === 'all' ? 'checked' : ''} />
                <span>📚 学科</span>
                <span class="state-indicator">${subSymbol}</span>
                <span class="toggle-all" id="subjectToggleAll">全选</span>
            </div>
        `;
        const subjectItems = document.createElement('div');
        subjectItems.style.paddingLeft = '0';
        SUBJECTS_KEYS.forEach(d => {
            const div = document.createElement('div');
            div.className = 'dim-item';
            const checked = state.selectedSubjects.includes(d);
            div.innerHTML = `
                <input type="checkbox" class="subject-checkbox" value="${d}" ${checked ? 'checked' : ''} />
                <label>${d}</label>
            `;
            subjectItems.appendChild(div);
        });
        subjectGroup.appendChild(subjectItems);
        container.appendChild(subjectGroup);

        const dimGroup = document.createElement('div');
        dimGroup.className = 'dimension-group';
        const dimState = getHierarchyState(state.selectedDimensions, CATEGORIES_KEYS);
        const dimSymbol = getStateSymbol(dimState);
        dimGroup.innerHTML = `
            <div class="group-title" id="dimensionMasterLabel">
                <input type="checkbox" id="dimensionMaster" ${dimState === 'all' ? 'checked' : ''} />
                <span>🎯 量化维度</span>
                <span class="state-indicator">${dimSymbol}</span>
                <span class="toggle-all" id="dimensionToggleAll">全选</span>
            </div>
        `;
        const dimItems = document.createElement('div');
        dimItems.style.paddingLeft = '0';
        CATEGORIES_KEYS.forEach(d => {
            const div = document.createElement('div');
            div.className = 'dim-item';
            const checked = state.selectedDimensions.includes(d);
            div.innerHTML = `
                <input type="checkbox" class="dimension-checkbox" value="${d}" ${checked ? 'checked' : ''} />
                <label>${d}</label>
            `;
            dimItems.appendChild(div);
        });
        dimGroup.appendChild(dimItems);
        container.appendChild(dimGroup);

        document.getElementById('subjectMaster').onchange = function() {
            state.selectedSubjects = this.checked ? [...SUBJECTS_KEYS] : [];
            saveFilters();
            renderDimensions();
            updateChart();
        };
        document.querySelectorAll('.subject-checkbox').forEach(cb => {
            cb.onchange = function() {
                const val = this.value;
                if (this.checked) {
                    if (!state.selectedSubjects.includes(val)) state.selectedSubjects.push(val);
                } else {
                    state.selectedSubjects = state.selectedSubjects.filter(d => d !== val);
                }
                saveFilters();
                renderDimensions();
                updateChart();
            };
        });
        document.getElementById('subjectToggleAll').onclick = function(e) {
            e.stopPropagation();
            const allSelected = SUBJECTS_KEYS.every(d => state.selectedSubjects.includes(d));
            state.selectedSubjects = allSelected ? [] : [...SUBJECTS_KEYS];
            saveFilters();
            renderDimensions();
            updateChart();
        };

        document.getElementById('dimensionMaster').onchange = function() {
            state.selectedDimensions = this.checked ? [...CATEGORIES_KEYS] : [];
            saveFilters();
            renderDimensions();
            updateChart();
        };
        document.querySelectorAll('.dimension-checkbox').forEach(cb => {
            cb.onchange = function() {
                const val = this.value;
                if (this.checked) {
                    if (!state.selectedDimensions.includes(val)) state.selectedDimensions.push(val);
                } else {
                    state.selectedDimensions = state.selectedDimensions.filter(d => d !== val);
                }
                saveFilters();
                renderDimensions();
                updateChart();
            };
        });
        document.getElementById('dimensionToggleAll').onclick = function(e) {
            e.stopPropagation();
            const allSelected = CATEGORIES_KEYS.every(d => state.selectedDimensions.includes(d));
            state.selectedDimensions = allSelected ? [] : [...CATEGORIES_KEYS];
            saveFilters();
            renderDimensions();
            updateChart();
        };
    }

    // ---------- 渲染：底部小组 ↔ 学生 ----------
    function renderSubjects() {
        const students = allStudentsInfo;
        const groups = [...new Set(students.map(s => s.group))].sort();
        const groupContainer = document.getElementById('groupList');
        groupContainer.innerHTML = '';

        const groupState = getHierarchyState(state.selectedGroups, groups);
        const groupSymbol = getStateSymbol(groupState);
        document.getElementById('groupMaster').checked = (groupState === 'all');
        document.getElementById('groupMasterIndicator').textContent = groupSymbol;

        groups.forEach(g => {
            const div = document.createElement('span');
            div.className = 'item';
            const checked = state.selectedGroups.includes(g);
            div.innerHTML = `
                <input type="checkbox" class="group-checkbox" value="${g}" ${checked ? 'checked' : ''} />
                <label>${g}</label>
            `;
            groupContainer.appendChild(div);
        });

        groupContainer.querySelectorAll('.group-checkbox').forEach(cb => {
            cb.onchange = function() {
                const val = this.value;
                const members = allStudentsInfo.filter(s => s.group === val).map(m => m.name);
                if (this.checked) {
                    if (!state.selectedGroups.includes(val)) state.selectedGroups.push(val);
                    members.forEach(name => {
                        if (!state.selectedStudents.includes(name)) state.selectedStudents.push(name);
                    });
                } else {
                    state.selectedGroups = state.selectedGroups.filter(g => g !== val);
                    members.forEach(name => {
                        state.selectedStudents = state.selectedStudents.filter(s => s !== name);
                    });
                }
                saveFilters();
                renderSubjects();
                updateStudentList();
                updateChart();
            };
        });

        document.getElementById('groupMasterLabel').onclick = function(e) {
            if (e.target.tagName === 'INPUT') return;
            const cb = document.getElementById('groupMaster');
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        };
        document.getElementById('groupMaster').onchange = function() {
            if (this.checked) {
                const groups = [...new Set(allStudentsInfo.map(s => s.group))].sort();
                state.selectedGroups = [...groups];
                const allStudents = allStudentsInfo.map(s => s.name);
                state.selectedStudents = [...allStudents];
            } else {
                state.selectedGroups = [];
                state.selectedStudents = [];
            }
            saveFilters();
            renderSubjects();
            updateStudentList();
            updateChart();
        };

        updateStudentList();
    }

    function updateStudentList() {
        const container = document.getElementById('studentList');
        const students = allStudentsInfo;
        const selectedGroups = state.selectedGroups.length > 0 ? state.selectedGroups : [];
        const filtered = students.filter(s => selectedGroups.includes(s.group));
        container.innerHTML = '';

        const studentState = getHierarchyState(state.selectedStudents, filtered.map(s => s.name));
        const studentSymbol = getStateSymbol(studentState);
        document.getElementById('studentMaster').checked = (studentState === 'all');
        document.getElementById('studentMasterIndicator').textContent = studentSymbol;

        if (filtered.length === 0) {
            container.innerHTML = '<span style="color:#94a3b8;font-size:13px;">请先选择小组</span>';
            return;
        }

        state.selectedStudents = state.selectedStudents.filter(name => filtered.some(s => s.name === name));

        filtered.forEach(s => {
            const div = document.createElement('span');
            div.className = 'item';
            const checked = state.selectedStudents.includes(s.name);
            div.innerHTML = `
                <input type="checkbox" class="student-checkbox" value="${s.name}" ${checked ? 'checked' : ''} />
                <label>${s.name}</label>
            `;
            container.appendChild(div);
        });

        container.querySelectorAll('.student-checkbox').forEach(cb => {
            cb.onchange = function() {
                const val = this.value;
                if (this.checked) {
                    if (!state.selectedStudents.includes(val)) state.selectedStudents.push(val);
                } else {
                    state.selectedStudents = state.selectedStudents.filter(s => s !== val);
                }
                saveFilters();
                updateStudentList();
                updateChart();
            };
        });

        document.getElementById('studentMasterLabel').onclick = function(e) {
            if (e.target.tagName === 'INPUT') return;
            const cb = document.getElementById('studentMaster');
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        };
        document.getElementById('studentMaster').onchange = function() {
            const filteredNames = filtered.map(s => s.name);
            if (this.checked) {
                filteredNames.forEach(name => {
                    if (!state.selectedStudents.includes(name)) state.selectedStudents.push(name);
                });
            } else {
                filteredNames.forEach(name => {
                    state.selectedStudents = state.selectedStudents.filter(s => s !== name);
                });
            }
            saveFilters();
            updateStudentList();
            updateChart();
        };
    }

    // ---------- Y轴下拉（聚合方式） ----------
    function updateYAxisOptions() {
        const select = document.getElementById('yAxisSelect');
        const current = state.aggMode;

        const options = [
            { value: 'avg', label: '📐 平均' },
            { value: 'sum', label: '➕ 求和' },
            { value: 'raw', label: '📊 独立' },
            { value: 'ranking', label: '🏆 排行' }
        ];

        select.innerHTML = options.map(o =>
            `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${o.label}</option>`
        ).join('');

        if (!options.some(o => o.value === current)) {
            state.aggMode = options[0].value;
            select.value = state.aggMode;
            saveConfig();
        }

        select.onchange = function() {
            state.aggMode = this.value;
            saveConfig();
            updateSplitVisibility();
            updateChart();
        };
    }

    // ---------- 拆分维度下拉（独立模式专用，具体维度） ----------
    function updateSplitVisibility() {
        const isRaw = (state.aggMode === 'raw');
        const label = document.getElementById('splitLabel');
        if (isRaw) {
            label.classList.add('visible');
            updateSplitOptions();
        } else {
            label.classList.remove('visible');
        }
    }

    function updateSplitOptions() {
        const select = document.getElementById('splitSelect');
        const xDim = state.xAxis;
        const xGroup = getDimGroup(xDim);

        const allDims = ['student', 'group', 'subject', 'dimension', 'date', 'week'];
        const available = allDims.filter(d => getDimGroup(d) !== xGroup);

        const current = state.splitDim;
        if (!available.includes(current)) {
            state.splitDim = available.length > 0 ? available[0] : 'student';
            saveConfig();
        }

        select.innerHTML = available.map(d =>
            `<option value="${d}" ${d === state.splitDim ? 'selected' : ''}>${getDimLabel(d)}</option>`
        ).join('');

        select.onchange = function() {
            state.splitDim = this.value;
            saveConfig();
            updateChart();
        };
    }

    // ---------- 轴配置UI联动 ----------
    function updateAxisUI() {
        const xSelect = document.getElementById('xAxisSelect');
        xSelect.value = state.xAxis;

        const radarBtn = document.querySelector('#chartTypeBar button[data-type="radar"]');
        radarBtn.disabled = false;
        radarBtn.title = '';

        xSelect.onchange = function() {
            state.xAxis = this.value;
            saveConfig();
            updateSplitOptions();
            updateChart();
        };

        updateYAxisOptions();
        updateSplitVisibility();
    }

    // ================================================================
    //  旋转功能（使用包装容器，消除空白）
    // ================================================================
    function toggleRotation() {
        const wrapper = document.querySelector('.chart-wrapper');
        if (!wrapper) return;
        const isRotated = wrapper.classList.toggle('rotated');
        state.isRotated = isRotated;
        saveConfig();

        if (isRotated) {
            // 旋转后，设置宽高为父容器的互换值
            applyRotationSize();
        } else {
            // 恢复：清除内联样式
            wrapper.style.width = '';
            wrapper.style.height = '';
            wrapper.style.maxWidth = '';
            wrapper.style.maxHeight = '';
            wrapper.style.margin = '';
            wrapper.style.transformOrigin = '';
        }

        if (chartInstance) {
            setTimeout(() => chartInstance.resize(), 50);
        }
    }

    function applyRotationSize() {
        const wrapper = document.querySelector('.chart-wrapper');
        if (!wrapper || !wrapper.classList.contains('rotated')) return;
        // 获取父容器（panel-center）的尺寸
        const parent = wrapper.parentElement;
        if (!parent) return;
        const parentRect = parent.getBoundingClientRect();
        // 减去可能的padding（这里假设padding为0，但实际可能有些边距，取整）
        const pWidth = parentRect.width - 4;
        const pHeight = parentRect.height - 4;
        const newW = Math.max(100, pHeight);
        const newH = Math.max(100, pWidth);
        wrapper.style.width = newW + 'px';
        wrapper.style.height = newH + 'px';
        wrapper.style.maxWidth = newW + 'px';
        wrapper.style.maxHeight = newH + 'px';
        wrapper.style.margin = '0 auto';
        // 设置transform-origin为中心，避免偏移
        wrapper.style.transformOrigin = 'center center';
    }

    function handleResize() {
        if (state.isRotated) {
            applyRotationSize();
            if (chartInstance) {
                chartInstance.resize();
            }
        }
    }

    // ---------- 防抖 ----------
    let updateTimer = null;

    function debouncedUpdate() {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
            updateTimer = null;
            updateChart();
        }, 200);
    }

    // ---------- 图表渲染 ----------
    let chartInstance = null;

    function updateChart() {
        state.selectedDays.sort((a, b) => a.localeCompare(b));

        if (state.selectedDays.length === 0) {
            showNoData('📅 请选择至少一个日期');
            return;
        }
        if (state.selectedGroups.length === 0 && state.selectedStudents.length === 0) {
            showNoData('🏷️ 请选择至少一个小组或学生');
            return;
        }
        if (state.selectedSubjects.length === 0 && state.selectedDimensions.length === 0) {
            showNoData('📋 请选择至少一个学科或维度');
            return;
        }

        const filtered = getFilteredData();
        if (!filtered || filtered.subjects.length === 0) {
            showNoData('📋 当前筛选条件下无数据');
            return;
        }

        const canvas = document.getElementById('statsChart');
        const rankingContainer = document.getElementById('rankingContainer');
        const noDataEl = document.getElementById('noData');

        if (state.aggMode === 'ranking') {
            canvas.style.display = 'none';
            rankingContainer.style.display = 'block';
            noDataEl.style.display = 'none';

            const sorted = filtered.subjects.map(sub => ({
                name: sub.name,
                value: filtered.data[sub.name].value
            })).sort((a, b) => b.value - a.value);

            let html = `<div class="ranking-table-wrapper"><table>
                <thead><tr><th>排名</th><th>${getDimLabel(state.xAxis)}</th><th>${filtered.dimensions.join(' ')}</th></tr></thead><tbody>`;
            sorted.forEach((item, index) => {
                const rank = index + 1;
                let rowClass = '';
                let badgeClass = 'normal';
                if (rank === 1) { rowClass = 'rank-1';
                    badgeClass = 'gold'; } else if (rank === 2) { rowClass = 'rank-2';
                    badgeClass = 'silver'; } else if (rank === 3) { rowClass = 'rank-3';
                    badgeClass = 'bronze'; }
                const rankDisplay = rank <= 3 ? `<span class="rank-badge ${badgeClass}">${rank}</span>` : rank;
                html += `<tr class="${rowClass}"><td>${rankDisplay}</td><td>${item.name}</td><td><strong>${item.value.toFixed(1)}</strong></td></tr>`;
            });
            html += `</tbody></table></div>`;
            rankingContainer.innerHTML = html;

            document.getElementById('dataPointCount').textContent = sorted.length;
            document.getElementById('dimensionCount').textContent = filtered.dimensions.length;
            document.getElementById('studentCount').textContent = allStudentsInfo.length;
            // 恢复旋转状态
            const wrapper = document.querySelector('.chart-wrapper');
            if (wrapper && state.isRotated) {
                wrapper.classList.add('rotated');
                applyRotationSize();
            }
            return;
        }

        // 独立显示模式
        if (state.aggMode === 'raw' && filtered.groups && filtered.splitValues) {
            canvas.style.display = 'block';
            rankingContainer.style.display = 'none';
            noDataEl.style.display = 'none';

            const groups = filtered.groups;
            const splitValues = filtered.splitValues || Object.keys(groups);
            const xLabels = filtered.xLabels || filtered.subjects.map(s => s.name);

            const colors = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#fd79a8', '#00cec9', '#6c5ce7', '#fdcb6e', '#00b894', '#e17055', '#6c5ce7'];
            const datasets = [];
            let colorIdx = 0;

            splitValues.forEach(sv => {
                const data = groups[sv];
                if (!data || data.y.length === 0) return;
                const yData = data.y;
                const color = colors[colorIdx % colors.length];
                colorIdx++;
                datasets.push({
                    label: sv,
                    data: yData,
                    borderColor: color,
                    backgroundColor: color + '40',
                    borderWidth: 2,
                    pointRadius: 4,
                    tension: 0.3,
                    fill: false,
                });
            });

            if (datasets.length === 0) {
                showNoData('📋 拆分后无有效数据');
                return;
            }

            const chartData = {
                labels: xLabels,
                datasets: datasets
            };

            let chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { font: { size: 10 }, boxWidth: 12, padding: 6 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + context.parsed.y;
                            }
                        }
                    }
                }
            };

            if (state.chartType === 'radar') {
                const radarData = {
                    labels: xLabels,
                    datasets: datasets.map(ds => ({
                        label: ds.label,
                        data: ds.data,
                        backgroundColor: ds.backgroundColor,
                        borderColor: ds.borderColor,
                        pointBackgroundColor: ds.borderColor,
                        borderWidth: 2,
                        fill: true,
                    }))
                };
                const radarOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top', labels: { font: { size: 10 } } },
                        tooltip: { callbacks: { label: function(context) { return context.dataset.label + ': ' + context
                                    .parsed.r; } } }
                    },
                    scales: { r: { beginAtZero: true, ticks: { stepSize: 10 } } }
                };
                if (chartInstance) chartInstance.destroy();
                chartInstance = new Chart(canvas, { type: 'radar', data: radarData, options: radarOptions });
            } else if (state.chartType === 'pie') {
                const first = datasets[0];
                const pieData = {
                    labels: xLabels,
                    datasets: [{ data: first.data, backgroundColor: colors.slice(0, xLabels.length) }]
                };
                if (chartInstance) chartInstance.destroy();
                chartInstance = new Chart(canvas, { type: 'pie', data: pieData, options: { responsive: true,
                        maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 } } } } } });
            } else {
                const type = (state.chartType === 'line') ? 'line' : 'bar';
                if (chartInstance) chartInstance.destroy();
                chartInstance = new Chart(canvas, { type: type, data: chartData, options: chartOptions });
            }

            document.getElementById('dataPointCount').textContent = xLabels.length * datasets.length;
            document.getElementById('dimensionCount').textContent = filtered.dimensions.length;
            document.getElementById('studentCount').textContent = allStudentsInfo.length;
            // 恢复旋转状态
            const wrapper = document.querySelector('.chart-wrapper');
            if (wrapper && state.isRotated) {
                wrapper.classList.add('rotated');
                applyRotationSize();
            }
            return;
        }

        // 普通模式
        canvas.style.display = 'block';
        rankingContainer.style.display = 'none';
        noDataEl.style.display = 'none';

        const subjects = filtered.subjects;
        const labels = subjects.map(s => s.name);
        const values = subjects.map(s => filtered.data[s.name].value);
        const dims = filtered.dimensions;

        document.getElementById('dataPointCount').textContent = labels.length;
        document.getElementById('dimensionCount').textContent = dims.length;
        document.getElementById('studentCount').textContent = allStudentsInfo.length;

        let chartData, chartOptions;

        if (state.chartType === 'radar') {
            chartData = {
                labels: labels,
                datasets: [{
                    label: dims.join(' '),
                    data: values,
                    backgroundColor: 'rgba(108,92,231,0.2)',
                    borderColor: '#6c5ce7',
                    pointBackgroundColor: '#6c5ce7',
                    borderWidth: 2,
                    fill: true
                }]
            };
            chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return context
                                .parsed.r; } } } },
                scales: { r: { beginAtZero: true, ticks: { stepSize: 10 } } }
            };
        } else {
            const isBar = state.chartType === 'bar';
            const isLine = state.chartType === 'line';
            const isPie = state.chartType === 'pie';

            if (isPie) {
                chartData = {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#fd79a8', '#00cec9',
                            '#6c5ce7', '#fdcb6e', '#00b894'
                        ],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                };
                chartOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { font: { size: 10 } } },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = total > 0 ? (context.parsed / total * 100).toFixed(1) : 0;
                                    return context.label + ': ' + context.parsed + ' (' + pct + '%)';
                                }
                            }
                        }
                    }
                };
            } else {
                chartData = {
                    labels: labels,
                    datasets: [{
                        label: dims.join(' '),
                        data: values,
                        backgroundColor: isBar ? '#6c5ce7' : 'rgba(108,92,231,0.3)',
                        borderColor: '#6c5ce7',
                        borderWidth: 2,
                        borderRadius: isBar ? 6 : 0,
                        tension: 0.3,
                        pointRadius: 5,
                        fill: false,
                    }]
                };
                chartOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return context
                                    .parsed.y; } } } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 10 } },
                        x: { grid: { display: false } }
                    }
                };
            }
        }

        if (chartInstance) chartInstance.destroy();
        const ctx = canvas.getContext('2d');
        let type = 'bar';
        if (state.chartType === 'line') type = 'line';
        else if (state.chartType === 'pie') type = 'pie';
        else if (state.chartType === 'radar') type = 'radar';
        else type = 'bar';
        chartInstance = new Chart(ctx, { type: type, data: chartData, options: chartOptions });

        // 恢复旋转状态
        const wrapper = document.querySelector('.chart-wrapper');
        if (wrapper && state.isRotated) {
            wrapper.classList.add('rotated');
            applyRotationSize();
        }
    }

    function showNoData(msg) {
        const noDataEl = document.getElementById('noData');
        const canvas = document.getElementById('statsChart');
        const rankingContainer = document.getElementById('rankingContainer');
        canvas.style.display = 'none';
        rankingContainer.style.display = 'none';
        noDataEl.style.display = 'flex';
        document.getElementById('noDataMsg').textContent = msg;
        document.getElementById('dataPointCount').textContent = '0';
        document.getElementById('dimensionCount').textContent = '0';
        document.getElementById('studentCount').textContent = '0';
        if (chartInstance) { chartInstance.destroy();
            chartInstance = null; }
    }

    // ---------- 纯净模式 ----------
    function togglePureMode() {
        state.pureMode = !state.pureMode;
        document.getElementById('app').classList.toggle('pure-mode', state.pureMode);
        document.getElementById('pureModeBtn').textContent = state.pureMode ? '🔲 退出纯净' : '🔲 纯净模式';
        // 纯净模式下重新调整旋转尺寸
        setTimeout(() => {
            if (state.isRotated) {
                applyRotationSize();
                if (chartInstance) chartInstance.resize();
            }
        }, 100);
    }

    // ---------- 初始化 ----------
    function init() {
        loadAllData();
        loadDateRange();
        loadSelectedDays();
        loadSelectedWeeks();
        loadFilters();
        loadConfig();

        document.getElementById('startDate').value = state.startDate || '';
        document.getElementById('endDate').value = state.endDate || '';
        if (!state.startDate || !state.endDate) {
            const dates = Object.keys(rawDaily).sort();
            if (dates.length > 0) {
                state.startDate = dates[0];
                state.endDate = dates[dates.length - 1];
                document.getElementById('startDate').value = state.startDate;
                document.getElementById('endDate').value = state.endDate;
                saveDateRange();
            }
        }

        // 图表类型
        document.querySelectorAll('#chartTypeBar button').forEach(btn => {
            btn.onclick = function() {
                document.querySelectorAll('#chartTypeBar button').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                state.chartType = this.dataset.type;
                saveConfig();
                updateChart();
            };
        });
        document.querySelectorAll('#chartTypeBar button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === state.chartType);
        });

        // 日期范围
        document.getElementById('applyDateRange').onclick = function() {
            const startInput = document.getElementById('startDate');
            const endInput = document.getElementById('endDate');
            if (startInput.value && endInput.value) {
                if (startInput.value > endInput.value) {
                    alert('起始日期不能晚于结束日期！');
                    return;
                }
                state.startDate = startInput.value;
                state.endDate = endInput.value;
                saveDateRange();
                const allDatesFiltered = allDates.filter(d => {
                    const dObj = new Date(d + 'T00:00:00');
                    const startObj = new Date(state.startDate + 'T00:00:00');
                    const endObj = new Date(state.endDate + 'T00:00:00');
                    return dObj >= startObj && dObj <= endObj;
                });
                state.selectedDays = state.selectedDays.filter(d => allDatesFiltered.includes(d));
                state.selectedDays.sort((a, b) => a.localeCompare(b));
                saveSelectedDays();
                renderWeekList();
                updateChart();
            } else {
                alert('请完整选择起始和结束日期。');
            }
        };

        // 纯净模式
        document.getElementById('pureModeBtn').onclick = togglePureMode;
        document.getElementById('exitPureBtn').onclick = togglePureMode;

        // 旋转按钮
        document.getElementById('rotateBtn').onclick = toggleRotation;

        // 窗口自适应
        window.addEventListener('resize', handleResize);

        // 初始化X轴下拉
        const xSelect = document.getElementById('xAxisSelect');
        xSelect.value = state.xAxis;
        xSelect.onchange = function() {
            state.xAxis = this.value;
            saveConfig();
            updateSplitOptions();
            updateChart();
        };

        // 初始化Y轴下拉（聚合方式）
        updateYAxisOptions();

        // 初始化拆分下拉
        updateSplitVisibility();

        renderDimensions();
        renderSubjects();
        renderWeekList();

        // 恢复旋转状态
        const wrapper = document.querySelector('.chart-wrapper');
        if (wrapper && state.isRotated) {
            wrapper.classList.add('rotated');
            applyRotationSize();
        }

        updateChart();

        console.log('📊 自由维度统计引擎已启动（独立拆分修复 + CSS旋转自适应）');
    }

    document.addEventListener('DOMContentLoaded', init);
})();