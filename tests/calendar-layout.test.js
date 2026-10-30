"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { endOfTask, overlaps, layoutWeek } = require("../calendar-layout.js");

function week(start) {
  const date = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() + offset);
    return day.toISOString().slice(0, 10);
  });
}

function task(id, date, endDate = null, completed = false) {
  return { id, date, endDate, completed, title: id, createdAt: "2026-01-01T00:00:00.000Z" };
}

function extent(segment) {
  return [segment.start, segment.end, segment.continuesBefore, segment.continuesAfter];
}

test("single-date tasks occupy exactly their date, including week endpoints", () => {
  const dates = week("2026-10-18");
  for (let index = 0; index < 7; index += 1) {
    const entry = task(`day-${index}`, dates[index]);
    const { segments, laneCount } = layoutWeek([entry], dates);
    assert.equal(endOfTask(entry), dates[index]);
    assert.equal(segments.length, 1);
    assert.deepEqual(extent(segments[0]), [index, index, false, false]);
    assert.equal(laneCount, 1);
  }
});

test("a range includes the final date and an equal start/end remains one day", () => {
  const dates = week("2026-10-18");
  const result = layoutWeek([task("example", "2026-10-22", "2026-10-23")], dates);
  assert.deepEqual(extent(result.segments[0]), [4, 5, false, false]);
  const equal = layoutWeek([task("same-day", "2026-10-22", "2026-10-22")], dates);
  assert.deepEqual(extent(equal.segments[0]), [4, 4, false, false]);
});

test("ranges wrap across Saturday/Sunday with continuation on the correct edge", () => {
  const entry = task("week-wrap", "2026-10-23", "2026-10-27");
  const left = layoutWeek([entry], week("2026-10-18")).segments[0];
  const right = layoutWeek([entry], week("2026-10-25")).segments[0];
  assert.deepEqual(extent(left), [5, 6, false, true]);
  assert.deepEqual(extent(right), [0, 2, true, false]);
  assert.equal(left.task.id, right.task.id, "segments retain one editable task identity");
});

test("month-boundary ranges remain visible through both inclusive endpoints", () => {
  const entry = task("month-wrap", "2026-10-30", "2026-11-03");
  assert.deepEqual(extent(layoutWeek([entry], week("2026-10-25")).segments[0]), [5, 6, false, true]);
  assert.deepEqual(extent(layoutWeek([entry], week("2026-11-01")).segments[0]), [0, 2, true, false]);
  assert.equal(overlaps(entry, "2026-10-01", "2026-10-31"), true);
  assert.equal(overlaps(entry, "2026-11-01", "2026-11-30"), true);
  assert.equal(overlaps(entry, "2026-12-01", "2026-12-31"), false);
});

test("year-boundary and leap-day ranges are clipped without losing dates", () => {
  const yearEntry = task("new-year", "2026-12-31", "2027-01-04");
  assert.deepEqual(extent(layoutWeek([yearEntry], week("2026-12-27")).segments[0]), [4, 6, false, true]);
  assert.deepEqual(extent(layoutWeek([yearEntry], week("2027-01-03")).segments[0]), [0, 1, true, false]);
  const leapEntry = task("leap", "2028-02-28", "2028-03-01");
  const leapWeek = week("2028-02-27");
  assert.equal(leapWeek[2], "2028-02-29");
  assert.deepEqual(extent(layoutWeek([leapEntry], leapWeek).segments[0]), [1, 3, false, false]);
});

test("a whole-week span has continuation at both edges; unrelated tasks are omitted", () => {
  const dates = week("2026-10-18");
  const result = layoutWeek([
    task("before", "2026-10-01", "2026-10-17"),
    task("after", "2026-10-25", "2026-10-26"),
    task("whole", "2026-10-01", "2026-11-03"),
  ], dates);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].task.id, "whole");
  assert.deepEqual(extent(result.segments[0]), [0, 6, true, true]);
});

test("overlapping tasks use different lanes while disjoint tasks may share a lane", () => {
  const dates = week("2026-10-18");
  const { segments } = layoutWeek([
    task("early", dates[0], dates[1]),
    task("late", dates[4], dates[5]),
    task("shared-endpoint", dates[1], dates[3]),
    task("single", dates[2]),
  ], dates);
  const byId = Object.fromEntries(segments.map((segment) => [segment.task.id, segment]));
  assert.notEqual(byId.early.lane, byId["shared-endpoint"].lane);
  assert.notEqual(byId.single.lane, byId["shared-endpoint"].lane);
  const disjoint = layoutWeek([task("a", dates[0], dates[1]), task("b", dates[2], dates[4])], dates);
  assert.equal(disjoint.laneCount, 1);
});

test("all possible in-week spans are placed without clipping or lane collisions", () => {
  const dates = week("2026-10-18");
  const tasks = [];
  for (let start = 0; start < 7; start += 1) {
    for (let end = start; end < 7; end += 1) tasks.push(task(`${start}-${end}`, dates[start], dates[end]));
  }
  const before = JSON.stringify(tasks);
  const { segments, laneCount } = layoutWeek(tasks, dates);
  assert.equal(segments.length, 28);
  for (const segment of segments) {
    assert.equal(dates[segment.start], segment.task.date);
    assert.equal(dates[segment.end], segment.task.endDate);
    assert.ok(segment.lane >= 0 && segment.lane < laneCount);
    for (const other of segments) {
      if (other !== segment && other.lane === segment.lane) {
        assert.ok(segment.end < other.start || other.end < segment.start, "same-lane segments must not overlap");
      }
    }
  }
  assert.equal(JSON.stringify(tasks), before, "layout must not mutate cached task data");
});

test("hide-completed removes the entire range, and empty weeks have no lanes", () => {
  const dates = week("2026-10-18");
  const completed = task("done", "2026-10-17", "2026-10-26", true);
  const active = task("active", "2026-10-20");
  assert.equal(layoutWeek([completed, active], dates).segments.length, 2);
  assert.deepEqual(layoutWeek([completed, active], dates, true).segments.map((segment) => segment.task.id), ["active"]);
  assert.deepEqual(layoutWeek([completed], dates, true), { segments: [], laneCount: 0 });
  assert.deepEqual(layoutWeek([], dates), { segments: [], laneCount: 0 });
});

test("monthly summary overlap includes carry-over tasks once and handles edge dates", () => {
  const entries = [
    task("carry", "2026-09-25", "2026-10-01"),
    task("whole", "2026-09-01", "2026-11-30"),
    task("last", "2026-10-31"),
    task("too-early", "2026-09-01", "2026-09-30"),
    task("too-late", "2026-11-01"),
  ];
  const monthly = entries.filter((entry) => overlaps(entry, "2026-10-01", "2026-10-31"));
  assert.deepEqual(monthly.map((entry) => entry.id), ["carry", "whole", "last"]);
});
