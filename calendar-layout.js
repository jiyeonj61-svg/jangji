(function (root) {
  "use strict";

  function endOfTask(task) {
    return task.endDate || task.date;
  }

  function overlaps(task, start, end) {
    return task.date <= end && endOfTask(task) >= start;
  }

  // A task occupies one continuous lane per week, including both end dates.
  function layoutWeek(tasks, dates, hideCompleted = false) {
    const segments = tasks
      .filter((task) => (!hideCompleted || !task.completed) && overlaps(task, dates[0], dates[6]))
      .map((task) => ({
        task,
        start: Math.max(0, dates.findIndex((date) => date >= task.date)),
        end: dates.reduce((last, date, index) => date <= endOfTask(task) ? index : last, 0),
        continuesBefore: task.date < dates[0],
        continuesAfter: endOfTask(task) > dates[6],
      }))
      .sort((a, b) => (b.end - b.start) - (a.end - a.start)
        || a.start - b.start
        || Number(a.task.completed) - Number(b.task.completed)
        || a.task.createdAt.localeCompare(b.task.createdAt)
        || a.task.id.localeCompare(b.task.id));
    const lanes = [];
    for (const segment of segments) {
      let lane = lanes.findIndex((occupied) => !occupied.some(([start, end]) => segment.start <= end && segment.end >= start));
      if (lane < 0) { lane = lanes.length; lanes.push([]); }
      lanes[lane].push([segment.start, segment.end]);
      segment.lane = lane;
    }
    return { segments, laneCount: lanes.length };
  }

  const api = { endOfTask, overlaps, layoutWeek };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CalendarLayout = api;
})(typeof window !== "undefined" ? window : globalThis);
