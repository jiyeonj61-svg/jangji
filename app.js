(() => {
  "use strict";

  const LEGACY_STORAGE_KEY = "jangjiyeon-work-calendar.tasks.v1";
  const CACHE_KEY_PREFIX = "jangjiyeon-work-calendar.cache.v2.";
  const SETTINGS_KEY = "jangjiyeon-work-calendar.settings.v1";
  const MIGRATION_KEY_PREFIX = "jangjiyeon-work-calendar.migration.v2.";
  const TABLE_NAME = "calendar_tasks";
  const VALID_CATEGORIES = new Set(["work", "meeting", "deadline", "personal"]);
  const TASK_SELECT = "id,user_id,title,task_date,end_date,category,memo,completed,created_at,updated_at";

  const elements = {
    authScreen: document.querySelector("#authScreen"),
    authContent: document.querySelector("#authContent"),
    configRequiredPanel: document.querySelector("#configRequiredPanel"),
    authForm: document.querySelector("#authForm"),
    authTitle: document.querySelector("#authTitle"),
    authDescription: document.querySelector("#authDescription"),
    authEmail: document.querySelector("#authEmail"),
    authPassword: document.querySelector("#authPassword"),
    authPasswordConfirm: document.querySelector("#authPasswordConfirm"),
    confirmPasswordField: document.querySelector("#confirmPasswordField"),
    authMessage: document.querySelector("#authMessage"),
    authSubmitButton: document.querySelector("#authSubmitButton"),
    authSwitchLabel: document.querySelector("#authSwitchLabel"),
    authSwitchButton: document.querySelector("#authSwitchButton"),
    appShell: document.querySelector("#appShell"),
    syncStatus: document.querySelector("#syncStatus"),
    syncStatusText: document.querySelector("#syncStatusText"),
    userEmail: document.querySelector("#userEmail"),
    signOutButton: document.querySelector("#signOutButton"),
    compactSignOutButton: document.querySelector("#compactSignOutButton"),
    storageNote: document.querySelector("#storageNote"),
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
    taskDateLabel: document.querySelector("#taskDateLabel"),
    taskEndDate: document.querySelector("#taskEndDate"),
    taskEndDateField: document.querySelector("#taskEndDateField"),
    taskEndDateError: document.querySelector("#taskEndDateError"),
    dateRangeHint: document.querySelector("#dateRangeHint"),
    dateModes: document.querySelectorAll('input[name="dateMode"]'),
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
    saveTaskButton: document.querySelector("#saveTaskButton"),
    migrationDialog: document.querySelector("#migrationDialog"),
    legacyTaskCount: document.querySelector("#legacyTaskCount"),
    migrateTasksButton: document.querySelector("#migrateTasksButton"),
    skipMigrationButton: document.querySelector("#skipMigrationButton"),
    toast: document.querySelector("#toast"),
  };

  const today = startOfDay(new Date());
  const state = {
    visibleMonth: new Date(today.getFullYear(), today.getMonth(), 1),
    tasks: [],
    legacyTasks: loadLegacyTasks(),
    settings: loadSettings(),
    supabase: null,
    goals: null,
    session: null,
    user: null,
    realtimeChannel: null,
    authMode: "signin",
    toastTimer: null,
    realtimeRefreshTimer: null,
    pendingTaskIds: new Set(),
    migrationDismissed: false,
  };

  void initialise();

  async function initialise() {
    elements.hideCompletedToggle.checked = Boolean(state.settings.hideCompleted);
    bindEvents();
    render();
    registerServiceWorker();

    const config = getSupabaseConfig();
    if (!config) {
      showSetupRequired(
        "Supabase 연결 설정이 필요합니다",
        "프로젝트의 supabase-config.js에 Project URL과 Publishable key를 입력한 뒤 다시 배포해 주세요.",
      );
      return;
    }

    if (!window.supabase?.createClient) {
      showSetupRequired(
        "Supabase 라이브러리를 불러오지 못했습니다",
        "인터넷 연결을 확인한 뒤 페이지를 새로고침해 주세요.",
      );
      return;
    }

    state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    state.goals = window.WorkCalendarGoals.create({ supabase: state.supabase, showToast, canWrite: canWriteToServer });
    state.goals.setMonth(state.visibleMonth);

    state.supabase.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => void handleAuthStateChange(event, session), 0);
    });

    try {
      const { data, error } = await state.supabase.auth.getSession();
      if (error) throw error;
      if (data.session) await enterAuthenticatedState(data.session);
      else showAuthScreen();
    } catch (error) {
      console.error(error);
      showAuthScreen();
      setAuthMessage("로그인 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.", "error");
    }
  }

  function bindEvents() {
    elements.authForm.addEventListener("submit", handleAuthSubmit);
    elements.authSwitchButton.addEventListener("click", toggleAuthMode);
    elements.signOutButton.addEventListener("click", signOut);
    elements.compactSignOutButton.addEventListener("click", signOut);
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
    elements.taskDate.addEventListener("input", () => {
      clearFieldError("date");
      elements.taskEndDate.min = elements.taskDate.value;
    });
    elements.taskEndDate.addEventListener("input", () => clearFieldError("endDate"));
    elements.dateModes.forEach((input) => input.addEventListener("change", updateDateMode));
    elements.migrateTasksButton.addEventListener("click", migrateLegacyTasks);
    elements.skipMigrationButton.addEventListener("click", dismissMigrationForSession);
    window.addEventListener("keydown", handleKeyboardShortcuts);
    window.addEventListener("online", handleNetworkOnline);
    window.addEventListener("offline", handleNetworkOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function getSupabaseConfig() {
    const config = window.WORK_CALENDAR_CONFIG;
    if (!config || typeof config !== "object") return null;
    const supabaseUrl = String(config.supabaseUrl || "").trim();
    const supabasePublishableKey = String(config.supabasePublishableKey || "").trim();
    if (!supabaseUrl || !supabasePublishableKey || supabaseUrl.includes("PASTE_") || supabasePublishableKey.includes("PASTE_")) return null;
    try {
      if (new URL(supabaseUrl).protocol !== "https:") return null;
    } catch {
      return null;
    }
    if (supabasePublishableKey.length < 20) return null;
    return { supabaseUrl, supabasePublishableKey };
  }

  function showSetupRequired(title, description) {
    elements.configRequiredPanel.querySelector("h2").textContent = title;
    elements.configRequiredPanel.querySelector("p").textContent = description;
    elements.configRequiredPanel.classList.remove("hidden");
    elements.authContent.classList.add("hidden");
    elements.authScreen.classList.remove("hidden");
    elements.appShell.classList.add("hidden");
    elements.mobileAddTaskButton.classList.add("hidden");
  }

  function showAuthScreen() {
    elements.configRequiredPanel.classList.add("hidden");
    elements.authContent.classList.remove("hidden");
    elements.authScreen.classList.remove("hidden");
    elements.appShell.classList.add("hidden");
    elements.mobileAddTaskButton.classList.add("hidden");
    setAuthMode("signin");
    window.setTimeout(() => elements.authEmail.focus(), 40);
  }

  function hideAuthScreen() {
    elements.authScreen.classList.add("hidden");
    elements.appShell.classList.remove("hidden");
    elements.mobileAddTaskButton.classList.remove("hidden");
  }

  async function handleAuthStateChange(event, session) {
    if (session?.user) {
      state.session = session;
      if (state.user?.id === session.user.id && !elements.appShell.classList.contains("hidden")) return;
      await enterAuthenticatedState(session);
      return;
    }
    if (["SIGNED_OUT", "USER_DELETED"].includes(event) || state.user) leaveAuthenticatedState();
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthMessage("");
    if (!state.supabase) return setAuthMessage("Supabase 연결 설정을 먼저 완료해 주세요.", "error");

    const email = elements.authEmail.value.trim();
    const password = elements.authPassword.value;
    const passwordConfirm = elements.authPasswordConfirm.value;
    if (!isValidEmail(email)) return setAuthMessage("올바른 이메일 주소를 입력해 주세요.", "error");
    if (password.length < 8) return setAuthMessage("비밀번호는 8자 이상 입력해 주세요.", "error");
    if (state.authMode === "signup" && password !== passwordConfirm) return setAuthMessage("비밀번호 확인이 일치하지 않습니다.", "error");

    setAuthBusy(true);
    try {
      if (state.authMode === "signup") {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { data, error } = await state.supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (data.session) await enterAuthenticatedState(data.session);
        else {
          setAuthMessage("가입 확인 이메일을 보냈습니다. 확인 링크를 누른 뒤 로그인해 주세요.", "success");
          setAuthMode("signin", { keepMessage: true });
        }
      } else {
        const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session) await enterAuthenticatedState(data.session);
      }
    } catch (error) {
      console.error(error);
      setAuthMessage(translateAuthError(error), "error");
    } finally {
      setAuthBusy(false);
    }
  }

  function toggleAuthMode() {
    setAuthMode(state.authMode === "signin" ? "signup" : "signin");
  }

  function setAuthMode(mode, options = {}) {
    state.authMode = mode === "signup" ? "signup" : "signin";
    const isSignup = state.authMode === "signup";
    elements.authTitle.textContent = isSignup ? "계정 만들기" : "로그인";
    elements.authDescription.textContent = isSignup
      ? "하나의 계정으로 컴퓨터와 휴대폰 업무를 안전하게 연결합니다."
      : "PC와 갤럭시폰에서 같은 계정으로 로그인하면 업무가 즉시 동기화됩니다.";
    elements.authSubmitButton.textContent = isSignup ? "계정 만들기" : "로그인";
    elements.authSwitchLabel.textContent = isSignup ? "이미 계정이 있나요?" : "처음 사용하시나요?";
    elements.authSwitchButton.textContent = isSignup ? "로그인하기" : "계정 만들기";
    elements.confirmPasswordField.classList.toggle("hidden", !isSignup);
    elements.authPasswordConfirm.required = isSignup;
    elements.authPassword.autocomplete = isSignup ? "new-password" : "current-password";
    if (!options.keepMessage) setAuthMessage("");
  }

  function setAuthBusy(isBusy) {
    elements.authForm.querySelectorAll("input, button").forEach((control) => { control.disabled = isBusy; });
    elements.authSwitchButton.disabled = isBusy;
    elements.authSubmitButton.textContent = isBusy
      ? state.authMode === "signup" ? "계정 만드는 중…" : "로그인 중…"
      : state.authMode === "signup" ? "계정 만들기" : "로그인";
  }

  function setAuthMessage(message, type = "") {
    elements.authMessage.textContent = message;
    elements.authMessage.className = `auth-message${type ? ` ${type}` : ""}`;
  }

  async function enterAuthenticatedState(session) {
    const userId = session.user.id;
    const sameUser = state.user?.id === userId;
    state.session = session;
    state.user = session.user;
    state.goals?.setUser(session.user);
    elements.userEmail.textContent = session.user.email || "로그인 계정";
    hideAuthScreen();

    if (!sameUser) {
      state.tasks = loadUserCache(userId);
      sortTasks();
      render();
    }

    setSyncStatus("syncing", "업무 불러오는 중");
    const loaded = await loadTasksFromServer({ showErrorToast: !sameUser });
    subscribeToRealtime();
    if (loaded) maybeShowLegacyMigration();
  }

  function leaveAuthenticatedState() {
    unsubscribeFromRealtime();
    state.goals?.clear();
    state.session = null;
    state.user = null;
    state.tasks = [];
    state.pendingTaskIds.clear();
    closeTaskDialog();
    closeMigrationDialog();
    showAuthScreen();
  }

  async function signOut() {
    if (!state.supabase) return;
    elements.signOutButton.disabled = true;
    elements.compactSignOutButton.disabled = true;
    try {
      const { error } = await state.supabase.auth.signOut();
      if (error) throw error;
      leaveAuthenticatedState();
    } catch (error) {
      console.error(error);
      showToast("로그아웃하지 못했습니다. 다시 시도해 주세요.", "error");
    } finally {
      elements.signOutButton.disabled = false;
      elements.compactSignOutButton.disabled = false;
    }
  }

  async function loadTasksFromServer({ showErrorToast = true } = {}) {
    if (!state.supabase || !state.user) return false;
    if (!navigator.onLine) {
      setSyncStatus("offline", "오프라인 · 저장된 내용 표시");
      return false;
    }

    setSyncStatus("syncing", "동기화 중");
    try {
      const userId = state.user.id;
      const { data, error } = await state.supabase
        .from(TABLE_NAME)
        .select(TASK_SELECT)
        .eq("user_id", userId)
        .order("task_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (state.user?.id !== userId) return false;
      state.tasks = (data || []).map(fromDatabaseTask).filter(Boolean);
      sortTasks();
      saveUserCache();
      render();
      setSyncStatus("online", "실시간 연동 중");
      return true;
    } catch (error) {
      console.error("업무 동기화 오류", error);
      setSyncStatus("error", "동기화 오류");
      if (showErrorToast) showToast("서버 업무를 불러오지 못했습니다. Supabase 설정을 확인해 주세요.", "error");
      return false;
    }
  }

  function subscribeToRealtime() {
    if (!state.supabase || !state.user) return;
    unsubscribeFromRealtime();
    const userId = state.user.id;
    state.realtimeChannel = state.supabase
      .channel(`calendar-tasks-${userId}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE_NAME, filter: `user_id=eq.${userId}` }, () => scheduleRealtimeRefresh())
      .subscribe((status) => {
        if (state.user?.id !== userId) return;
        if (status === "SUBSCRIBED") setSyncStatus("online", "실시간 연동 중");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSyncStatus("error", "실시간 연결 재시도 중");
        else if (status === "CLOSED" && navigator.onLine) setSyncStatus("offline", "실시간 연결 끊김");
      });
  }

  function unsubscribeFromRealtime() {
    window.clearTimeout(state.realtimeRefreshTimer);
    state.realtimeRefreshTimer = null;
    if (state.supabase && state.realtimeChannel) void state.supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }

  function scheduleRealtimeRefresh() {
    window.clearTimeout(state.realtimeRefreshTimer);
    state.realtimeRefreshTimer = window.setTimeout(() => void loadTasksFromServer({ showErrorToast: false }), 180);
  }

  function handleNetworkOffline() {
    setSyncStatus("offline", "오프라인 · 변경 불가");
    elements.storageNote.textContent = "인터넷 연결이 끊겼습니다. 저장된 업무는 볼 수 있지만 수정은 온라인 상태에서 해 주세요.";
  }

  function handleNetworkOnline() {
    if (!state.user) return;
    setSyncStatus("syncing", "다시 연결 중");
    void loadTasksFromServer({ showErrorToast: false });
    subscribeToRealtime();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && state.user && navigator.onLine) {
      void loadTasksFromServer({ showErrorToast: false });
    }
  }

  function setSyncStatus(status, text) {
    elements.syncStatus.dataset.status = status;
    elements.syncStatusText.textContent = text;
    if (status === "online") elements.storageNote.textContent = "업무는 Supabase에 저장되며 같은 계정으로 로그인한 컴퓨터와 휴대폰에 실시간 반영됩니다.";
    else if (status === "syncing") elements.storageNote.textContent = "서버와 업무 내용을 동기화하고 있습니다.";
    else if (status === "error") elements.storageNote.textContent = "동기화에 문제가 있습니다. 인터넷 연결과 Supabase 설정을 확인해 주세요.";
  }

  function render() {
    renderMonthHeader();
    renderCalendar();
    renderMonthlySummary();
    state.goals?.setMonth(state.visibleMonth);
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
    const firstDayOfMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth(), 1);
    const gridStartDate = addDays(firstDayOfMonth, -firstDayOfMonth.getDay());
    const fragment = document.createDocumentFragment();

    for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
      const week = document.createElement("div");
      week.className = "calendar-week";
      const days = document.createElement("div");
      days.className = "week-days";
      const dates = Array.from({ length: 7 }, (_, day) => formatDateKey(addDays(gridStartDate, weekIndex * 7 + day)));
      const layout = window.CalendarLayout.layoutWeek(state.tasks, dates, state.settings.hideCompleted);
      for (let day = 0; day < 7; day += 1) {
      const index = weekIndex * 7 + day;
      const date = addDays(gridStartDate, index);
      const dateKey = formatDateKey(date);
      const cell = elements.dayCellTemplate.content.firstElementChild.cloneNode(true);
      const dateNumberButton = cell.querySelector(".date-number");
      const addButton = cell.querySelector(".day-add-button");
      const taskList = cell.querySelector(".task-list");
      const isOutsideMonth = date.getMonth() !== state.visibleMonth.getMonth();
      const dayOfWeek = date.getDay();

      cell.dataset.date = dateKey;
      cell.classList.toggle("outside-month", isOutsideMonth);
      cell.classList.toggle("today", isSameDate(date, today));
      cell.classList.toggle("sunday", dayOfWeek === 0);
      cell.classList.toggle("saturday", dayOfWeek === 6);

      dateNumberButton.textContent = getDateNumberLabel(date, isOutsideMonth);
      dateNumberButton.dataset.action = "add-task";
      dateNumberButton.dataset.date = dateKey;
      dateNumberButton.setAttribute("aria-label", `${formatDateForAria(date)} 업무 추가`);
      addButton.dataset.action = "add-task";
      addButton.dataset.date = dateKey;

      const hasTasks = layout.segments.some((segment) => day >= segment.start && day <= segment.end);
      if (!hasTasks) {
        const hint = document.createElement("p");
        hint.className = "empty-day-hint";
        hint.textContent = "클릭하여 업무 추가";
        taskList.append(hint);
      }
      days.append(cell);
      }
      const events = document.createElement("div");
      events.className = "week-events";
      for (const segment of layout.segments) {
        const chip = createTaskChip(segment.task);
        chip.style.gridColumn = `${segment.start + 1} / ${segment.end + 2}`;
        chip.style.gridRow = String(segment.lane + 1);
        chip.classList.toggle("range-task", Boolean(segment.task.endDate));
        chip.classList.toggle("continues-before", segment.continuesBefore);
        chip.classList.toggle("continues-after", segment.continuesAfter);
        events.append(chip);
      }
      week.append(days, events);
      fragment.append(week);
    }
    elements.calendarGrid.append(fragment);
  }

  function createTaskChip(task) {
    const pending = state.pendingTaskIds.has(task.id);
    const chip = document.createElement("div");
    chip.className = `task-chip category-${task.category}`;
    chip.classList.toggle("completed", task.completed);
    chip.classList.toggle("syncing", pending);
    chip.dataset.taskId = task.id;

    const checkButton = document.createElement("button");
    checkButton.className = "task-check";
    checkButton.type = "button";
    checkButton.dataset.action = "toggle-complete";
    checkButton.dataset.taskId = task.id;
    checkButton.disabled = pending;
    checkButton.setAttribute("aria-label", task.completed ? `${task.title} 완료 취소` : `${task.title} 완료 처리`);
    checkButton.innerHTML = '<span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></svg></span>';

    const contentButton = document.createElement("button");
    contentButton.className = "task-content";
    contentButton.type = "button";
    contentButton.dataset.action = "edit-task";
    contentButton.dataset.taskId = task.id;
    contentButton.disabled = pending;
    const period = task.endDate ? `${task.date} ~ ${task.endDate}` : task.date;
    contentButton.title = `${task.title}\n${period}${task.memo ? `\n${task.memo}` : ""}`;
    contentButton.setAttribute("aria-label", `${task.title}, ${period}, 수정`);
    const title = document.createElement("span");
    title.textContent = task.title;
    contentButton.append(title);
    chip.append(checkButton, contentButton);
    return chip;
  }

  function renderMonthlySummary() {
    const monthStart = formatDateKey(state.visibleMonth);
    const monthEnd = formatDateKey(new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + 1, 0));
    const monthTasks = state.tasks.filter((task) => window.CalendarLayout.overlaps(task, monthStart, monthEnd));
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
    if (!state.user) return;
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      const action = actionTarget.dataset.action;
      if (action === "add-task") return openTaskDialog({ date: actionTarget.dataset.date });
      if (action === "toggle-complete") return void toggleTaskCompletion(actionTarget.dataset.taskId);
      if (action === "edit-task") {
        const task = state.tasks.find((item) => item.id === actionTarget.dataset.taskId);
        if (task) openTaskDialog({ task });
        return;
      }
    }
    const dayCell = event.target.closest(".day-cell");
    if (dayCell && !event.target.closest(".task-chip")) openTaskDialog({ date: dayCell.dataset.date });
  }

  function openTaskDialog({ date, task } = {}) {
    if (!state.user) return;
    clearAllFieldErrors();
    if (task) {
      elements.dialogEyebrow.textContent = "업무 수정";
      elements.dialogTitle.textContent = "업무 내용 수정";
      elements.taskId.value = task.id;
      elements.taskTitle.value = task.title;
      elements.taskDate.value = task.date;
      elements.taskEndDate.value = task.endDate || task.date;
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
      elements.taskEndDate.value = elements.taskDate.value;
      elements.taskCategory.value = "work";
      elements.taskMemo.value = "";
      elements.taskCompleted.checked = false;
      elements.deleteTaskButton.classList.add("hidden");
    }
    elements.dateModes.forEach((input) => { input.checked = input.value === (task?.endDate ? "range" : "single"); });
    updateDateMode();
    if (typeof elements.taskDialog.showModal === "function") elements.taskDialog.showModal();
    else elements.taskDialog.setAttribute("open", "");
    window.setTimeout(() => elements.taskTitle.focus(), 40);
  }

  function closeTaskDialog() {
    if (elements.taskDialog.open && typeof elements.taskDialog.close === "function") elements.taskDialog.close();
    else {
      elements.taskDialog.removeAttribute("open");
      resetTaskForm();
    }
  }

  function resetTaskForm() {
    elements.taskForm.reset();
    elements.taskId.value = "";
    clearAllFieldErrors();
    setTaskFormBusy(false);
    updateDateMode();
  }

  function updateDateMode() {
    const isRange = elements.taskForm.querySelector('input[name="dateMode"]:checked')?.value === "range";
    elements.taskDateLabel.textContent = isRange ? "시작일" : "날짜";
    elements.taskEndDateField.classList.toggle("hidden", !isRange);
    elements.dateRangeHint.classList.toggle("hidden", !isRange);
    elements.taskEndDate.required = isRange;
    elements.taskEndDate.min = elements.taskDate.value;
    clearFieldError("endDate");
  }

  function handleDialogBackdropClick(event) {
    if (event.target !== elements.taskDialog) return;
    const rect = elements.taskDialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) closeTaskDialog();
  }

  async function saveTaskFromForm(event) {
    event.preventDefault();
    clearAllFieldErrors();
    if (!canWriteToServer()) return;

    const title = elements.taskTitle.value.trim();
    const date = elements.taskDate.value;
    const isRange = elements.taskForm.querySelector('input[name="dateMode"]:checked')?.value === "range";
    const endDate = isRange ? elements.taskEndDate.value : null;
    const category = VALID_CATEGORIES.has(elements.taskCategory.value) ? elements.taskCategory.value : "work";
    const memo = elements.taskMemo.value.trim();
    const completed = elements.taskCompleted.checked;
    let valid = true;
    if (!title) { setFieldError("title", "업무명을 입력해 주세요."); valid = false; }
    if (!isValidDateKey(date)) { setFieldError("date", "날짜를 선택해 주세요."); valid = false; }
    if (isRange && (!isValidDateKey(endDate) || endDate < date)) {
      setFieldError("endDate", "종료일은 시작일과 같거나 이후 날짜로 선택해 주세요.");
      valid = false;
    }
    if (!valid) return;

    const existingTaskId = elements.taskId.value;
    const now = new Date().toISOString();
    setTaskFormBusy(true);
    setSyncStatus("syncing", "저장 중");

    try {
      let result;
      if (existingTaskId) {
        result = await state.supabase
          .from(TABLE_NAME)
          .update({ title, task_date: date, end_date: endDate, category, memo, completed, updated_at: now })
          .eq("id", existingTaskId)
          .eq("user_id", state.user.id)
          .select(TASK_SELECT)
          .single();
      } else {
        result = await state.supabase
          .from(TABLE_NAME)
          .insert({ id: createId(), user_id: state.user.id, title, task_date: date, end_date: endDate, category, memo, completed, created_at: now, updated_at: now })
          .select(TASK_SELECT)
          .single();
      }
      if (result.error) throw result.error;
      upsertTaskInState(fromDatabaseTask(result.data));
      saveUserCache();
      moveCalendarToTaskDate(date);
      closeTaskDialog();
      render();
      setSyncStatus("online", "실시간 연동 중");
      showToast(existingTaskId ? "업무를 수정했습니다." : "업무를 등록했습니다.", "success");
    } catch (error) {
      console.error(error);
      setSyncStatus("error", "저장 실패");
      showToast("업무를 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setTaskFormBusy(false);
    }
  }

  async function toggleTaskCompletion(taskId) {
    if (!canWriteToServer() || state.pendingTaskIds.has(taskId)) return;
    const index = state.tasks.findIndex((item) => item.id === taskId);
    if (index === -1) return;

    const previousTask = { ...state.tasks[index] };
    const nextCompleted = !previousTask.completed;
    state.pendingTaskIds.add(taskId);
    state.tasks[index] = { ...previousTask, completed: nextCompleted, updatedAt: new Date().toISOString() };
    saveUserCache();
    render();
    setSyncStatus("syncing", "완료 상태 저장 중");

    try {
      const { data, error } = await state.supabase
        .from(TABLE_NAME)
        .update({ completed: nextCompleted, updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("user_id", state.user.id)
        .select(TASK_SELECT)
        .single();
      if (error) throw error;
      upsertTaskInState(fromDatabaseTask(data));
      saveUserCache();
      setSyncStatus("online", "실시간 연동 중");
      showToast(nextCompleted ? "업무를 완료했습니다." : "완료 상태를 취소했습니다.", "success");
    } catch (error) {
      console.error(error);
      upsertTaskInState(previousTask);
      saveUserCache();
      setSyncStatus("error", "저장 실패");
      showToast("완료 상태를 저장하지 못해 이전 상태로 되돌렸습니다.", "error");
    } finally {
      state.pendingTaskIds.delete(taskId);
      render();
    }
  }

  async function deleteCurrentTask() {
    const taskId = elements.taskId.value;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || !canWriteToServer()) return;
    if (!window.confirm(`“${task.title}” 업무를 삭제할까요?`)) return;

    setTaskFormBusy(true);
    setSyncStatus("syncing", "삭제 중");
    try {
      const { error } = await state.supabase.from(TABLE_NAME).delete().eq("id", taskId).eq("user_id", state.user.id);
      if (error) throw error;
      state.tasks = state.tasks.filter((item) => item.id !== taskId);
      saveUserCache();
      closeTaskDialog();
      render();
      setSyncStatus("online", "실시간 연동 중");
      showToast("업무를 삭제했습니다.", "success");
    } catch (error) {
      console.error(error);
      setSyncStatus("error", "삭제 실패");
      showToast("업무를 삭제하지 못했습니다. 다시 시도해 주세요.", "error");
    } finally {
      setTaskFormBusy(false);
    }
  }

  function setTaskFormBusy(isBusy) {
    elements.taskForm.querySelectorAll("input, select, textarea, button").forEach((control) => { control.disabled = isBusy; });
    elements.saveTaskButton.textContent = isBusy ? "저장 중…" : "저장";
  }

  function canWriteToServer() {
    if (!state.supabase || !state.user) {
      showToast("로그인이 필요합니다.", "error");
      return false;
    }
    if (!navigator.onLine) {
      showToast("인터넷 연결 후 다시 시도해 주세요.", "error");
      setSyncStatus("offline", "오프라인 · 변경 불가");
      return false;
    }
    return true;
  }

  function changeMonth(offset) {
    state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + offset, 1);
    render();
  }

  function goToToday() {
    state.visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    render();
  }

  function openMonthPicker() {
    try {
      if (typeof elements.monthPicker.showPicker === "function") elements.monthPicker.showPicker();
      else { elements.monthPicker.focus(); elements.monthPicker.click(); }
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
    if (event.key === "Escape" && elements.taskDialog.open) return closeTaskDialog();
    if (isTyping || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === "n" && state.user) { event.preventDefault(); openTaskDialog({ date: getPreferredNewTaskDate() }); }
    if (event.key === "ArrowLeft") { event.preventDefault(); changeMonth(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); changeMonth(1); }
  }

  function exportTasks() {
    const exportData = {
      app: "장지연 워크캘린더",
      version: 3,
      storage: "Supabase realtime",
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      goals: state.goals?.exportGoals() || [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jangjiyeon-work-calendar-backup-${formatDateKey(new Date()).replaceAll("-", "")}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("백업 파일을 저장했습니다.", "success");
  }

  async function importTasks(event) {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file || !canWriteToServer()) return;
    try {
      const parsed = JSON.parse(await file.text());
      const candidates = Array.isArray(parsed) ? parsed : (parsed.tasks || []);
      if (!Array.isArray(candidates)) throw new Error("업무 목록이 없습니다.");
      const importedTasks = candidates.map(normaliseTask).filter(Boolean);
      if (importedTasks.length !== candidates.length) throw new Error("올바르지 않은 업무가 포함되어 있습니다.");
      const goalRows = Array.isArray(parsed) ? [] : (parsed.goals || []);
      if (!Array.isArray(goalRows)) throw new Error("목표 목록 형식이 올바르지 않습니다.");
      if (!importedTasks.length && !goalRows.length) throw new Error("복원할 내용이 없습니다.");
      if (!window.confirm(`백업 파일에서 업무 ${importedTasks.length}개, 목표 ${goalRows.length}개를 찾았습니다.\n현재 서버 내용에 병합할까요?`)) return;
      setSyncStatus("syncing", "백업 복원 중");
      const rows = importedTasks.map((task) => toDatabaseTask(task, state.user.id));
      if (rows.length) {
        const { error } = await state.supabase.from(TABLE_NAME).upsert(rows, { onConflict: "id" });
        if (error) throw error;
      }
      await state.goals.importGoals(goalRows);
      await loadTasksFromServer({ showErrorToast: false });
      showToast(`업무 ${importedTasks.length}개와 목표 ${goalRows.length}개를 복원했습니다.`, "success");
    } catch (error) {
      console.error(error);
      setSyncStatus("error", "복원 실패");
      showToast("복원을 완료하지 못했습니다. 일부 항목은 저장되었을 수 있으니 확인 후 다시 시도해 주세요.", "error");
    }
  }

  function maybeShowLegacyMigration() {
    if (!state.user || state.migrationDismissed || state.legacyTasks.length === 0) return;
    if (localStorage.getItem(`${MIGRATION_KEY_PREFIX}${state.user.id}`) === "done") return;
    elements.legacyTaskCount.textContent = String(state.legacyTasks.length);
    if (typeof elements.migrationDialog.showModal === "function") elements.migrationDialog.showModal();
    else elements.migrationDialog.setAttribute("open", "");
  }

  async function migrateLegacyTasks() {
    if (!canWriteToServer() || state.legacyTasks.length === 0) return;
    elements.migrateTasksButton.disabled = true;
    elements.skipMigrationButton.disabled = true;
    elements.migrateTasksButton.textContent = "연동 중…";
    setSyncStatus("syncing", "기존 업무 연동 중");
    try {
      const rows = state.legacyTasks.map((task) => toDatabaseTask(task, state.user.id));
      const { error } = await state.supabase.from(TABLE_NAME).upsert(rows, { onConflict: "id" });
      if (error) throw error;
      localStorage.setItem(`${MIGRATION_KEY_PREFIX}${state.user.id}`, "done");
      closeMigrationDialog();
      await loadTasksFromServer({ showErrorToast: false });
      showToast(`${rows.length}개의 기존 업무를 휴대폰 연동 서버에 올렸습니다.`, "success");
    } catch (error) {
      console.error(error);
      setSyncStatus("error", "기존 업무 연동 실패");
      showToast("기존 업무를 서버에 올리지 못했습니다. 다시 시도해 주세요.", "error");
    } finally {
      elements.migrateTasksButton.disabled = false;
      elements.skipMigrationButton.disabled = false;
      elements.migrateTasksButton.textContent = "기존 업무 연동하기";
    }
  }

  function dismissMigrationForSession() {
    state.migrationDismissed = true;
    closeMigrationDialog();
  }

  function closeMigrationDialog() {
    if (elements.migrationDialog.open && typeof elements.migrationDialog.close === "function") elements.migrationDialog.close();
    else elements.migrationDialog.removeAttribute("open");
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
    const containsToday = state.visibleMonth.getFullYear() === today.getFullYear() && state.visibleMonth.getMonth() === today.getMonth();
    return containsToday ? formatDateKey(today) : formatDateKey(state.visibleMonth);
  }

  function moveCalendarToTaskDate(dateKey) {
    const date = parseDateKey(dateKey);
    if (date) state.visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function upsertTaskInState(task) {
    if (!task) return;
    const index = state.tasks.findIndex((item) => item.id === task.id);
    if (index === -1) state.tasks.push(task);
    else state.tasks[index] = task;
    sortTasks();
  }

  function sortTasks() {
    state.tasks.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }

  function loadLegacyTasks() {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normaliseTask).filter(Boolean) : [];
    } catch (error) {
      console.warn("기존 업무 데이터를 불러오지 못했습니다.", error);
      return [];
    }
  }

  function loadUserCache(userId) {
    try {
      const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normaliseTask).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveUserCache() {
    if (!state.user) return;
    try {
      localStorage.setItem(`${CACHE_KEY_PREFIX}${state.user.id}`, JSON.stringify(state.tasks));
    } catch (error) {
      console.warn("로컬 캐시를 저장하지 못했습니다.", error);
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { hideCompleted: false };
      return { hideCompleted: Boolean(JSON.parse(raw).hideCompleted) };
    } catch {
      return { hideCompleted: false };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* ignore */ }
  }

  function fromDatabaseTask(row) {
    return normaliseTask({
      id: row?.id,
      title: row?.title,
      date: row?.task_date,
      endDate: row?.end_date,
      category: row?.category,
      memo: row?.memo,
      completed: row?.completed,
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
    });
  }

  function toDatabaseTask(task, userId) {
    return {
      id: task.id || createId(),
      user_id: userId,
      title: task.title,
      task_date: task.date,
      end_date: task.endDate || null,
      category: task.category,
      memo: task.memo,
      completed: task.completed,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };
  }

  function normaliseTask(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const title = String(candidate.title ?? "").trim().slice(0, 80);
    const date = String(candidate.date ?? candidate.task_date ?? "");
    if (!title || !isValidDateKey(date)) return null;
    const rawEndDate = candidate.endDate ?? candidate.end_date ?? null;
    if (rawEndDate && (!isValidDateKey(rawEndDate) || rawEndDate < date)) return null;
    const now = new Date().toISOString();
    const created = candidate.createdAt ?? candidate.created_at;
    const updated = candidate.updatedAt ?? candidate.updated_at;
    return {
      id: String(candidate.id || createId()),
      title,
      date,
      endDate: rawEndDate || null,
      category: VALID_CATEGORIES.has(candidate.category) ? candidate.category : "work",
      memo: String(candidate.memo ?? "").trim().slice(0, 500),
      completed: Boolean(candidate.completed),
      createdAt: isValidIsoDate(created) ? String(created) : now,
      updatedAt: isValidIsoDate(updated) ? String(updated) : now,
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
    if (field === "endDate") {
      elements.taskEndDate.classList.add("invalid");
      elements.taskEndDateError.textContent = message;
      if (!elements.taskTitleError.textContent && !elements.taskDateError.textContent) elements.taskEndDate.focus();
    }
  }

  function clearFieldError(field) {
    if (field === "title") { elements.taskTitle.classList.remove("invalid"); elements.taskTitleError.textContent = ""; }
    if (field === "date") { elements.taskDate.classList.remove("invalid"); elements.taskDateError.textContent = ""; }
    if (field === "endDate") { elements.taskEndDate.classList.remove("invalid"); elements.taskEndDateError.textContent = ""; }
  }

  function clearAllFieldErrors() {
    clearFieldError("title");
    clearFieldError("date");
    clearFieldError("endDate");
  }

  function showToast(message, type = "success") {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type} visible`;
    state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2800);
  }

  function translateAuthError(error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (message.includes("email not confirmed")) return "이메일 확인을 완료한 뒤 로그인해 주세요.";
    if (message.includes("user already registered")) return "이미 가입된 이메일입니다. 로그인해 주세요.";
    if (message.includes("password") && message.includes("least")) return "비밀번호 조건을 확인해 주세요.";
    if (message.includes("rate limit")) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    return error?.message || "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isSameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function parseDateKey(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }

  function isValidDateKey(value) {
    return Boolean(parseDateKey(value));
  }

  function isValidIsoDate(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }

  function formatDateForAria(date) {
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
  }

  function getDateNumberLabel(date, isOutsideMonth) {
    return isOutsideMonth && date.getDate() === 1 ? `${date.getMonth() + 1}월 1일` : String(date.getDate());
  }

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("서비스 워커 등록 실패", error));
    });
  }
})();
