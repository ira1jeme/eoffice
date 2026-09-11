import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { api } from '../../api/client';
import { TaskListItem, TaskPriority, TaskStatus } from '../../types';
import { StatusBadge } from '../../components/Tasks/StatusBadge';
import { PriorityTag } from '../../components/Tasks/PriorityTag';

const STATUSES: TaskStatus[] = [
  'NEW',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'PENDING',
  'SUBMITTED',
  'UNDER_REVIEW',
  'RETURNED',
  'COMPLETED',
  'CLOSED',
];

const PRIORITIES: TaskPriority[] = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
];

export function TaskList() {
  const [params, setParams] = useSearchParams();

  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(
    params.get('search') ?? ''
  );

  const scope = params.get('scope') ?? '';
  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';

  // --------------------------------------------------------------------------
  // STATUS DROPDOWN VALUE
  //
  // "Pending with Me" is not a real TaskStatus.
  // It is a special scope handled by the backend.
  // --------------------------------------------------------------------------

  const statusFilterValue =
    scope === 'pendingWithMe'
      ? 'pendingWithMe'
      : status;

  // --------------------------------------------------------------------------
  // LOAD TASKS
  // --------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const res = await api.get('/tasks', {
          params: {
            scope: scope || undefined,
            status: status || undefined,
            priority: priority || undefined,
            search: params.get('search') || undefined,
            pageSize: 50,
          },
        });

        if (cancelled) return;

        setTasks(res.data.tasks);
        setTotal(res.data.pagination.total);
      } catch (error) {
        console.error('Failed to load tasks:', error);

        if (!cancelled) {
          setTasks([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [scope, status, priority, params]);

  // --------------------------------------------------------------------------
  // UPDATE URL PARAMETER
  // --------------------------------------------------------------------------

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);

    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setParams(next);
  }

  // --------------------------------------------------------------------------
  // STATUS / PENDING WITH ME FILTER
  // --------------------------------------------------------------------------

  function handleStatusFilter(value: string) {
    const next = new URLSearchParams(params);

    // --------------------------------------------------
    // PENDING WITH ME
    //
    // This is a scope, NOT a TaskStatus.
    // --------------------------------------------------

    if (value === 'pendingWithMe') {
      next.set('scope', 'pendingWithMe');

      // Remove normal status because Pending with Me
      // already selects all non-completed/non-closed tasks
      // currently lying with the logged-in user.
      next.delete('status');

      setParams(next);
      return;
    }

    // --------------------------------------------------
    // NORMAL STATUS FILTER
    // --------------------------------------------------

    // If user was previously viewing Pending with Me,
    // remove that special scope when switching back
    // to a normal status.
    if (next.get('scope') === 'pendingWithMe') {
      next.delete('scope');
    }

    if (value) {
      next.set('status', value);
    } else {
      next.delete('status');
    }

    setParams(next);
  }

  // --------------------------------------------------------------------------
  // CLEAR SCOPE
  // --------------------------------------------------------------------------

  function clearScope() {
    const next = new URLSearchParams(params);

    next.delete('scope');

    setParams(next);
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="space-y-4">

      {/* ------------------------------------------------------------------ */}
      {/* FILTER BAR                                                         */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div className="flex flex-wrap items-center gap-2">

          {/* SEARCH ------------------------------------------------------- */}

          <input
            className="input w-56"
            placeholder="Search Task ID, subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateParam('search', search);
              }
            }}
          />

          {/* STATUS / PENDING WITH ME ------------------------------------ */}

          <select
            className="input w-auto"
            value={statusFilterValue}
            onChange={(e) =>
              handleStatusFilter(e.target.value)
            }
          >
            <option value="">
              All statuses
            </option>

            {/* Special filter */}
            <option value="pendingWithMe">
              Pending with Me
            </option>

            {STATUSES.map((s) => (
              <option
                key={s}
                value={s}
              >
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* PRIORITY ----------------------------------------------------- */}

          <select
            className="input w-auto"
            value={priority}
            onChange={(e) =>
              updateParam(
                'priority',
                e.target.value
              )
            }
          >
            <option value="">
              All priorities
            </option>

            {PRIORITIES.map((p) => (
              <option
                key={p}
                value={p}
              >
                {p}
              </option>
            ))}
          </select>

          {/* CLEAR ACTIVE SCOPE ------------------------------------------ */}

          {scope && (
            <button
              className="btn-secondary"
              onClick={clearScope}
            >
              Clear scope
            </button>
          )}

        </div>

        {/* NEW TASK ------------------------------------------------------- */}

        <Link
          to="/tasks/new"
          className="btn-primary"
        >
          + New Task
        </Link>

      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TASK TABLE                                                         */}
      {/* ------------------------------------------------------------------ */}

      <div className="card overflow-hidden">

        <table className="w-full text-sm">

          {/* TABLE HEADER ------------------------------------------------- */}

          <thead>
            <tr className="border-b border-border2 bg-navy-50/60 text-left text-xs uppercase tracking-wide text-slate2-500">

              <th className="px-4 py-2.5 font-medium">
                Task
              </th>

              <th className="px-4 py-2.5 font-medium">
                Assigned To
              </th>

              <th className="px-4 py-2.5 font-medium">
                Priority
              </th>

              <th className="px-4 py-2.5 font-medium">
                Due Date
              </th>

              <th className="px-4 py-2.5 font-medium">
                Status
              </th>

              <th className="px-4 py-2.5 font-medium">
                Pending
              </th>

            </tr>
          </thead>

          {/* TABLE BODY --------------------------------------------------- */}

          <tbody>

            {/* LOADING ---------------------------------------------------- */}

            {loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate2-500"
                >
                  Loading…
                </td>
              </tr>
            )}

            {/* NO RESULTS ------------------------------------------------- */}

            {!loading &&
              tasks.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate2-500"
                  >
                    No tasks match these filters.
                  </td>
                </tr>
              )}

            {/* TASK ROWS -------------------------------------------------- */}

            {!loading &&
              tasks.map((t) => {

                const overdue =
                  t.dueDate &&
                  new Date(t.dueDate) <
                    new Date() &&
                  ![
                    'COMPLETED',
                    'CLOSED',
                  ].includes(t.status);

                return (
                  <tr
                    key={t.id}
                    className="border-b border-border2 last:border-0 hover:bg-navy-50/50"
                  >

                    {/* TASK ----------------------------------------------- */}

                    <td className="px-4 py-2.5">

                      <Link
                        to={`/tasks/${t.id}`}
                        className="hover:underline"
                      >
                        <span className="file-stamp mr-2">
                          {t.fileId}
                        </span>

                        {t.subject}
                      </Link>

                    </td>

                    {/* ASSIGNED TO ---------------------------------------- */}

                    <td className="px-4 py-2.5 text-slate2-600">

                      {t.assignments[0]
                        ?.assignedTo.name ??
                        '—'}

                    </td>

                    {/* PRIORITY ------------------------------------------- */}

                    <td className="px-4 py-2.5">

                      <PriorityTag
                        priority={
                          t.priority
                        }
                      />

                    </td>

                    {/* DUE DATE ------------------------------------------- */}

                    <td
                      className={`px-4 py-2.5 ${
                        overdue
                          ? 'font-medium text-danger-500'
                          : 'text-slate2-600'
                      }`}
                    >

                      {t.dueDate
                        ? format(
                            new Date(
                              t.dueDate
                            ),
                            'dd MMM yyyy'
                          )
                        : '—'}

                      {overdue
                        ? ' (overdue)'
                        : ''}

                    </td>

                    {/* STATUS --------------------------------------------- */}

                    <td className="px-4 py-2.5">

                      <StatusBadge
                        status={
                          t.status
                        }
                      />

                    </td>

                    {/* PENDING DAYS --------------------------------------- */}

                    <td className="px-4 py-2.5 text-slate2-600">

                      {t.pendingDays}d

                    </td>

                  </tr>
                );
              })}

          </tbody>

        </table>

      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RESULT COUNT                                                       */}
      {/* ------------------------------------------------------------------ */}

      <p className="text-xs text-slate2-500">
        {total} task(s) found.
      </p>

    </div>
  );
}
