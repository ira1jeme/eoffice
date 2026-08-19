export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type TaskStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'RETURNED'
  | 'COMPLETED'
  | 'CLOSED';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  designation?: string | null;
  departmentId?: string | null;
  canSubAssign: boolean;
}

export interface UserSummary {
  id: string;
  name: string;
  designation?: string | null;
  role?: Role;
  departmentId?: string | null;
}

export interface TaskAssignment {
  id: string;
  assignedTo: UserSummary;
  assignedBy: UserSummary;
  instructions?: string | null;
  dueDate?: string | null;
  isSubAssignment: boolean;
  active: boolean;
  createdAt: string;
}

export interface TaskMovement {
  id: string;
  action: string;
  previousStatus?: TaskStatus | null;
  newStatus?: TaskStatus | null;
  remarks?: string | null;
  createdAt: string;
  actor: UserSummary;
}

export interface TaskComment {
  id: string;
  message: string;
  createdAt: string;
  user: UserSummary;
}

export interface TaskListItem {
  id: string;
  fileId: string;
  subject: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string | null;
  createdAt: string;
  pendingDays: number;
  createdBy: UserSummary;
  assignments: TaskAssignment[];
}

export interface TaskDetail extends TaskListItem {
  description?: string | null;
  completionDate?: string | null;
  movements: TaskMovement[];
  comments: TaskComment[];
  attachments: AttachmentSummary[];
  subTasks: { id: string; fileId: string; subject: string; status: TaskStatus; priority: TaskPriority }[];
  parentTask?: { id: string; fileId: string; subject: string } | null;
}

export type LeaveType = 'CASUAL' | 'SICK' | 'EARNED' | 'UNPAID' | 'OTHER';
export type LeaveStatus = 'APPLIED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface AttachmentSummary {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy?: UserSummary;
}

export interface LeaveRequestItem {
  id: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewRemarks?: string | null;
  createdAt: string;
  user: UserSummary;
  reviewedBy?: UserSummary | null;
  attachments: AttachmentSummary[];
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  task?: { id: string; fileId: string; subject: string } | null;
  leaveRequest?: { id: string; leaveType: LeaveType } | null;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
}

export interface DashboardStats {
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dueToday: number;
  dueThisWeek: number;
  assignedToMe: number;
  subAssignedByMe: number;
  awaitingApproval: number;
  totalStaff: number;
  staffOnLeaveToday: number;
}
