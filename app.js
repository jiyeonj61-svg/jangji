(() => {
  "use strict";

  const STORAGE_KEY = "jangjiyeon-work-calendar.tasks.v1";
  const SETTINGS_KEY = "jangjiyeon-work-calendar.settings.v1";
  const VALID_CATEGORIES = new Set(["work", "meeting", "deadline", "personal"]);

  const elements = {
    monthTitle: document.querySelector("#monthTitle"),
    monthPicker: document.querySelector("#monthPicker"),
    monthPickerButton: document.querySelector("#monthPickerButton"),
    previousMonthButton: document.querySelector("#previousMonthButton"),
    nextMonthButton: document.querySelector("#nextMonthButton"),
    todayButton: document.querySelector("#todayButton"),
    addTaskButton: document.querySelector("#addTaskButton"),
    mobileAddTaskButton: document.querySelector("#mobileAddTaskButton"),
    exportButton: document.querySelector("#exportButton"),
    importInput: document.querySelector("#importInput"),
    hideCompletedToggle: document.querySelector("#hideCompletedToggle"),
    calendarGrid: document.querySelector("#calendarGrid"),
    dayCellTemplate: document.querySelector("#dayCellTemplate"),
    totalTaskCount: document.querySelector("#totalTaskCount"),
    completedTaskCount: document.querySelector("#completedTaskCount"),
    remainingTaskCount: document.querySelector("#remainingTaskCount"),
    completionRate: document.querySelector("#completionRate"),
    completionProgressBar: document.querySelector("#completionProgressBar"),
    taskDialog: document.querySelector("#taskDialog"),
    taskForm: document.querySelector("#taskForm"),
    taskId: document.querySelector("#taskId"),
    taskTitle: document.querySelector("#taskTitle"),
    taskDate: document.querySelector("#taskDate"),
    taskCategory: document.querySelector("#taskCategory"),
    taskMemo: document.querySelector("#taskMemo"),
    taskCompleted: document.querySelector("#taskCompleted"),
    taskTitleError: document.querySelector("#taskTitleError"),
    taskDateError: document.querySelector("#taskDateError"),
    dialogEyebrow: document.querySelector("#dialogEyebrow"),
    dialogTitle: document.querySelector("#dialogTitle"),
    deleteTaskButton: document.querySelector("#deleteTaskButton"),
    cancelDialogButton: document.querySelector("#cancelDialogButton"),
    closeDialogButton: document.querySelector("#closeDialogButton"),
    toast: document.querySelector("#toast"),
  };

  const today = startOfDay(new Date());
  const state = {
    visibleMonth: new Date(today.getFullYear(), today.getMonth(), 1),
    tasks: loadTasks(),
    settings: loadSettings(),
    toastTimer: null,
  };

  initialise();

  function initialise() {
    elements.hideCompletedToggle.checked = Boolean(state.settings.hideCompleted);
    bindEvents();
    render();
  }

  function bindEvents() {
    elements.previousMonthButton.addEventListener("click", () => changeMonth(-1));
    elements.nextMonthButton.addEventListener("click", () => changeMonth(1));
    elements.todayButton.addEventListener("click", goToToday);
    elements.addTaskButton.addEventListener("click", () => openTaskDialog({ date: getPreferredNewTaskDate() }));
    elements.mobileAddTaskButton.addEventListener("click", () => openTaskDialog({ date: getPreferredNewTaskDate() }));
    elements.monthPickerButton.addEventListener("click", openMonthPicker);
    elements.monthPicker.addEventListener("change", handleMonthPickerChange);
    elements.exportButton.addEventListener("click", exportTasks);
    elements.importInput.addEventListener("change", importTasks);
    elements.hideCompletedToggle.addEventListener("change", handleHideCompletedChange);
    elements.calendarGrid.addEventListener("click", handleCalendarClick);
    elements.taskForm.addEventListener("submit", saveTaskFromForm);
    elements.deleteTaskButton.addEventListener("click", deleteCurrentTask);
    elements.cancelDialogButton.addEventListener("click", closeTaskDialog);
    elements.closeDialogButton.addEventListener("click", closeTaskDialog);
    elements.taskDialog.addEventListener("click", handleDialogBackdropClick);
    elements.taskDialog.addEventListener("close", resetTaskForm);
    elements.taskTitle.addEventListener("input", () => clearFieldError("title"));
    elements.taskDate.addEventListener("input", () => clearFieldError("date"));
    window.addEventListener("keydown", handleKeyboardShortcuts);
  }

  function render() {
    renderMonthHeader();
    renderCalendar();
    renderMonthlySummary();
  }

  function renderMonthHeader() {
    const year = state.visibleMonth.getFullYear();
    const month = state.visibleMonth.getMonth() + 1;
    elements.monthTitle.textContent = `${year}년 ${month}월`;
    elements.monthPicker.value = `${year}-${String(month).padStart(2, "0")}`;
    document.title = `${year}년 ${month}월 · 장지연 워크캘린더`;
  }

  function renderCalendar() {
    elements.calendarGrid.replaceChildren();

    const firstDayOfMonth = new Date(
      state.visibleMonth.getFullYear(),
      state.visibleMonth.getMonth(),
      1,
    );
    const gridStartDate = addDays(firstDayOfMonth, -firstDayOfMonth.getDay());

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 42; index += 1) {
      const date = addDays(gridStartDate, index);
      const dateKey = formatDateKey(date);
      const cell = elements.dayCellTemplate.content.firstElementChild.cloneNode(true);
      const dateNumberButton = cell.querySelector(".date-number");
      const addButton = cell.querySelector(".day-add-button");
      const taskList = cell.querySelector(".task-list");
      const isOutsideMonth = date.getMonth() !== state.visibleMonth.getMonth();
      const isToday = isSameDate(date, today);
      const dayOfWeek = date.getDay();

      cell.dataset.date = dateKey;
      cell.classList.toggle("outside-month", isOutsideMonth);
      cell.classList.toggle("today", isToday);
      cell.classList.toggle("sunday", dayOfWeek === 0);
      cell.classList.toggle("saturday", dayOfWeek === 6);

      dateNumberButton.textContent = getDateNumberLabel(date, isOutsideMonth);
      dateNumberButton.dataset.action = "add-task";
      dateNumberButton.dataset.date = dateKey;
      dateNumberButton.setAttribute("aria-label", `${formatDateForAria(date)} 업무 추가`);

      addButton.dataset.action = "add-task";
      addButton.dataset.date = dateKey;

      const dayTasks = getTasksForDate(dateKey);
      const visibleTasks = state.settings.hideCompleted
        ? dayTasks.filter((task) => !task.completed)
        : dayTasks;

      if (visibleTasks.length === 0) {
        const hint = document.createElement("p");
        hint.className = "empty-day-hint";
        hint.textContent = "클릭하여 업무 추가";
        taskList.append(hint);
      } else {
        visibleTasks.forEach((task) => taskList.append(createTaskChip(task)));
      }

      fragment.append(cell);
    }

    elements.calendarGrid.append(fragment);
  }

  function createTaskChip(task) {
    const chip = document.createElement("div");
    chip.className = `task-chip category-${task.category}`;
    chip.classList.toggle("completed", task.completed);
    chip.dataset.taskId = task.id;

    const checkButton = document.createElement("button");
    checkButton.className = "task-check";
    checkButton.type = "button";
    checkButton.dataset.action = "toggle-complete";
    checkButton.dataset.taskId = task.id;
    checkButton.setAttribute(
      "aria-label",
      task.completed ? `${task.title} 완료 취소` : `${task.title} 완료 처리`,
    );
    checkButton.innerHTML = `
      <span aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></svg>
      </span>
    `;

    const contentButton = document.createElement("button");
    contentButton.className = "task-content";
    contentButton.type = "button";
    contentButton.dataset.action = "edit-task";
    contentButton.dataset.taskId = task.id;
    contentButton.title = task.memo ? `${task.title}\n${task.memo}` : task.title;

    const title = document.createElement("span");
    title.textContent = task.title;
    contentButton.append(title);

    chip.append(checkButton, contentButton);
    return chip;
  }

  function renderMonthlySummary() {
    const monthPrefix = `${state.visibleMonth.getFullYear()}-${String(
      state.visibleMonth.getMonth() + 1,
    ).padStart(2, "0")}-`;

    const monthTasks = state.tasks.filter((task) => task.date.startsWith(monthPrefix));
    const completedCount = monthTasks.filter((task) => task.completed).length;
    const remainingCount = monthTasks.length - completedCount;
    const rate = monthTasks.length === 0 ? 0 : Math.round((completedCount / monthTasks.length) * 100);

    elements.totalTaskCount.textContent = String(monthTasks.length);
    elements.completedTaskCount.textContent = String(completedCount);
    elements.remainingTaskCount.textContent = String(remainingCount);
    elements.completionRate.textContent = `${rate}%`;
    elements.completionProgressBar.style.width = `${rate}%`;
  }

  function handleCalendarClick(event) {
    const actionTarget = event.target.closest("[data-action]");

    if (actionTarget) {
      const action = actionTarget.dataset.action;

      if (action === "add-task") {
        openTaskDialog({ date: actionTarget.dataset.date });
        return;
      }

      if (action === "toggle-complete") {
        toggleTaskCompletion(actionTarget.dataset.taskId);
        return;
      }

      if (action === "edit-task") {
        const task = state.tasks.find((item) => item.id === actionTarget.dataset.taskId);
        if (task) openTaskDialog({ task });
        return;
      }
    }

    const dayCell = event.target.closest(".day-cell");
    const clickedTask = event.target.closest(".task-chip");
    if (dayCell && !clickedTask) {
      openTaskDialog({ date: dayCell.dataset.date });
    }
  }

  function openTaskDialog({ date, task } = {}) {
    clearAllFieldErrors();

    if (task) {
      elements.dialogEyebrow.textContent = "업무 수정";
      elements.dialogTitle.textContent = "업무 내용 수정";
      elements.taskId.value = task.id;
      elements.taskTitle.value = task.title;
      elements.taskDate.value = task.date;
      elements.taskCategory.value = task.category;
      elements.taskMemo.value = task.memo;
      elements.taskCompleted.checked = task.completed;
      elements.deleteTaskButton.classList.remove("hidden");
    } else {
      elements.dialogEyebrow.textContent = "새 업무";
      elements.dialogTitle.textContent = "업무 등록";
      elements.taskId.value = "";
      elements.taskTitle.value = "";
      elements.taskDate.value = date || getPreferredNewTaskDate();
      elements.taskCategory.value = "work";
      elements.taskMemo.value = "";
      elements.taskCompleted.checked = false;
      elements.deleteTaskButton.classList.add("hidden");
    }

    if (typeof elements.taskDialog.showModal === "function") {
      elements.taskDialog.showModal();
    } else {
      elements.taskDialog.setAttribute("open", "");
    }

    window.setTimeout(() => elements.taskTitle.focus(), 40);
  }

  function closeTaskDialog() {
    if (elements.taskDialog.open && typeof elements.taskDialog.close === "function") {
      elements.taskDialog.close();
    } else {
      elements.taskDialog.removeAttribute("open");
      resetTaskForm();
    }
  }

  function resetTaskForm() {
    elements.taskForm.reset();
    elements.taskId.value = "";
    clearAllFieldErrors();
  }

  function handleDialogBackdropClick(event) {
    if (event.target === elements.taskDialog) {
      const rect = elements.taskDialog.getBoundingClientRect();
      const clickedInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!clickedInside) closeTaskDialog();
    }
  }

  function saveTaskFromForm(event) {
    event.preventDefault();
    clearAllFieldErrors();

    const title = elements.taskTitle.value.trim();
    const date = elements.taskDate.value;
    const category = VALID_CATEGORIES.has(elements.taskCategory.value)
      ? elements.taskCategory.value
      : "work";
    const memo = elements.taskMemo.value.trim();
    const completed = elements.taskCompleted.checked;

    let isValid = true;

    if (!title) {
      setFieldError("title", "업무명을 입력해 주세요.");
      isValid = false;
    }

    if (!isValidDateKey(date)) {
      setFieldError("date", "날짜를 선택해 주세요.");
      isValid = false;
    }

    if (!isValid) return;

    const now = new Date().toISOString();
    const existingTaskId = elements.taskId.value;

    if (existingTaskId) {
      const index = state.tasks.findIndex((task) => task.id === existingTaskId);
      if (index === -1) {
        showToast("수정할 업무를 찾지 못했습니다.", "error");
        return;
      }

      state.tasks[index] = {
        ...state.tasks[index],
        title,
        date,
        category,
        memo,
        completed,
        updatedAt: now,
      };
      showToast("업무를 수정했습니다.", "success");
    } else {
      state.tasks.push({
        id: createId(),
        title,
        date,
        category,
        memo,
        completed,
        createdAt: now,
        updatedAt: now,
      });
      showToast("업무를 등록했습니다.", "success");
    }

    sortTasks();
    saveTasks();
    moveCalendarToTaskDate(date);
    closeTaskDialog();
    render();
  }

  function toggleTaskCompletion(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    task.updatedAt = new Date().toISOString();
    saveTasks();
    render();

    showToast(task.completed ? "업무를 완료했습니다." : "완료 상태를 취소했습니다.", "success");
  }

  function deleteCurrentTask() {
    const taskId = elements.taskId.value;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const shouldDelete = window.confirm(`“${task.title}” 업무를 삭제할까요?`);
    if (!shouldDelete) return;

    state.tasks = state.tasks.filter((item) => item.id !== taskId);
    saveTasks();
    closeTaskDialog();
    render();
    showToast("업무를 삭제했습니다.", "success");
  }

  function changeMonth(offset) {
    state.visibleMonth = new Date(
      state.visibleMonth.getFullYear(),
      state.visibleMonth.getMonth() + offset,
      1,
    );
    render();
  }

  function goToToday() {
    state.visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    render();
  }

  function openMonthPicker() {
    try {
      if (typeof elements.monthPicker.showPicker === "function") {
        elements.monthPicker.showPicker();
      } else {
        elements.monthPicker.focus();
        elements.monthPicker.click();
      }
    } catch {
      elements.monthPicker.focus();
      elements.monthPicker.click();
    }
  }

  function handleMonthPickerChange() {
    const value = elements.monthPicker.value;
    if (!/^\d{4}-\d{2}$/.test(value)) return;

    const [year, month] = value.split("-").map(Number);
    state.visibleMonth = new Date(year, month - 1, 1);
    render();
  }

  function handleHideCompletedChange() {
    state.settings.hideCompleted = elements.hideCompletedToggle.checked;
    saveSettings();
    renderCalendar();
  }

  function handleKeyboardShortcuts(event) {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const isTyping = ["input", "textarea", "select"].includes(activeTag);

    if (event.key === "Escape" && elements.taskDialog.open) {
      closeTaskDialog();
      return;
    }

    if (isTyping || elements.taskDialog.open || event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      openTaskDialog({ date: getPreferredNewTaskDate() });
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      changeMonth(-1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      changeMonth(1);
    }
  }

  function exportTasks() {
    const exportData = {
      app: "장지연 워크캘린더",
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const dateStamp = formatDateKey(new Date()).replaceAll("-", "");

    anchor.href = url;
    anchor.download = `jangjiyeon-work-calendar-backup-${dateStamp}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("백업 파일을 저장했습니다.", "success");
  }

  async function importTasks(event) {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const candidateTasks = Array.isArray(parsed) ? parsed : parsed.tasks;

      if (!Array.isArray(candidateTasks)) {
        throw new Error("업무 목록이 없습니다.");
      }

      const importedTasks = candidateTasks.map(normaliseTask).filter(Boolean);
      const shouldReplace = window.confirm(
        `백업 파일에서 ${importedTasks.length}개의 업무를 찾았습니다.\n현재 업무를 모두 지우고 복원할까요?`,
      );

      if (!shouldReplace) return;

      state.tasks = importedTasks;
      sortTasks();
      saveTasks();
      render();
      showToast(`${importedTasks.length}개의 업무를 복원했습니다.`, "success");
    } catch (error) {
      console.error(error);
      showToast("올바른 백업 파일이 아닙니다.", "error");
    }
  }

  function getTasksForDate(dateKey) {
    return state.tasks
      .filter((task) => task.date === dateKey)
      .sort((a, b) => {
        if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
        return a.createdAt.localeCompare(b.createdAt);
      });
  }

  function getPreferredNewTaskDate() {
    const currentMonthContainsToday =
      state.visibleMonth.getFullYear() === today.getFullYear() &&
      state.visibleMonth.getMonth() === today.getMonth();

    return currentMonthContainsToday
      ? formatDateKey(today)
      : formatDateKey(state.visibleMonth);
  }

  function moveCalendarToTaskDate(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) return;
    state.visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function sortTasks() {
    state.tasks.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normaliseTask).filter(Boolean);
    } catch (error) {
      console.warn("업무 데이터를 불러오지 못했습니다.", error);
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
    } catch (error) {
      console.error("업무 데이터를 저장하지 못했습니다.", error);
      showToast("브라우저 저장 공간에 업무를 저장하지 못했습니다.", "error");
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { hideCompleted: false };
      const parsed = JSON.parse(raw);
      return { hideCompleted: Boolean(parsed.hideCompleted) };
    } catch {
      return { hideCompleted: false };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  }

  function normaliseTask(candidate) {
    if (!candidate || typeof candidate !== "object") return null;

    const title = String(candidate.title ?? "").trim().slice(0, 80);
    const date = String(candidate.date ?? "");
    if (!title || !isValidDateKey(date)) return null;

    const now = new Date().toISOString();
    const category = VALID_CATEGORIES.has(candidate.category) ? candidate.category : "work";

    return {
      id: String(candidate.id || createId()),
      title,
      date,
      category,
      memo: String(candidate.memo ?? "").trim().slice(0, 500),
      completed: Boolean(candidate.completed),
      createdAt: isValidIsoDate(candidate.createdAt) ? candidate.createdAt : now,
      updatedAt: isValidIsoDate(candidate.updatedAt) ? candidate.updatedAt : now,
    };
  }

  function setFieldError(field, message) {
    if (field === "title") {
      elements.taskTitle.classList.add("invalid");
      elements.taskTitleError.textContent = message;
      elements.taskTitle.focus();
    }

    if (field === "date") {
      elements.taskDate.classList.add("invalid");
      elements.taskDateError.textContent = message;
      if (!elements.taskTitleError.textContent) elements.taskDate.focus();
    }
  }

  function clearFieldError(field) {
    if (field === "title") {
      elements.taskTitle.classList.remove("invalid");
      elements.taskTitleError.textContent = "";
    }

    if (field === "date") {
      elements.taskDate.classList.remove("invalid");
      elements.taskDateError.textContent = "";
    }
  }

  function clearAllFieldErrors() {
    clearFieldError("title");
    clearFieldError("date");
  }

  function showToast(message, type = "success") {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type} visible`;
    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("visible");
    }, 2300);
  }

  function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isSameDate(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function isValidDateKey(value) {
    return Boolean(parseDateKey(value));
  }

  function isValidIsoDate(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }

  function formatDateForAria(date) {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(date);
  }

  function getDateNumberLabel(date, isOutsideMonth) {
    if (isOutsideMonth && date.getDate() === 1) {
      return `${date.getMonth() + 1}월 1일`;
    }
    return String(date.getDate());
  }

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
})();
