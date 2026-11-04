import type { HybridPlannerModel } from "./useHybridPlanner.js";
export function PlanningForm({ model }: { model: HybridPlannerModel }) {
  const {
    busy,
    tasks,
    setTasks,
    objectives,
    setObjectives,
    windows,
    setWindows,
    focus,
    setFocus,
    rest,
    setRest,
    changed,
    updateTask,
    build,
    newTask,
  } = model;
  return (
    <fieldset disabled={busy}>
      <legend>Tasks and availability</legend>
      {tasks.map((task, i) => (
        <fieldset key={task.id}>
          <legend>Task {i + 1}</legend>
          <label>
            Task {i + 1} title
            <input
              maxLength={180}
              value={task.title}
              onChange={(e) => updateTask(i, { title: e.target.value })}
            />
          </label>
          <label>
            Task {i + 1} deadline (optional)
            <input
              type="datetime-local"
              value={task.deadline}
              onChange={(e) => updateTask(i, { deadline: e.target.value })}
            />
          </label>
          <label>
            Task {i + 1} estimated minutes
            <input
              type="number"
              min={1}
              max={1440}
              value={task.estimatedMinutes}
              onChange={(e) => updateTask(i, { estimatedMinutes: Number(e.target.value) })}
            />
          </label>
          <label>
            Task {i + 1} completed minutes
            <input
              type="number"
              min={0}
              max={task.estimatedMinutes}
              value={task.completedMinutes}
              onChange={(e) => updateTask(i, { completedMinutes: Number(e.target.value) })}
            />
          </label>
          <label>
            Task {i + 1} priority
            <select
              aria-label={`Task ${i + 1} priority`}
              value={task.priority}
              onChange={(e) => updateTask(i, { priority: Number(e.target.value) })}
            >
              {[1, 2, 3].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Task {i + 1} difficulty
            <select
              aria-label={`Task ${i + 1} difficulty`}
              value={task.difficulty}
              onChange={(e) => updateTask(i, { difficulty: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button
            disabled={tasks.length === 1}
            onClick={() => changed(() => setTasks(tasks.filter((t) => t.id !== task.id)))}
          >
            Remove task {i + 1}
          </button>
        </fieldset>
      ))}
      <button
        disabled={tasks.length >= 20}
        onClick={() => changed(() => setTasks([...tasks, newTask()]))}
      >
        Add task
      </button>
      <label>
        Objectives (one per line, up to 8)
        <textarea
          rows={3}
          maxLength={1928}
          value={objectives}
          onChange={(e) => changed(() => setObjectives(e.target.value))}
        />
      </label>
      {windows.map((w, i) => (
        <fieldset key={i}>
          <legend>Availability {i + 1}</legend>
          <label>
            Availability {i + 1} start
            <input
              type="datetime-local"
              value={w.start}
              onChange={(e) =>
                changed(() =>
                  setWindows(
                    windows.map((v, j) => (i === j ? { ...v, start: e.target.value } : v)),
                  ),
                )
              }
            />
          </label>
          <label>
            Availability {i + 1} end
            <input
              type="datetime-local"
              value={w.end}
              onChange={(e) =>
                changed(() =>
                  setWindows(windows.map((v, j) => (i === j ? { ...v, end: e.target.value } : v))),
                )
              }
            />
          </label>
          <button
            disabled={windows.length === 1}
            onClick={() => changed(() => setWindows(windows.filter((_, j) => i !== j)))}
          >
            Remove availability {i + 1}
          </button>
        </fieldset>
      ))}
      <button
        disabled={windows.length >= 14}
        onClick={() => changed(() => setWindows([...windows, { start: "", end: "" }]))}
      >
        Add availability
      </button>
      <label>
        Planning focus interval
        <input
          type="number"
          min={5}
          max={90}
          value={focus}
          onChange={(e) => changed(() => setFocus(Number(e.target.value)))}
        />
      </label>
      <label>
        Planning break minutes
        <input
          type="number"
          min={0}
          max={30}
          value={rest}
          onChange={(e) => changed(() => setRest(Number(e.target.value)))}
        />
      </label>
      <button onClick={build}>Build baseline schedule</button>
    </fieldset>
  );
}
