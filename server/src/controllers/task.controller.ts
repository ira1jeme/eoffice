import { Response } from 'express';
import { z } from 'zod';
import {
  Prisma,
  TaskStatus,
  TaskPriority,
} from '@prisma/client';

import { prisma } from '../config/db';

import {
  AuthedRequest,
  isAdminOrAbove,
} from '../middleware/auth';

import { ApiError } from '../middleware/errorHandler';

import {
  nextFileId,
  recordMovement,
  pendingDays,
  pendingBucket,
} from '../services/task.service';

import { notify } from '../services/notification.service';
import { audit } from '../services/audit.service';

// ============================================================================
// CREATE TASK
// ============================================================================

const createTaskSchema = z.object({
  subject: z
    .string()
    .min(1, 'Subject is required.'),

  description: z
    .string()
    .optional(),

  priority: z
    .nativeEnum(TaskPriority)
    .default('MEDIUM'),

  dueDate: z
    .string()
    .datetime()
    .optional(),

  assignedToId: z
    .string()
    .min(
      1,
      'Assignee is required.'
    ),

  instructions: z
    .string()
    .optional(),

  parentTaskId: z
    .string()
    .optional(),
});

export async function createTask(
  req: AuthedRequest,
  res: Response
) {
  const data =
    createTaskSchema.parse(
      req.body
    );

  const actorId =
    req.user!.userId;

  const assignee =
    await prisma.user.findUnique({
      where: {
        id: data.assignedToId,
      },
    });

  if (
    !assignee ||
    assignee.status !== 'ACTIVE'
  ) {
    throw new ApiError(
      400,
      'Selected assignee does not exist or is disabled.'
    );
  }

  const fileId =
    await nextFileId();

  const dueDate =
    data.dueDate
      ? new Date(data.dueDate)
      : null;

  const task =
    await prisma.$transaction(
      async (tx) => {
        const created =
          await tx.task.create({
            data: {
              fileId,
              subject:
                data.subject,
              description:
                data.description,
              priority:
                data.priority,

              /*
               * A newly created task becomes
               * ASSIGNED immediately.
               */
              status:
                TaskStatus.ASSIGNED,

              createdById:
                actorId,

              dueDate,

              parentTaskId:
                data.parentTaskId,
            },
          });

        await tx.taskAssignment.create({
          data: {
            taskId:
              created.id,

            assignedToId:
              data.assignedToId,

            assignedById:
              actorId,

            instructions:
              data.instructions,

            dueDate,
          },
        });

        // Historical creation entry

        await tx.taskMovement.create({
          data: {
            taskId:
              created.id,

            actorId,

            action:
              'CREATED',

            newStatus:
              TaskStatus.NEW,
          },
        });

        // Assignment movement

        await tx.taskMovement.create({
          data: {
            taskId:
              created.id,

            actorId,

            action:
              'ASSIGNED',

            previousStatus:
              TaskStatus.NEW,

            newStatus:
              TaskStatus.ASSIGNED,

            remarks:
              `Assigned to ${assignee.name}`,
          },
        });

        return created;
      }
    );

  await notify({
    userId:
      data.assignedToId,

    type:
      'TASK_ASSIGNED',

    title:
      'New task assigned',

    message:
      `"${data.subject}" (${fileId}) has been assigned to you.`,

    taskId:
      task.id,
  });

  await audit({
    userId:
      actorId,

    action:
      'TASK_CREATED',

    entityType:
      'Task',

    entityId:
      task.id,

    details:
      fileId,

    req,
  });

  res
    .status(201)
    .json({
      task,
    });
}

// ============================================================================
// LIST TASKS WITH FILTERS
// ============================================================================

const listQuerySchema =
  z.object({
    status:
      z.nativeEnum(
        TaskStatus
      ).optional(),

    priority:
      z.nativeEnum(
        TaskPriority
      ).optional(),

    assignedToId:
      z.string().optional(),

    departmentId:
      z.string().optional(),

    search:
      z.string().optional(),

    dueFrom:
      z
        .string()
        .datetime()
        .optional(),

    dueTo:
      z
        .string()
        .datetime()
        .optional(),

    /*
     * Available scopes
     *
     * mine
     *   All active tasks assigned to logged-in user.
     *
     * pendingWithMe
     *   Tasks currently awaiting action with logged-in user.
     *
     * createdByMe
     *   Tasks created by logged-in user.
     *
     * subAssignedByMe
     *   Tasks sub-assigned by logged-in user.
     *
     * all
     *   All accessible tasks.
     */

    scope: z
      .enum([
        'mine',
        'pendingWithMe',
        'createdByMe',
        'subAssignedByMe',
        'all',
      ])
      .optional(),

    page: z.coerce
      .number()
      .min(1)
      .default(1),

    pageSize: z.coerce
      .number()
      .min(1)
      .max(100)
      .default(20),
  });

// ============================================================================
// HELPER: ADD CONDITION TO TASK WHERE.AND
// ============================================================================

function addAndCondition(
  where: Prisma.TaskWhereInput,
  condition: Prisma.TaskWhereInput
) {
  where.AND = [
    ...(Array.isArray(where.AND)
      ? where.AND
      : where.AND
        ? [where.AND]
        : []),

    condition,
  ];
}

// ============================================================================
// LIST TASKS
// ============================================================================

export async function listTasks(
  req: AuthedRequest,
  res: Response
) {
  const q =
    listQuerySchema.parse(
      req.query
    );

  const {
    userId,
    role,
    departmentId: myDeptId,
  } = req.user!;

  const where:
    Prisma.TaskWhereInput = {};

  // ==========================================================================
  // STATUS FILTER
  // ==========================================================================

  if (q.status) {
    where.status =
      q.status;
  }

  // ==========================================================================
  // PRIORITY FILTER
  // ==========================================================================

  if (q.priority) {
    where.priority =
      q.priority;
  }

  // ==========================================================================
  // DUE DATE FILTER
  // ==========================================================================

  if (
    q.dueFrom ||
    q.dueTo
  ) {
    where.dueDate = {
      ...(q.dueFrom
        ? {
            gte:
              new Date(
                q.dueFrom
              ),
          }
        : {}),

      ...(q.dueTo
        ? {
            lte:
              new Date(
                q.dueTo
              ),
          }
        : {}),
    };
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  if (q.search) {
    where.OR = [
      {
        subject: {
          contains:
            q.search,

          mode:
            'insensitive',
        },
      },

      {
        fileId: {
          contains:
            q.search,

          mode:
            'insensitive',
        },
      },

      {
        description: {
          contains:
            q.search,

          mode:
            'insensitive',
        },
      },
    ];
  }

  // ==========================================================================
  // FILTER BY ASSIGNED USER
  //
  // Use AND instead of directly setting where.assignments.
  // This prevents later scope/department filters from overwriting
  // the selected staff filter.
  // ==========================================================================

  if (
    q.assignedToId
  ) {
    addAndCondition(
      where,
      {
        assignments: {
          some: {
            assignedToId:
              q.assignedToId,

            active:
              true,
          },
        },
      }
    );
  }

  // ==========================================================================
  // SCOPE: MY TASKS
  // ==========================================================================

  if (
    q.scope === 'mine'
  ) {
    addAndCondition(
      where,
      {
        assignments: {
          some: {
            assignedToId:
              userId,

            active:
              true,
          },
        },
      }
    );
  }

  // ==========================================================================
  // SCOPE: PENDING WITH ME
  //
  // NOTE:
  // "Pending with Me" remains a LIST FILTER.
  // It is NOT TaskStatus.PENDING.
  // ==========================================================================

  else if (
    q.scope ===
    'pendingWithMe'
  ) {
    addAndCondition(
      where,
      {
        assignments: {
          some: {
            assignedToId:
              userId,

            active:
              true,
          },
        },
      }
    );

    /*
     * Anything not completed or closed
     * is considered pending/actionable.
     */

    addAndCondition(
      where,
      {
        status: {
          notIn: [
            TaskStatus.COMPLETED,
            TaskStatus.CLOSED,
          ],
        },
      }
    );

    /*
     * If logged-in user has already
     * sub-assigned the task to another user,
     * don't show it as Pending with Me.
     */

    addAndCondition(
      where,
      {
        NOT: {
          assignments: {
            some: {
              assignedById:
                userId,

              isSubAssignment:
                true,

              active:
                true,

              assignedToId: {
                not:
                  userId,
              },
            },
          },
        },
      }
    );
  }

  // ==========================================================================
  // SCOPE: CREATED BY ME
  // ==========================================================================

  else if (
    q.scope ===
    'createdByMe'
  ) {
    where.createdById =
      userId;
  }

  // ==========================================================================
  // SCOPE: SUB-ASSIGNED BY ME
  // ==========================================================================

  else if (
    q.scope ===
    'subAssignedByMe'
  ) {
    addAndCondition(
      where,
      {
        assignments: {
          some: {
            assignedById:
              userId,

            isSubAssignment:
              true,
          },
        },
      }
    );
  }

  // ==========================================================================
  // DEFAULT STAFF VISIBILITY
  // ==========================================================================

  else if (
    !isAdminOrAbove(role) &&
    q.scope !== 'all'
  ) {
    addAndCondition(
      where,
      {
        OR: [
          {
            assignments: {
              some: {
                assignedToId:
                  userId,
              },
            },
          },

          {
            createdById:
              userId,
          },
        ],
      }
    );
  }

  // ==========================================================================
  // NON-ADMIN "ALL" DEPARTMENT RESTRICTION
  // ==========================================================================

  if (
    !isAdminOrAbove(role) &&
    q.departmentId ===
      undefined &&
    q.scope === 'all'
  ) {
    addAndCondition(
      where,
      {
        assignments: {
          some: {
            assignedTo: {
              departmentId:
                myDeptId ??
                undefined,
            },
          },
        },
      }
    );
  }

  // ==========================================================================
  // EXPLICIT DEPARTMENT FILTER
  // ==========================================================================

  if (
    q.departmentId
  ) {
    addAndCondition(
      where,
      {
        assignments: {
          some: {
            assignedTo: {
              departmentId:
                q.departmentId,
            },
          },
        },
      }
    );
  }

  // ==========================================================================
  // FETCH TASKS
  // ==========================================================================

  const [
    tasks,
    total,
  ] =
    await Promise.all([
      prisma.task.findMany({
        where,

        include: {
          assignments: {
            where: {
              active:
                true,
            },

            include: {
              assignedTo: {
                select: {
                  id:
                    true,

                  name:
                    true,
                },
              },
            },
          },

          createdBy: {
            select: {
              id:
                true,

              name:
                true,
            },
          },
        },

        orderBy: [
          {
            priority:
              'asc',
          },

          {
            dueDate:
              'asc',
          },
        ],

        skip:
          (q.page - 1) *
          q.pageSize,

        take:
          q.pageSize,
      }),

      prisma.task.count({
        where,
      }),
    ]);

  // ==========================================================================
  // RESPONSE
  // ==========================================================================

  res.json({
    tasks:
      tasks.map(
        (t) => ({
          ...t,

          pendingDays:
            pendingDays(
              t
                .assignments[0]
                ?.createdAt ??
                t.createdAt
            ),
        })
      ),

    pagination: {
      page:
        q.page,

      pageSize:
        q.pageSize,

      total,
    },
  });
}

// ============================================================================
// TASK DETAIL
// ============================================================================

export async function getTask(
  req: AuthedRequest,
  res: Response
) {
  const task =
    await prisma.task.findUnique({
      where: {
        id:
          req.params.id,
      },

      include: {
        createdBy: {
          select: {
            id:
              true,

            name:
              true,

            designation:
              true,
          },
        },

        assignments: {
          orderBy: {
            createdAt:
              'asc',
          },

          include: {
            assignedTo: {
              select: {
                id:
                  true,

                name:
                  true,

                designation:
                  true,
              },
            },

            assignedBy: {
              select: {
                id:
                  true,

                name:
                  true,

                designation:
                  true,
              },
            },
          },
        },

        movements: {
          orderBy: {
            createdAt:
              'asc',
          },

          include: {
            actor: {
              select: {
                id:
                  true,

                name:
                  true,
              },
            },
          },
        },

        comments: {
          orderBy: {
            createdAt:
              'asc',
          },

          include: {
            user: {
              select: {
                id:
                  true,

                name:
                  true,
              },
            },
          },
        },

        attachments: {
          include: {
            uploadedBy: {
              select: {
                id:
                  true,

                name:
                  true,
              },
            },
          },
        },

        subTasks: {
          select: {
            id:
              true,

            fileId:
              true,

            subject:
              true,

            status:
              true,

            priority:
              true,
          },
        },

        parentTask: {
          select: {
            id:
              true,

            fileId:
              true,

            subject:
              true,
          },
        },
      },
    });

  if (!task) {
    throw new ApiError(
      404,
      'Task not found.'
    );
  }

  res.json({
    task,
  });
}

// ============================================================================
// ASSIGN / REASSIGN
// ============================================================================

const assignSchema =
  z.object({
    assignedToId:
      z
        .string()
        .min(1),

    instructions:
      z
        .string()
        .optional(),

    dueDate:
      z
        .string()
        .datetime()
        .optional(),
  });

export async function assignTask(
  req: AuthedRequest,
  res: Response
) {
  const {
    role,
    userId,
  } = req.user!;

  if (
    !isAdminOrAbove(
      role
    )
  ) {
    throw new ApiError(
      403,
      'Only admins can (re)assign tasks directly.'
    );
  }

  const data =
    assignSchema.parse(
      req.body
    );

  const task =
    await prisma.task.findUnique({
      where: {
        id:
          req.params.id,
      },
    });

  if (!task) {
    throw new ApiError(
      404,
      'Task not found.'
    );
  }

  const assignee =
    await prisma.user.findUnique({
      where: {
        id:
          data.assignedToId,
      },
    });

  if (
    !assignee ||
    assignee.status !== 'ACTIVE'
  ) {
    throw new ApiError(
      400,
      'Assignee not found or disabled.'
    );
  }

  await prisma.$transaction(
    async (tx) => {
      /*
       * Reassignment replaces all currently
       * active assignments.
       */

      await tx.taskAssignment.updateMany({
        where: {
          taskId:
            task.id,

          active:
            true,
        },

        data: {
          active:
            false,
        },
      });

      await tx.taskAssignment.create({
        data: {
          taskId:
            task.id,

          assignedToId:
            data.assignedToId,

          assignedById:
            userId,

          instructions:
            data.instructions,

          dueDate:
            data.dueDate
              ? new Date(
                  data.dueDate
                )
              : task.dueDate,
        },
      });

      await tx.task.update({
        where: {
          id:
            task.id,
        },

        data: {
          status:
            TaskStatus.ASSIGNED,

          /*
           * A reassigned task should not retain
           * an old completion timestamp.
           */
          completionDate:
            null,
        },
      });

      await recordMovementTx(
        tx,
        {
          taskId:
            task.id,

          actorId:
            userId,

          action:
            'ASSIGNED',

          previousStatus:
            task.status,

          newStatus:
            TaskStatus.ASSIGNED,

          remarks:
            `Reassigned to ${assignee.name}`,
        }
      );
    }
  );

  await notify({
    userId:
      data.assignedToId,

    type:
      'TASK_ASSIGNED',

    title:
      'Task assigned to you',

    message:
      `"${task.subject}" (${task.fileId}) has been assigned to you.`,

    taskId:
      task.id,
  });

  await audit({
    userId,

    action:
      'TASK_ASSIGNED',

    entityType:
      'Task',

    entityId:
      task.id,

    req,
  });

  res.json({
    message:
      'Task assigned.',
  });
}

// ============================================================================
// SUB-ASSIGN TASK
// ============================================================================

export async function subAssignTask(
  req: AuthedRequest,
  res: Response
) {
  const {
    role,
    userId,
    canSubAssign,
  } = req.user!;

  const data =
    assignSchema.parse(
      req.body
    );

  const task =
    await prisma.task.findUnique({
      where: {
        id:
          req.params.id,
      },

      include: {
        assignments: {
          where: {
            active:
              true,
          },
        },
      },
    });

  if (!task) {
    throw new ApiError(
      404,
      'Task not found.'
    );
  }

  const isCurrentAssignee =
    task.assignments.some(
      (a) =>
        a.assignedToId ===
        userId
    );

  if (
    !isAdminOrAbove(
      role
    ) &&
    !(
      isCurrentAssignee &&
      canSubAssign
    )
  ) {
    throw new ApiError(
      403,
      'You do not have permission to sub-assign this task.'
    );
  }

  /*
   * Do not allow a user to sub-assign the task
   * back to themselves.
   */
  if (
    data.assignedToId ===
    userId
  ) {
    throw new ApiError(
      400,
      'You cannot sub-assign a task to yourself.'
    );
  }

  const assignee =
    await prisma.user.findUnique({
      where: {
        id:
          data.assignedToId,
      },
    });

  if (
    !assignee ||
    assignee.status !== 'ACTIVE'
  ) {
    throw new ApiError(
      400,
      'Assignee not found or disabled.'
    );
  }

  await prisma.$transaction(
    async (tx) => {
      /*
       * PENDENCY TRANSFER
       *
       * A sub-assignment transfers responsibility to the
       * new assignee. Existing assignments are preserved
       * in history, but are made inactive so they no longer
       * count as pending against the previous assignee.
       *
       * This also guarantees that only the latest assignee
       * carries the active pendency.
       */
      await tx.taskAssignment.updateMany({
        where: {
          taskId:
            task.id,

          active:
            true,
        },

        data: {
          active:
            false,
        },
      });

      /*
       * Create the new active sub-assignment.
       * The new assignee now owns the task pendency.
       */
      await tx.taskAssignment.create({
        data: {
          taskId:
            task.id,

          assignedToId:
            data.assignedToId,

          assignedById:
            userId,

          instructions:
            data.instructions,

          dueDate:
            data.dueDate
              ? new Date(
                  data.dueDate
                )
              : task.dueDate,

          isSubAssignment:
            true,

          active:
            true,
        },
      });

      /*
       * Keep the task status unchanged.
       *
       * Example:
       * ASSIGNED stays ASSIGNED.
       * RETURNED stays RETURNED.
       *
       * Only responsibility/pendency is transferred.
       */
      await recordMovementTx(
        tx,
        {
          taskId:
            task.id,

          actorId:
            userId,

          action:
            'SUB_ASSIGNED',

          remarks:
            `Sub-assigned to ${assignee.name}. Pendency transferred to new assignee.`,
        }
      );
    }
  );

  await notify({
    userId:
      data.assignedToId,

    type:
      'TASK_SUB_ASSIGNED',

    title:
      'Task sub-assigned to you',

    message:
      `"${task.subject}" (${task.fileId}) has been sub-assigned to you.`,

    taskId:
      task.id,
  });

  await audit({
    userId,

    action:
      'TASK_SUB_ASSIGNED',

    entityType:
      'Task',

    entityId:
      task.id,

    details:
      `Sub-assigned to ${assignee.name}; pendency transferred.`,

    req,
  });

  res.json({
    message:
      `Task sub-assigned to ${assignee.name}. Pendency transferred to the new assignee.`,
  });
}

// ============================================================================
// SIMPLIFIED TASK STATUS WORKFLOW
//
// NEW -> ASSIGNED
//
// ASSIGNED -> SUBMITTED
//
// SUBMITTED -> COMPLETED
//           -> RETURNED
//
// RETURNED -> SUBMITTED
//
// COMPLETED -> CLOSED
//
// Legacy statuses remain in this map only so tasks already stored in the
// database with the old values can still be moved into the new workflow.
// ============================================================================

const VALID_TRANSITIONS:
  Record<
    TaskStatus,
    TaskStatus[]
  > = {
    NEW: [
      'ASSIGNED',
    ],

    ASSIGNED: [
      'SUBMITTED',
    ],

    SUBMITTED: [
      'COMPLETED',
      'RETURNED',
    ],

    RETURNED: [
      'SUBMITTED',
    ],

    COMPLETED: [
      'CLOSED',
    ],

    CLOSED: [],

    // ------------------------------------------------------------------------
    // LEGACY STATUS RECOVERY
    // ------------------------------------------------------------------------

    ACKNOWLEDGED: [
      'SUBMITTED',
    ],

    IN_PROGRESS: [
      'SUBMITTED',
    ],

    PENDING: [
      'SUBMITTED',
    ],

    UNDER_REVIEW: [
      'COMPLETED',
      'RETURNED',
    ],
  };

// ============================================================================
// STATUS REQUEST
// ============================================================================

const statusSchema =
  z.object({
    status:
      z.nativeEnum(
        TaskStatus
      ),

    remarks:
      z
        .string()
        .optional(),
  });

// ============================================================================
// UPDATE TASK STATUS
// ============================================================================

export async function updateTaskStatus(
  req: AuthedRequest,
  res: Response
) {
  const {
    userId,
    role,
  } = req.user!;

  const {
    status:
      newStatus,
    remarks,
  } =
    statusSchema.parse(
      req.body
    );

  const task =
    await prisma.task.findUnique({
      where: {
        id:
          req.params.id,
      },

      include: {
        assignments: {
          where: {
            active:
              true,
          },
        },
      },
    });

  if (!task) {
    throw new ApiError(
      404,
      'Task not found.'
    );
  }

  const isAssignee =
    task.assignments.some(
      (a) =>
        a.assignedToId ===
        userId
    );

  /*
   * Only admin/reviewer can:
   *
   * COMPLETED
   * RETURNED
   * CLOSED
   */

  const adminOnlyTransitions:
    TaskStatus[] = [
      'COMPLETED',
      'RETURNED',
      'CLOSED',
    ];

  const requiresAdmin =
    adminOnlyTransitions.includes(
      newStatus
    );

  if (
    requiresAdmin &&
    !isAdminOrAbove(
      role
    )
  ) {
    throw new ApiError(
      403,
      'Only an admin/reviewer can approve, return, or close a task.'
    );
  }

  /*
   * Submission/resubmission is allowed
   * by active assignee or admin.
   */

  if (
    !requiresAdmin &&
    !isAssignee &&
    !isAdminOrAbove(
      role
    )
  ) {
    throw new ApiError(
      403,
      'Only the assignee can submit this task.'
    );
  }

  // ==========================================================================
  // VALIDATE TRANSITION
  // ==========================================================================

  const allowed =
    VALID_TRANSITIONS[
      task.status
    ] ?? [];

  if (
    !allowed.includes(
      newStatus
    )
  ) {
    throw new ApiError(
      400,
      `Cannot move task from ${task.status} to ${newStatus}. Valid next steps: ${allowed.join(', ') || 'none'}.`
    );
  }

  // ==========================================================================
  // MOVEMENT ACTION
  // ==========================================================================

  const actionMap:
    Partial<
      Record<
        TaskStatus,
        string
      >
    > = {
      SUBMITTED:
        'SUBMITTED',

      COMPLETED:
        'APPROVED',

      RETURNED:
        'RETURNED',

      CLOSED:
        'CLOSED',
    };

  // ==========================================================================
  // UPDATE TASK + MOVEMENT
  // ==========================================================================

  await prisma.$transaction(
    async (tx) => {
      await tx.task.update({
        where: {
          id:
            task.id,
        },

        data: {
          status:
            newStatus,

          completionDate:
            newStatus ===
            'COMPLETED'
              ? new Date()
              : newStatus ===
                  'RETURNED'
                ? null
                : task.completionDate,
        },
      });

      await recordMovementTx(
        tx,
        {
          taskId:
            task.id,

          actorId:
            userId,

          action:
            actionMap[
              newStatus
            ] ??
            'STATUS_CHANGE',

          previousStatus:
            task.status,

          newStatus,

          remarks,
        }
      );
    }
  );

  // ==========================================================================
  // NOTIFICATIONS
  // ==========================================================================

  if (
    newStatus ===
    'RETURNED'
  ) {
    await Promise.all(
      task.assignments.map(
        (a) =>
          notify({
            userId:
              a.assignedToId,

            type:
              'TASK_RETURNED',

            title:
              'Task returned for correction',

            message:
              remarks ||
              `"${task.subject}" (${task.fileId}) was returned for correction.`,

            taskId:
              task.id,
          })
      )
    );
  }

  else if (
    newStatus ===
    'COMPLETED'
  ) {
    await notify({
      userId:
        task.createdById,

      type:
        'TASK_APPROVED',

      title:
        'Task approved',

      message:
        `"${task.subject}" (${task.fileId}) has been approved and marked complete.`,

      taskId:
        task.id,
    });
  }

  // ==========================================================================
  // AUDIT
  // ==========================================================================

  await audit({
    userId,

    action:
      'TASK_STATUS_CHANGE',

    entityType:
      'Task',

    entityId:
      task.id,

    details:
      `${task.status} -> ${newStatus}`,

    req,
  });

  res.json({
    message:
      `Task moved to ${newStatus}.`,
  });
}

// ============================================================================
// COMMENTS
// ============================================================================

const commentSchema =
  z.object({
    message:
      z
        .string()
        .min(1),
  });

export async function addComment(
  req: AuthedRequest,
  res: Response
) {
  const {
    message,
  } =
    commentSchema.parse(
      req.body
    );

  const task =
    await prisma.task.findUnique({
      where: {
        id:
          req.params.id,
      },
    });

  if (!task) {
    throw new ApiError(
      404,
      'Task not found.'
    );
  }

  const comment =
    await prisma.taskComment.create({
      data: {
        taskId:
          task.id,

        userId:
          req.user!.userId,

        message,
      },

      include: {
        user: {
          select: {
            id:
              true,

            name:
              true,
          },
        },
      },
    });

  await recordMovement({
    taskId:
      task.id,

    actorId:
      req.user!.userId,

    action:
      'COMMENT',

    remarks:
      message.slice(
        0,
        140
      ),
  });

  res
    .status(201)
    .json({
      comment,
    });
}

// ============================================================================
// PENDING TASK MONITOR
// ============================================================================

export async function pendingMonitor(
  req: AuthedRequest,
  res: Response
) {
  if (
    !isAdminOrAbove(
      req.user!.role
    )
  ) {
    throw new ApiError(
      403,
      'Admins only.'
    );
  }

  const staffList =
    await prisma.user.findMany({
      where: {
        status:
          'ACTIVE',
      },

      select: {
        id:
          true,

        name:
          true,

        designation:
          true,
      },
    });

  const results =
    await Promise.all(
      staffList.map(
        async (s) => {
          const assignments =
            await prisma.taskAssignment.findMany({
              where: {
                assignedToId:
                  s.id,

                active:
                  true,
              },

              include: {
                task: {
                  select: {
                    status:
                      true,

                    dueDate:
                      true,
                  },
                },
              },
            });

          const total =
            assignments.length;

          const completed =
            assignments.filter(
              (a) =>
                a.task.status ===
                  'COMPLETED' ||
                a.task.status ===
                  'CLOSED'
            ).length;

          /*
           * In the simplified workflow,
           * any task that is not COMPLETED/CLOSED
           * remains pending/actionable.
           */

          const pending =
            assignments.filter(
              (a) =>
                ![
                  'COMPLETED',
                  'CLOSED',
                ].includes(
                  a.task.status
                )
            ).length;

          const overdue =
            assignments.filter(
              (a) =>
                a.task.dueDate &&
                a.task.dueDate <
                  new Date() &&
                ![
                  'COMPLETED',
                  'CLOSED',
                ].includes(
                  a.task.status
                )
            ).length;

          const oldestPendingDays =
            assignments
              .filter(
                (a) =>
                  ![
                    'COMPLETED',
                    'CLOSED',
                  ].includes(
                    a.task.status
                  )
              )
              .map(
                (a) =>
                  pendingDays(
                    a.createdAt
                  )
              )
              .sort(
                (a, b) =>
                  b - a
              )[0];

          return {
            staff:
              s,

            total,

            pending,

            completed,

            overdue,

            oldestPendingDays:
              oldestPendingDays ??
              0,

            oldestPendingBucket:
              oldestPendingDays !==
              undefined
                ? pendingBucket(
                    oldestPendingDays
                  )
                : null,
          };
        }
      )
    );

  res.json({
    monitor:
      results,
  });
}

// ============================================================================
// TRANSACTION MOVEMENT HELPER
// ============================================================================

async function recordMovementTx(
  tx:
    Prisma.TransactionClient,

  params: {
    taskId:
      string;

    actorId:
      string;

    action:
      string;

    previousStatus?:
      TaskStatus | null;

    newStatus?:
      TaskStatus | null;

    remarks?:
      string | null;
  }
) {
  return tx.taskMovement.create({
    data: {
      taskId:
        params.taskId,

      actorId:
        params.actorId,

      action:
        params.action,

      previousStatus:
        params.previousStatus ??
        undefined,

      newStatus:
        params.newStatus ??
        undefined,

      remarks:
        params.remarks ??
        undefined,
    },
  });
}
