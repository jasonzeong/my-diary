/**
 * 日历组件模块
 * 负责日历渲染、日期选择、与日记联动
 */

(function() {
    'use strict';

    // 当前显示的月份
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth();

    // 选中的日期
    let selectedDate = null;

    // 有日记的日期集合
    let datesWithEntries = new Set();

    // 缓存日历格子元素，避免重复创建
    let dayElements = [];

    // 年份范围
    const YEAR_RANGE = 20; // 前后各20年

    // 上次渲染的月份，用于判断是否需要重建DOM
    let lastRenderedYear = null;
    let lastRenderedMonth = null;

    /**
     * 初始化日历
     */
    function initCalendar() {
        initYearSelect();
        bindCalendarEvents();
        bindGridEventDelegation(); // 绑定事件委托
        updateSelectors();
        renderCalendar();
    }

    /**
     * 绑定日历格子的事件委托
     */
    function bindGridEventDelegation() {
        const grid = document.getElementById('calendarGrid');
        grid.addEventListener('click', function(e) {
            const dayEl = e.target.closest('.calendar-day');
            if (!dayEl) return;

            // 获取日期（存储在 data-date 属性中）
            const dateStr = dayEl.dataset.date;
            if (!dateStr) return; // 其他月份的格子没有 date

            selectedDate = dateStr;
            renderCalendar();

            // 显示清除筛选按钮
            document.getElementById('clearFilterBtn').style.display = 'block';

            // 触发回调
            if (window.onDateSelect) {
                window.onDateSelect(dateStr);
            }
        });
    }

    /**
     * 初始化年份选择下拉框
     */
    function initYearSelect() {
        const yearSelect = document.getElementById('yearSelect');
        yearSelect.innerHTML = '';

        const currentY = new Date().getFullYear();
        const startYear = currentY - YEAR_RANGE;
        const endYear = currentY + YEAR_RANGE;

        for (let y = startYear; y <= endYear; y++) {
            const option = document.createElement('option');
            option.value = y;
            option.textContent = y;
            yearSelect.appendChild(option);
        }
    }

    /**
     * 绑定日历事件
     */
    function bindCalendarEvents() {
        // 年份选择
        document.getElementById('yearSelect').addEventListener('change', function() {
            currentYear = parseInt(this.value);
            updateSelectors();
            renderCalendar();
        });

        // 月份选择
        document.getElementById('monthSelect').addEventListener('change', function() {
            currentMonth = parseInt(this.value);
            updateSelectors();
            renderCalendar();
        });

        // 上个月
        document.getElementById('prevMonth').addEventListener('click', function() {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            updateSelectors();
            renderCalendar();
        });

        // 下个月
        document.getElementById('nextMonth').addEventListener('click', function() {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            updateSelectors();
            renderCalendar();
        });

        // 今天
        document.getElementById('todayBtn').addEventListener('click', function() {
            const now = new Date();
            currentYear = now.getFullYear();
            currentMonth = now.getMonth();
            selectedDate = now.toISOString().split('T')[0];
            updateSelectors();
            renderCalendar();

            // 触发日期选择
            if (window.onDateSelect) {
                window.onDateSelect(selectedDate);
            }
        });

        // 清除筛选
        document.getElementById('clearFilterBtn').addEventListener('click', function() {
            selectedDate = null;
            renderCalendar();
            if (window.onDateSelect) {
                window.onDateSelect(null);
            }
            document.getElementById('clearFilterBtn').style.display = 'none';
        });
    }

    /**
     * 更新年份和月份选择器的值
     */
    function updateSelectors() {
        document.getElementById('yearSelect').value = currentYear;
        document.getElementById('monthSelect').value = currentMonth;
    }

    /**
     * 渲染日历
     * 优化：月份未变化时只更新class，不重建DOM
     */
    function renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const isMonthChanged = lastRenderedYear !== currentYear || lastRenderedMonth !== currentMonth;

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        if (isMonthChanged) {
            // 月份变化，需要重建DOM
            grid.innerHTML = '';
            dayElements = [];

            const firstDay = new Date(currentYear, currentMonth, 1);
            const lastDay = new Date(currentYear, currentMonth + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

            // 上月剩余天数
            const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
            for (let i = startDayOfWeek - 1; i >= 0; i--) {
                const day = prevMonthLastDay - i;
                const dayEl = createDayElement(day, true);
                grid.appendChild(dayEl);
                dayElements.push({ el: dayEl, dateStr: null });
            }

            // 当月天数
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = formatDate(currentYear, currentMonth, day);
                const dayEl = createDayElement(day, false, dateStr, todayStr);
                grid.appendChild(dayEl);
                dayElements.push({ el: dayEl, dateStr: dateStr });
            }

            // 下月开始天数
            const totalCells = grid.children.length;
            const remainingCells = 42 - totalCells; // 6 rows * 7 days
            for (let day = 1; day <= remainingCells; day++) {
                const dayEl = createDayElement(day, true);
                grid.appendChild(dayEl);
                dayElements.push({ el: dayEl, dateStr: null });
            }

            lastRenderedYear = currentYear;
            lastRenderedMonth = currentMonth;
        } else {
            // 月份未变化，只更新class
            dayElements.forEach(function(item) {
                const el = item.el;
                const dateStr = item.dateStr;

                if (!dateStr) return; // 跳过其他月份的格子

                // 更新今天状态
                el.classList.toggle('today', dateStr === todayStr);
                // 更新选中状态
                el.classList.toggle('selected', dateStr === selectedDate);
                // 更新有日记状态
                el.classList.toggle('has-entry', datesWithEntries.has(dateStr));
            });
        }
    }

    /**
     * 创建日历格子元素
     */
    function createDayElement(day, isOtherMonth, dateStr, todayStr) {
        const el = document.createElement('div');
        el.className = 'calendar-day';
        el.textContent = day;

        if (isOtherMonth) {
            el.classList.add('other-month');
        }

        if (dateStr) {
            // 存储日期到 data 属性，用于事件委托
            el.dataset.date = dateStr;

            // 今天
            if (dateStr === todayStr) {
                el.classList.add('today');
            }

            // 选中
            if (dateStr === selectedDate) {
                el.classList.add('selected');
            }

            // 有日记
            if (datesWithEntries.has(dateStr)) {
                el.classList.add('has-entry');
            }
        }

        return el;
    }

    /**
     * 格式化日期为 YYYY-MM-DD
     */
    function formatDate(year, month, day) {
        const y = year;
        const m = String(month + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    /**
     * 更新有日记的日期标记
     * @param {Array} entries - 日记列表
     */
    function updateEntryDates(entries) {
        datesWithEntries.clear();
        entries.forEach(function(entry) {
            if (entry.dateKey) {
                datesWithEntries.add(entry.dateKey);
            }
        });
        renderCalendar();
    }

    /**
     * 获取当前选中的日期
     */
    function getSelectedDate() {
        return selectedDate;
    }

    /**
     * 设置选中日期
     */
    function setSelectedDate(date) {
        selectedDate = date;
        renderCalendar();
    }

    // 导出
    window.calendar = {
        init: initCalendar,
        updateEntryDates: updateEntryDates,
        getSelectedDate: getSelectedDate,
        setSelectedDate: setSelectedDate
    };

    console.log('calendar.js 加载完成');
})();
