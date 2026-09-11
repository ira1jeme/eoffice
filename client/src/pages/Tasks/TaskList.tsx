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

  const scope = params.get('scope') ?? '';
  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const searchParam = params.get('search') ?? '';

  const [search, setSearch] = useState(searchParam);

  /*
   * Pending with Me is a scope, not a TaskStatus.
   * This makes it appear as the selected value in the
   * status dropdown when scope=pendingWithMe.
   */
  const statusFilterValue =
    scope === 'pendingWithMe'
      ? 'pendingWithMe'
      : status;

  // --------------------------------------------------------------------------
  // LOAD TASKS
  // --------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      try {
        setLoading(true);

        const response = await api.get('/tasks', {
          params: {
            scope: scope || undefined,
            status: status || undefined,
            priority: priority || undefined,
            search: searchParam || undefined,
            pageSize: 50,
          },
        });

        if (cancelled) return;

        setTasks(response.data.tasks ?? []);
        setTotal(response.data.pagination?.total ?? 0);
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

    loadTasks();

    return () => {
      cancelled = true;
    };
  }, [scope, status, priority, searchParam]);

  // Keep search box in sync with URL
  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);

  // --------------------------------------------------------------------------
  // UPDATE A URL PARAMETER
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
  // SEARCH
  // --------------------------------------------------------------------------

  function applySearch() {
    const next = new URLSearchParams(params);

    const trimmed = search.trim();

    if (trimmed) {
      next.set('search', trimmed);
    } else {
      next.delete('search');
    }

    setParams(next);
  }

  // --------------------------------------------------------------------------
  // STATUS / PENDING WITH ME FILTER
  // --------------------------------------------------------------------------

  function handleStatusFilter(value: string) {
    const next = new URLSearchParams(params);

    /*
     * Pending with Me:
     * sends scope=pendingWithMe
     * and removes the normal status filter.
     */
    if (value === 'pendingWithMe') {
      next.set('scope', 'pendingWithMe');
      next.delete('status');

      setParams(next);
      return;
    }

    /*
     * If leaving Pending with Me, remove only
     * the pendingWithMe scope.
     *
     * Other scopes such as mine/createdByMe/
     * subAssignedByMe are preserved.
     */
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

      {/* FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3">

        <div className="flex flex-wrap items-center gap-2">

          {/* SEARCH */}
          <input
            className="input w-56"
            placeholder="Search Task ID, subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applySearch();
              }
            }}
          />

          {/* STATUS / PENDING WITH ME */}
          <select
            className="input w-auto"
            value={statusFilterValue}
            onChange={(e) => handleStatusFilter(e.target.value)}
          >
            <option value="">
              All statuses
            </option>

            <option value="pendingWithMe">
              Pending with Me
            </option>

            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          {/* PRIORITY */}
          <select
            className="input w-auto"
            value={priority}
            onChange={(e) =>
              updateParam('priority', e.target.value)
            }
          >
            <option value="">
              All priorities
            </option>

            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* CLEAR SCOPE */}
          {scope && (
            <button
              type="button"
              className="btn-secondary"
              onClick={clearScope}
            >
              Clear scope
            </button>
          )}
        </div>

        <Link to="/tasks/new" className="btn-primary">
          + New Task
        </Link>
      </div>

      {/* TASK TABLE */}
      <div className="card overflow-hidden">

        <table className="w-full text-sm">

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

          <tbody>

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

            {!loading && tasks.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate2-500"
                >
                  No tasks match these filters.
                </td>
              </tr>
            )}

            {!loading &&
              tasks.map((task) => {
                const overdue =
                  !!task.dueDate &&
                  new Date(task.dueDate) < new Date() &&
                  !['COMPLETED', 'CLOSED'].includes(task.status);

                return (
                  <tr
                    key={task.id}
                    className="border-b border-border2 last:border-0 hover:bg-navy-50/50"
                  >

                    {/* TASK */}
                    <td className="px-4 py-2.5">

                      <Link
                        to={`/tasks/${task.id}`}
                        className="hover:underline"
                      >
                        <span className="file-stamp mr-2">
                          {task.fileId}
                        </span>

                        {task.subject}
                      </Link>

                    </td>

                    {/* ASSIGNED TO */}
                    <td className="px-4 py-2.5 text-slate2-600">
                      {task.assignments?.[0]?.assignedTo?.name ?? '—'}
                    </td>

                    {/* PRIORITY */}
                    <td className="px-4 py-2.5">
                      <PriorityTag priority={task.priority} />
                    </td>

                    {/* DUE DATE */}
                    <td
                      className={`px-4 py-2.5 ${
                        overdue
                          ? 'font-medium text-danger-500'
                          : 'text-slate2-600'
                      }`}
                    >
                      {task.dueDate
                        ? format(
                            new Date(task.dueDate),
                            'dd MMM yyyy'
                          )
                        : '—'}

                      {overdue ? ' (overdue)' : ''}
                    </td>

                    {/* STATUS */}
                    <td className="px-4 py-2.5">
                      <StatusBadge status={task.status} />
                    </td>

                    {/* PENDING DAYS */}
                    <td className="px-4 py-2.5 text-slate2-600">
                      {task.pendingDays}d
                    </td>

                  </tr>
                );
              })}

          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate2-500">
        {total} task(s) found.
      </p>
    </div>
  );
}
