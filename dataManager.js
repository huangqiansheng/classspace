// 班级管理系统 | Copyright (c) 2026 黄迁胜 | 根据 MIT 许可证授权
// ================================================================
// dataManager.js - 班级数据统一管理器
// 所有数据读写通过此模块，确保一致性和持久化
// ================================================================

(function() {
    'use strict';

    // ---------- 班级ID ----------
    function getClassId() {
        const params = new URLSearchParams(window.location.search);
        let id = params.get('classId') || params.get('class');
        if (!id) {
            id = localStorage.getItem('currentClassId') || '一班';
        }
        // 确保其他页面能读取
        localStorage.setItem('currentClassId', id);
        return id;
    }

    // ---------- 核心数据 ----------
    function loadClassData(classId) {
        classId = classId || getClassId();
        const key = 'classroomData_' + classId;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('loadClassData 失败:', e);
            return null;
        }
    }

    function saveClassData(data, classId) {
        classId = classId || getClassId();
        const key = 'classroomData_' + classId;
        try {
            localStorage.setItem(key, JSON.stringify(data));
            // 同步周次
            if (data.week) {
                localStorage.setItem('weekNumber_' + classId, data.week);
            }
            return true;
        } catch (e) {
            console.error('saveClassData 失败:', e);
            alert('⚠️ 数据保存失败，请检查浏览器存储空间！');
            return false;
        }
    }

    // 便捷方法（直接操作 students 等，但推荐直接 loadClassData / saveClassData）
    function loadStudents(classId) {
        const data = loadClassData(classId);
        return data ? data.students || [] : [];
    }

    function saveStudents(students, classId) {
        const data = loadClassData(classId) || {};
        data.students = students;
        return saveClassData(data, classId);
    }

    function loadGroupColorMap(classId) {
        const data = loadClassData(classId);
        return data ? data.groupColorMap || {} : {};
    }

    function saveGroupColorMap(map, classId) {
        const data = loadClassData(classId) || {};
        data.groupColorMap = map;
        return saveClassData(data, classId);
    }

    function loadGroupSloganMap(classId) {
        const data = loadClassData(classId);
        return data ? data.groupSloganMap || {} : {};
    }

    function saveGroupSloganMap(map, classId) {
        const data = loadClassData(classId) || {};
        data.groupSloganMap = map;
        return saveClassData(data, classId);
    }

    function loadPodiumStartIndex(classId) {
        const data = loadClassData(classId);
        return data ? data.podiumStartIndex : 5;
    }

    function savePodiumStartIndex(index, classId) {
        const data = loadClassData(classId) || {};
        data.podiumStartIndex = index;
        return saveClassData(data, classId);
    }

    // ---------- 周次 ----------
    function loadWeek(classId) {
        classId = classId || getClassId();
        // 优先从 classroomData 读取
        const data = loadClassData(classId);
        if (data && data.week) return data.week;
        // 其次从 weekNumber 读取
        const saved = localStorage.getItem('weekNumber_' + classId);
        return saved || '1';
    }

    function saveWeek(week, classId) {
        classId = classId || getClassId();
        const data = loadClassData(classId) || {};
        data.week = week;
        saveClassData(data, classId);
        // 同时更新独立存储
        localStorage.setItem('weekNumber_' + classId, week);
    }

    // ---------- 筛选状态 ----------
    function loadActiveFilters(classId) {
        classId = classId || getClassId();
        const key = 'activeFilters_' + classId;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return { categories: [], subjects: [] };
            return JSON.parse(raw);
        } catch (e) {
            return { categories: [], subjects: [] };
        }
    }

    function saveActiveFilters(filters, classId) {
        classId = classId || getClassId();
        const key = 'activeFilters_' + classId;
        try {
            localStorage.setItem(key, JSON.stringify(filters));
            return true;
        } catch (e) {
            console.warn('saveActiveFilters 失败:', e);
            return false;
        }
    }

    // ---------- 每日快照 ----------
    function loadDailySnapshot(date, classId) {
        classId = classId || getClassId();
        const key = 'dailyData_' + classId;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const all = JSON.parse(raw);
            return all[date] || null;
        } catch (e) {
            return null;
        }
    }

    function saveDailySnapshot(date, snapshot, classId) {
        classId = classId || getClassId();
        const key = 'dailyData_' + classId;
        try {
            const raw = localStorage.getItem(key);
            let all = raw ? JSON.parse(raw) : {};
            all[date] = snapshot;
            localStorage.setItem(key, JSON.stringify(all));
            return true;
        } catch (e) {
            console.warn('saveDailySnapshot 失败:', e);
            return false;
        }
    }

    function loadAllDailySnapshots(classId) {
        classId = classId || getClassId();
        const key = 'dailyData_' + classId;
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    // ---------- 历史快照 ----------
    function loadHistory(classId) {
        classId = classId || getClassId();
        const key = 'historyData_' + classId;
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveHistory(history, classId) {
        classId = classId || getClassId();
        const key = 'historyData_' + classId;
        try {
            localStorage.setItem(key, JSON.stringify(history));
            return true;
        } catch (e) {
            console.warn('saveHistory 失败:', e);
            return false;
        }
    }

    function addHistory(week, snapshot, classId) {
        const history = loadHistory(classId);
        // 限制保留最近 10 周
        const MAX_HISTORY = 10;
        history.push({
            week: week,
            data: snapshot,
            timestamp: new Date().toISOString()
        });
        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY);
        }
        return saveHistory(history, classId);
    }

    // ---------- 统计页设置 ----------
    function loadStatisticsFilters(classId) {
        classId = classId || getClassId();
        const key = 'statistics_filters_' + classId;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function saveStatisticsFilters(filters, classId) {
        classId = classId || getClassId();
        const key = 'statistics_filters_' + classId;
        try {
            localStorage.setItem(key, JSON.stringify(filters));
            return true;
        } catch (e) {
            console.warn('saveStatisticsFilters 失败:', e);
            return false;
        }
    }

    function loadStatisticsChartAgg(classId) {
        classId = classId || getClassId();
        const key = 'statistics_chart_agg_' + classId;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function saveStatisticsChartAgg(chartAgg, classId) {
        classId = classId || getClassId();
        const key = 'statistics_chart_agg_' + classId;
        try {
            localStorage.setItem(key, JSON.stringify(chartAgg));
            return true;
        } catch (e) {
            console.warn('saveStatisticsChartAgg 失败:', e);
            return false;
        }
    }

    function loadExpandedWeeks(classId) {
        classId = classId || getClassId();
        const key = 'expandedWeeks_' + classId;
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveExpandedWeeks(expanded, classId) {
        classId = classId || getClassId();
        const key = 'expandedWeeks_' + classId;
        try {
            localStorage.setItem(key, JSON.stringify(expanded));
            return true;
        } catch (e) {
            console.warn('saveExpandedWeeks 失败:', e);
            return false;
        }
    }

    // ---------- 对外暴露 ----------
    window.DataManager = {
        getClassId: getClassId,
        loadClassData: loadClassData,
        saveClassData: saveClassData,
        loadStudents: loadStudents,
        saveStudents: saveStudents,
        loadGroupColorMap: loadGroupColorMap,
        saveGroupColorMap: saveGroupColorMap,
        loadGroupSloganMap: loadGroupSloganMap,
        saveGroupSloganMap: saveGroupSloganMap,
        loadPodiumStartIndex: loadPodiumStartIndex,
        savePodiumStartIndex: savePodiumStartIndex,
        loadWeek: loadWeek,
        saveWeek: saveWeek,
        loadActiveFilters: loadActiveFilters,
        saveActiveFilters: saveActiveFilters,
        loadDailySnapshot: loadDailySnapshot,
        saveDailySnapshot: saveDailySnapshot,
        loadAllDailySnapshots: loadAllDailySnapshots,
        loadHistory: loadHistory,
        saveHistory: saveHistory,
        addHistory: addHistory,
        loadStatisticsFilters: loadStatisticsFilters,
        saveStatisticsFilters: saveStatisticsFilters,
        loadStatisticsChartAgg: loadStatisticsChartAgg,
        saveStatisticsChartAgg: saveStatisticsChartAgg,
        loadExpandedWeeks: loadExpandedWeeks,
        saveExpandedWeeks: saveExpandedWeeks
    };

    console.log('📦 DataManager 已加载，班级ID:', getClassId());
})();