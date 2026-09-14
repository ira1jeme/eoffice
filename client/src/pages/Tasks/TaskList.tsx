import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';

import { api } from '../../api/client';
import {
  TaskListItem,
  TaskPriority,
  TaskStatus,
  UserSummary,
} from '../../types';

import { StatusBadge } from '../../components/Tasks/StatusBadge';
import { PriorityTag } from '../../components/Tasks/PriorityTag';

// ============================================================================
// ACTIVE TASK STATUSES
//
// Old statuses such as ACKNOWLEDGED, IN_PROGRESS,
// PENDING and UNDER_REVIEW are intentionally hidden.
// ============================================================================

const STATUSES: TaskStatus[] = [
  'ASSIGNED',
  'SUBMITTED',
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
  const [staff, setStaff] = useState<UserSummary[]>([]);

  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // ==========================================================================
  // URL FILTER VALUES
  // ==========================================================================

  const scope = params.get('scope') ?? '';
  const status = params.get('status') ?? '';
  const priority = params.get('priority') ?? '';
  const assignedToId = params.get('assignedToId') ?? '';
  const searchParam = params.get('search') ?? '';

  const [search, setSearch] = useState(searchParam);

  /*
   * "Pending with Me" is NOT TaskStatus.PENDING.
   *
   * It is a special task-list scope meaning:
   * tasks currently pending/actionable with the logged-in user.
   */
  const statusFilterValue =
    scope === 'pendingWithMe'
      ? 'pendingWithMe'
      : status;

  // ==========================================================================
  // LOAD STAFF DIRECTORY
  // ==========================================================================

  useEffect(() => {
    let cancelled = false;

    async function loadStaff() {
      try {
        const response = await api.get('/users/directory');

        if (cancelled) {
          return;
        }

        setStaff(response.data.users ?? []);
      } catch (error) {
        console.error(
          'Failed to load staff directory:',
          error
        );

        if (!cancelled) {
          setStaff([]);
        }
      }
    }

    loadStaff();

    return () => {
      cancelled = true;
    };
  }, []);

  // ==========================================================================
  // LOAD TASKS
  // ==========================================================================

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
            assignedToId:
              assignedToId || undefined,
            search: searchParam || undefined,
            pageSize: 50,
          },
        });

        if (cancelled) {
          return;
        }

        setTasks(
          response.data.tasks ?? []
        );

        setTotal(
          response.data.pagination?.total ?? 0
        );
      } catch (error) {
        console.error(
          'Failed to load tasks:',
          error
        );

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
  }, [
    scope,
    status,
    priority,
    assignedToId,
    searchParam,
  ]);

  // ==========================================================================
  // KEEP SEARCH BOX SYNCHRONISED WITH URL
  // ==========================================================================

  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);

  // ==========================================================================
  // GENERIC URL PARAMETER UPDATE
  // ==========================================================================

  function updateParam(
    key: string,
    value: string
  ) {
    const next =
      new URLSearchParams(params);

    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setParams(next);
  }

  // ==========================================================================
  // USER FILTER
  // ==========================================================================

  function handleUserFilter(
    userId: string
  ) {
    const next =
      new URLSearchParams(params);

    if (userId) {
      /*
       * Once a specific staff member is selected,
       * remove personal scopes such as:
       *
       * mine
       * pendingWithMe
       * createdByMe
       * subAssignedByMe
       *
       * so the selected staff member becomes
       * the primary assignment filter.
       */
      next.delete('scope');

      next.set(
        'assignedToId',
        userId
      );
    } else {
      next.delete('assignedToId');
    }

    setParams(next);
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  function applySearch() {
    const next =
      new URLSearchParams(params);

    const trimmed =
      search.trim();

    if (trimmed) {
      next.set(
        'search',
        trimmed
      );
    } else {
      next.delete('search');
    }

    setParams(next);
  }

  // ==========================================================================
  // STATUS / PENDING-WITH-ME FILTER
  // ==========================================================================

  function handleStatusFilter(
    value: string
  ) {
    const next =
      new URLSearchParams(params);

    /*
     * Pending with Me is a special SCOPE,
     * not the old PENDING task status.
     */
    if (value === 'pendingWithMe') {
      next.set(
        'scope',
        'pendingWithMe'
      );

      next.delete('status');

      /*
       * Pending with Me always refers to
       * logged-in user, so clear staff filter.
       */
      next.delete('assignedToId');

      setParams(next);

      return;
    }

    /*
     * When leaving Pending with Me,
     * remove that scope.
     */
    if (
      next.get('scope') ===
      'pendingWithMe'
    ) {
      next.delete('scope');
    }

    if (value) {
      next.set(
        'status',
        value
      );
    } else {
      next.delete('status');
    }

    setParams(next);
  }

  // ==========================================================================
  // CLEAR SCOPE
  // ==========================================================================

  function clearScope() {
    const next =
      new URLSearchParams(params);

    next.delete('scope');

    setParams(next);
  }

  // ==========================================================================
  // CLEAR ALL FILTERS
  // ==========================================================================

  function clearAllFilters() {
    setSearch('');

    setParams(
      new URLSearchParams()
    );
  }

  // ==========================================================================
  // SELECTED STAFF MEMBER
  // ==========================================================================

  const selectedUser =
    staff.find(
      (person) =>
        person.id === assignedToId
    );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="space-y-4">

      {/* ================================================================ */}
      {/* FILTER BAR                                                       */}
      {/* ================================================================ */}

      <div className="card p-4">

        <div className="flex flex-wrap items-end justify-between gap-4">

          <div className="flex flex-wrap items-end gap-3">

            {/* SEARCH */}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Search
              </label>

              <div className="flex gap-2">

                <input
                  className="input w-56"
                  placeholder="Task ID, subject…"
                  value={search}
                  onChange={(e) =>
                    setSearch(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter'
                    ) {
                      applySearch();
                    }
                  }}
                />

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={applySearch}
                >
                  Search
                </button>

              </div>
            </div>

            {/* ========================================================== */}
            {/* FILTER BY USER                                             */}
            {/* ========================================================== */}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Assigned To
              </label>

              <select
                className="input min-w-[190px]"
                value={assignedToId}
                onChange={(e) =>
                  handleUserFilter(
                    e.target.value
                  )
                }
              >
                <option value="">
                  All Users
                </option>

                {staff.map(
                  (person) => (
                    <option
                      key={person.id}
                      value={person.id}
                    >
                      {person.name}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* ========================================================== */}
            {/* STATUS                                                     */}
            {/* ========================================================== */}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Status
              </label>

              <select
                className="input min-w-[175px]"
                value={
                  statusFilterValue
                }
                onChange={(e) =>
                  handleStatusFilter(
                    e.target.value
                  )
                }
              >
                <option value="">
                  All Statuses
                </option>

                <option value="pendingWithMe">
                  Pending with Me
                </option>

                {STATUSES.map(
                  (s) => (
                    <option
                      key={s}
                      value={s}
                    >
                      {s.replace(
                        /_/g,
                        ' '
                      )}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* ========================================================== */}
            {/* PRIORITY                                                   */}
            {/* ========================================================== */}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate2-600">
                Priority
              </label>

              <select
                className="input min-w-[145px]"
                value={priority}
                onChange={(e) =>
                  updateParam(
                    'priority',
                    e.target.value
                  )
                }
              >
                <option value="">
                  All Priorities
                </option>

                {PRIORITIES.map(
                  (p) => (
                    <option
                      key={p}
                      value={p}
                    >
                      {p}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* CLEAR SCOPE */}

            {scope && (
              <button
                type="button"
                className="btn-secondary"
                onClick={clearScope}
              >
                Clear Scope
              </button>
            )}

            {/* CLEAR ALL FILTERS */}

            {(scope ||
              status ||
              priority ||
              assignedToId ||
              searchParam) && (
              <button
                type="button"
                className="btn-secondary"
                onClick={
                  clearAllFilters
                }
              >
                Clear Filters
              </button>
            )}

          </div>

          {/* NEW TASK */}

          <Link
            to="/tasks/new"
            className="btn-primary"
          >
            + New Task
          </Link>

        </div>
      </div>

      {/* ================================================================ */}
      {/* ACTIVE USER FILTER MESSAGE                                       */}
      {/* ================================================================ */}

      {selectedUser && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border2 bg-navy-50/50 px-4 py-2">

          <p className="text-sm text-slate2-700">

            Showing tasks currently assigned to{' '}

            <span className="font-semibold text-navy-900">
              {selectedUser.name}
            </span>

          </p>

          <button
            type="button"
            className="text-xs font-medium text-navy-600 hover:underline"
            onClick={() =>
              handleUserFilter('')
            }
          >
            Show All Users
          </button>

        </div>
      )}

      {/* ================================================================ */}
      {/* TASK TABLE                                                       */}
      {/* ================================================================ */}

      <div className="card overflow-hidden">

        <div className="overflow-x-auto">

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

              {/* LOADING */}

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

              {/* NO RESULTS */}

              {!loading &&
                tasks.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-slate2-500"
                    >
                      {selectedUser
                        ? `No tasks are currently assigned to ${selectedUser.name}.`
                        : 'No tasks match these filters.'}
                    </td>
                  </tr>
                )}

              {/* TASK ROWS */}

              {!loading &&
                tasks.map(
                  (task) => {
                    const overdue =
                      !!task.dueDate &&
                      new Date(
                        task.dueDate
                      ) <
                        new Date() &&
                      ![
                        'COMPLETED',
                        'CLOSED',
                      ].includes(
                        task.status
                      );

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

                          {task.assignments
                            ?.length
                            ? task.assignments
                                .map(
                                  (assignment) =>
                                    assignment
                                      .assignedTo
                                      ?.name
                                )
                                .filter(
                                  Boolean
                                )
                                .join(', ')
                            : '—'}

                        </td>

                        {/* PRIORITY */}

                        <td className="px-4 py-2.5">

                          <PriorityTag
                            priority={
                              task.priority
                            }
                          />

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
                                new Date(
                                  task.dueDate
                                ),
                                'dd MMM yyyy'
                              )
                            : '—'}

                          {overdue
                            ? ' (overdue)'
                            : ''}

                        </td>

                        {/* STATUS */}

                        <td className="px-4 py-2.5">

                          <StatusBadge
                            status={
                              task.status
                            }
                          />

                        </td>

                        {/* PENDING DAYS */}

                        <td className="px-4 py-2.5 text-slate2-600">
                          {task.pendingDays}d
                        </td>

                      </tr>
                    );
                  }
                )}

            </tbody>

          </table>

        </div>
      </div>

      {/* ================================================================ */}
      {/* RESULT COUNT                                                     */}
      {/* ================================================================ */}

      <p className="text-xs text-slate2-500">

        {total} task(s) found

        {selectedUser
          ? ` for ${selectedUser.name}`
          : ''}

        .

      </p>

    </div>
  );
}
