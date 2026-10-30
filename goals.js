(() => {
  "use strict";

  const TABLE = "calendar_goals";
  const SELECT = "id,title,period_type,period_key,completed,created_at,updated_at";
  const CACHE_PREFIX = "jangjiyeon-work-calendar.goals.v1.";

  function normaliseGoal(value) {
    if (!value || typeof value !== "object") return null;
    const title = String(value.title ?? "").trim().slice(0, 120);
    const type = value.period_type;
    const key = String(value.period_key ?? "");
    const validPeriod = type === "year" ? /^[1-9]\d{3}$/.test(key) : type === "month" && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(key);
    if (!title || !validPeriod) return null;
    const now = new Date().toISOString();
    return {
      id: String(value.id || crypto.randomUUID()),
      title,
      period_type: type,
      period_key: key,
      completed: Boolean(value.completed),
      created_at: typeof value.created_at === "string" && Number.isFinite(Date.parse(value.created_at)) ? value.created_at : now,
      updated_at: typeof value.updated_at === "string" && Number.isFinite(Date.parse(value.updated_at)) ? value.updated_at : now,
    };
  }

  function create({ supabase, showToast, canWrite }) {
    const panel = document.getElementById("goalsPanel");
    if (!panel) throw new Error("goalsPanel element is required");
    panel.classList.add("goals-panel");
    panel.setAttribute("aria-label", "연간·월간 목표");
    const state = {
      user: null, goals: [], month: new Date(), channel: null, timer: null,
      generation: 0, request: 0, loading: false, busy: false, error: "",
    };

    const dialog = document.createElement("dialog");
    dialog.className = "task-dialog goal-dialog";
    dialog.setAttribute("aria-labelledby", "goalDialogTitle");
    // This template is static; all user content is assigned through textContent/value.
    dialog.innerHTML = `
      <form class="task-form" id="goalForm" novalidate>
        <div class="dialog-header">
          <div><p class="dialog-eyebrow">나의 목표</p><h2 id="goalDialogTitle">목표 추가</h2></div>
          <button class="icon-button close-button" type="button" data-goal-close aria-label="목표 창 닫기">✕</button>
        </div>
        <input id="goalId" type="hidden">
        <div class="form-field">
          <label for="goalTitle">목표 <span aria-hidden="true">*</span></label>
          <input id="goalTitle" type="text" maxlength="120" autocomplete="off" placeholder="이루고 싶은 목표를 적어보세요" required>
        </div>
        <div class="form-row">
          <div class="form-field"><label for="goalPeriodType">목표 구분</label><select id="goalPeriodType"><option value="year">연간 목표</option><option value="month">월간 목표</option></select></div>
          <div class="form-field"><label for="goalPeriod">기간</label><input id="goalPeriod" required></div>
        </div>
        <label class="goal-completed-label"><input id="goalCompleted" type="checkbox">이 목표를 완료 상태로 표시</label>
        <p class="field-error goal-form-error" id="goalFormError" role="alert"></p>
        <div class="dialog-actions">
          <button class="button button-danger hidden" id="deleteGoalButton" type="button">삭제</button>
          <div class="dialog-actions-right">
            <button class="button button-secondary" type="button" data-goal-close>취소</button>
            <button class="button button-primary" id="saveGoalButton" type="submit">저장</button>
          </div>
        </div>
      </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector("form");
    const input = (name) => dialog.querySelector(`#${name}`);

    function periodKey(type) {
      const year = String(state.month.getFullYear());
      return type === "year" ? year : `${year}-${String(state.month.getMonth() + 1).padStart(2, "0")}`;
    }

    function make(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function render() {
      const fragment = document.createDocumentFragment();
      for (const type of ["year", "month"]) {
        const key = periodKey(type);
        const goals = state.goals.filter((goal) => goal.period_type === type && goal.period_key === key)
          .sort((a, b) => Number(a.completed) - Number(b.completed) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        const completed = goals.filter((goal) => goal.completed).length;
        const card = make("section", `goal-card goal-card-${type}`);
        const header = make("div", "goal-card-header");
        const heading = make("h2", "goal-card-title", type === "year" ? `${state.month.getFullYear()}년 목표` : `${state.month.getMonth() + 1}월 목표`);
        const count = make("span", "goal-count", `${completed} / ${goals.length} 완료`);
        header.append(heading, count);
        const add = make("button", "goal-add-button", "+ 추가");
        add.type = "button";
        add.setAttribute("aria-label", `${type === "year" ? "연간" : "월간"} 목표 추가`);
        add.disabled = state.busy || !state.user;
        add.addEventListener("click", () => openDialog(type));
        header.append(add);
        const track = make("div", "goal-progress");
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `${type === "year" ? "연간" : "월간"} 목표 달성률`);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        track.setAttribute("aria-valuenow", String(goals.length ? Math.round(completed / goals.length * 100) : 0));
        const fill = make("span");
        fill.style.width = `${goals.length ? completed / goals.length * 100 : 0}%`;
        track.append(fill);
        card.append(header, track);
        const list = make("ul", "goal-list");
        list.setAttribute("aria-label", type === "year" ? "연간 목표 목록" : "월간 목표 목록");
        for (const goal of goals) {
          const row = make("li", `goal-row${goal.completed ? " is-completed" : ""}`);
          const check = make("button", "goal-check", goal.completed ? "✓" : "");
          check.type = "button";
          check.disabled = state.busy;
          check.setAttribute("aria-label", `${goal.title} ${goal.completed ? "완료 취소" : "완료 처리"}`);
          check.setAttribute("aria-pressed", String(goal.completed));
          check.addEventListener("click", () => void toggleGoal(goal));
          const title = make("button", "goal-title-button", goal.title);
          title.type = "button";
          title.title = `${goal.title} · 수정`;
          title.setAttribute("aria-label", `${goal.title} 목표 수정`);
          title.disabled = state.busy;
          title.addEventListener("click", () => openDialog(type, goal));
          row.append(check, title);
          list.append(row);
        }
        if (!goals.length) {
          const empty = make("li", "goal-empty", state.loading ? "목표를 불러오는 중…" : `아직 ${type === "year" ? "올해" : "이달"} 목표가 없어요. + 추가로 시작하세요.`);
          list.append(empty);
        }
        card.append(list);
        fragment.append(card);
      }
      if (state.error) {
        const error = make("div", "goals-error");
        error.setAttribute("role", "status");
        error.append(make("span", "", state.error));
        const retry = make("button", "text-button", "다시 시도");
        retry.type = "button";
        retry.disabled = state.loading || !navigator.onLine;
        retry.addEventListener("click", () => void refresh());
        error.append(retry);
        fragment.append(error);
      }
      panel.replaceChildren(fragment);
    }

    function saveCache() {
      if (!state.user) return;
      try { localStorage.setItem(CACHE_PREFIX + state.user.id, JSON.stringify(state.goals)); }
      catch { /* A full or unavailable local cache must not block server writes. */ }
    }

    function readCache(id) {
      try {
        const rows = JSON.parse(localStorage.getItem(CACHE_PREFIX + id) || "[]");
        return Array.isArray(rows) ? rows.map(normaliseGoal).filter(Boolean) : [];
      } catch { return []; }
    }

    async function refresh() {
      if (!state.user || state.busy) return false;
      if (!navigator.onLine) {
        state.error = "오프라인 · 마지막으로 저장된 목표를 표시합니다.";
        render();
        return false;
      }
      const userId = state.user.id;
      const generation = state.generation;
      const request = ++state.request;
      state.loading = true;
      render();
      try {
        const { data, error } = await supabase.from(TABLE).select(SELECT).eq("user_id", userId).order("created_at", { ascending: true });
        if (generation !== state.generation || request !== state.request) return false;
        if (error) throw error;
        state.goals = (data || []).map(normaliseGoal).filter(Boolean);
        state.error = "";
        saveCache();
        return true;
      } catch (error) {
        if (generation !== state.generation || request !== state.request) return false;
        console.warn("목표 동기화 실패", error?.message || error);
        state.error = "목표를 불러오지 못했습니다. 다시 시도해 주세요.";
        return false;
      } finally {
        if (generation === state.generation && request === state.request) {
          state.loading = false;
          render();
        }
      }
    }

    function unsubscribe() {
      window.clearTimeout(state.timer);
      state.timer = null;
      if (state.channel) void supabase.removeChannel(state.channel);
      state.channel = null;
    }

    function subscribe() {
      unsubscribe();
      if (!state.user) return;
      const generation = state.generation;
      state.channel = supabase.channel(`calendar-goals-${state.user.id}-${generation}`)
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `user_id=eq.${state.user.id}` }, () => {
          if (generation !== state.generation) return;
          window.clearTimeout(state.timer);
          state.timer = window.setTimeout(() => void refresh(), 180);
        })
        .subscribe((status) => {
          if (generation !== state.generation) return;
          if (status === "SUBSCRIBED") void refresh();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            state.error = "목표 실시간 연결을 다시 시도 중입니다.";
            render();
          }
        });
    }

    function clear() {
      unsubscribe();
      ++state.generation;
      ++state.request;
      state.user = null;
      state.goals = [];
      state.loading = false;
      state.busy = false;
      state.error = "";
      if (dialog.open) dialog.close();
      render();
    }

    async function setUser(user) {
      if (!user?.id) { clear(); return false; }
      if (state.user?.id === user.id) return true;
      clear();
      state.user = { id: user.id };
      state.goals = readCache(user.id);
      state.loading = true;
      render();
      subscribe();
      return refresh();
    }

    function setMonth(date) {
      if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return;
      if (state.month.getFullYear() === date.getFullYear() && state.month.getMonth() === date.getMonth()) return;
      state.month = new Date(date.getFullYear(), date.getMonth(), 1);
      render();
    }

    function updatePeriodInput(type, value) {
      const period = input("goalPeriod");
      period.type = type === "year" ? "number" : "month";
      period.min = type === "year" ? "1000" : "1000-01";
      period.max = type === "year" ? "9999" : "9999-12";
      period.value = value || periodKey(type);
      period.setAttribute("aria-label", type === "year" ? "목표 연도" : "목표 월");
    }

    function openDialog(type, goal) {
      if (state.busy || !canWrite()) return;
      form.reset();
      form.querySelectorAll("input,select,button").forEach((control) => { control.disabled = false; });
      input("goalDialogTitle").textContent = goal ? "목표 수정" : `${type === "year" ? "연간" : "월간"} 목표 추가`;
      input("goalId").value = goal?.id || "";
      input("goalTitle").value = goal?.title || "";
      input("goalPeriodType").value = type;
      updatePeriodInput(type, goal?.period_key);
      input("goalCompleted").checked = Boolean(goal?.completed);
      input("goalFormError").textContent = "";
      input("deleteGoalButton").classList.toggle("hidden", !goal);
      input("saveGoalButton").textContent = "저장";
      dialog.showModal();
      input("goalTitle").focus();
    }

    function setBusy(busy) {
      state.busy = busy;
      form.querySelectorAll("input,select,button").forEach((control) => { control.disabled = busy; });
      input("saveGoalButton").textContent = busy ? "저장 중…" : "저장";
      render();
    }

    function upsertLocalGoal(row) {
      const goal = normaliseGoal(row);
      if (!goal) return;
      const index = state.goals.findIndex((existing) => existing.id === goal.id);
      if (index < 0) state.goals.push(goal);
      else state.goals[index] = goal;
    }

    async function mutate(action, message, { close = false, onSuccess = upsertLocalGoal } = {}) {
      if (state.busy || !state.user || !canWrite()) return false;
      const userId = state.user.id;
      const generation = state.generation;
      ++state.request; // Invalidate reads started before this mutation.
      state.loading = false;
      setBusy(true);
      try {
        const { data, error } = await action(userId);
        if (generation !== state.generation) return false;
        if (error) throw error;
        onSuccess(data);
        saveCache();
        if (close && dialog.open) dialog.close();
        showToast(message, "success");
        return true;
      } catch (error) {
        if (generation !== state.generation) return false;
        console.warn("목표 저장 실패", error?.message || error);
        const message = "목표를 저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.";
        input("goalFormError").textContent = message;
        showToast(message, "error");
        return false;
      } finally {
        if (generation === state.generation) {
          setBusy(false);
          await refresh();
        }
      }
    }

    async function saveGoal(event) {
      event.preventDefault();
      input("goalFormError").textContent = "";
      const title = input("goalTitle").value.trim();
      if (!title) {
        input("goalFormError").textContent = "목표를 입력해 주세요.";
        input("goalTitle").focus();
        return;
      }
      const id = input("goalId").value;
      const previous = state.goals.find((goal) => goal.id === id);
      const goal = normaliseGoal({
        id: id || crypto.randomUUID(), title,
        period_type: input("goalPeriodType").value,
        period_key: input("goalPeriod").value,
        completed: input("goalCompleted").checked,
        created_at: previous?.created_at,
        updated_at: new Date().toISOString(),
      });
      if (!goal) {
        input("goalFormError").textContent = "올바른 연도 또는 월을 선택해 주세요.";
        input("goalPeriod").focus();
        return;
      }
      await mutate((userId) => id
        ? supabase.from(TABLE).update({ title: goal.title, period_type: goal.period_type, period_key: goal.period_key, completed: goal.completed }).eq("user_id", userId).eq("id", id).select(SELECT).single()
        : supabase.from(TABLE).insert({ ...goal, user_id: userId }).select(SELECT).single(), "목표를 저장했습니다.", { close: true });
    }

    async function toggleGoal(goal) {
      await mutate((userId) => supabase.from(TABLE).update({ completed: !goal.completed }).eq("user_id", userId).eq("id", goal.id).select(SELECT).single(), goal.completed ? "목표를 진행 중으로 변경했습니다." : "목표를 완료했습니다!");
    }

    async function deleteGoal() {
      if (state.busy) return;
      const id = input("goalId").value;
      if (!id || !window.confirm("이 목표를 삭제할까요?")) return;
      await mutate((userId) => supabase.from(TABLE).delete().eq("user_id", userId).eq("id", id).select("id").single(), "목표를 삭제했습니다.", {
        close: true,
        onSuccess: () => { state.goals = state.goals.filter((goal) => goal.id !== id); },
      });
    }

    async function importGoals(rows) {
      if (!Array.isArray(rows)) throw new Error("목표 목록 형식이 올바르지 않습니다.");
      const goals = rows.map(normaliseGoal);
      if (goals.some((goal) => !goal)) throw new Error("복원할 목표에 올바르지 않은 값이 있습니다.");
      if (!goals.length) return 0;
      const unique = [...new Map(goals.map((goal) => [goal.id, goal])).values()];
      const success = await mutate((userId) => supabase.from(TABLE).upsert(unique.map((goal) => ({ ...goal, user_id: userId })), { onConflict: "id" }), `${unique.length}개의 목표를 복원했습니다.`, {
        onSuccess: () => unique.forEach(upsertLocalGoal),
      });
      if (!success) throw new Error("목표 복원에 실패했습니다.");
      return unique.length;
    }

    form.addEventListener("submit", saveGoal);
    input("deleteGoalButton").addEventListener("click", () => void deleteGoal());
    input("goalPeriodType").addEventListener("change", () => updatePeriodInput(input("goalPeriodType").value));
    dialog.querySelectorAll("[data-goal-close]").forEach((button) => button.addEventListener("click", () => { if (!state.busy) dialog.close(); }));
    dialog.addEventListener("cancel", (event) => { if (state.busy) event.preventDefault(); });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog || state.busy) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    window.addEventListener("online", () => { if (state.user) { subscribe(); void refresh(); } });
    window.addEventListener("offline", () => { if (state.user) { state.error = "오프라인 · 마지막으로 저장된 목표를 표시합니다."; render(); } });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.user) void refresh(); });
    render();

    return Object.freeze({ setUser, setMonth, refresh, clear, exportGoals: () => state.goals.map((goal) => ({ ...goal })), importGoals });
  }

  window.WorkCalendarGoals = Object.freeze({ create });
})();
