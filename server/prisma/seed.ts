import { PrismaClient, Role, TaskPriority, TaskStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

function fileId(n: number) {
  return `TASK-2026-${String(n).padStart(4, '0')}`;
}

async function main() {
  console.log('Seeding database...');

  // ---- Departments -----------------------------------------------------
  const headOffice = await prisma.department.create({ data: { name: 'Head Office' } });
  const projectOffice = await prisma.department.create({
    data: { name: 'Project Office', parentId: headOffice.id },
  });
  const itSection = await prisma.department.create({
    data: { name: 'IT Section', parentId: projectOffice.id },
  });
  const adminSection = await prisma.department.create({
    data: { name: 'Administration Section', parentId: projectOffice.id },
  });

  // ---- Users -------------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'tusharbiswas@nhai.org';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';

  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: adminEmail,
      passwordHash: await hash(adminPassword),
      role: Role.SUPER_ADMIN,
      designation: 'Project Director',
      departmentId: headOffice.id,
      canSubAssign: true,
    },
  });

  const officeHead = await prisma.user.create({
    data: {
      name: 'Priya Sharma',
      email: 'priya.sharma@eoffice.local',
      passwordHash: await hash('Staff@12345'),
      role: Role.ADMIN,
      designation: 'Assistant Manager',
      departmentId: projectOffice.id,
      canSubAssign: true,
    },
  });

  const staffNames = [
    ['Rahul Verma', 'rahul.verma', itSection.id, true],
    ['Ananya Das', 'ananya.das', itSection.id, false],
    ['Karan Mehta', 'karan.mehta', adminSection.id, false],
    ['Sneha Iyer', 'sneha.iyer', adminSection.id, false],
    ['Vikram Singh', 'vikram.singh', itSection.id, false],
  ] as const;

  const staff: (typeof officeHead)[] = [];
  for (const [name, emailPrefix, deptId, canSubAssign] of staffNames) {
    const u = await prisma.user.create({
      data: {
        name,
        email: `${emailPrefix}@eoffice.local`,
        passwordHash: await hash('Staff@12345'),
        role: Role.STAFF,
        designation: 'Staff',
        departmentId: deptId,
        canSubAssign,
      },
    });
    staff.push(u);
  }

  // ---- Sample tasks --------------------------------------------------
  let counter = 1;

  async function createTask(opts: {
    subject: string;
    description: string;
    priority: TaskPriority;
    status: TaskStatus;
    assignee: (typeof staff)[number];
    assigner: typeof officeHead;
    daysAgoCreated: number;
    dueInDays: number;
    completed?: boolean;
  }) {
    const createdAt = new Date(Date.now() - opts.daysAgoCreated * 86400000);
    const dueDate = new Date(Date.now() + opts.dueInDays * 86400000);

    const task = await prisma.task.create({
      data: {
        fileId: fileId(counter++),
        subject: opts.subject,
        description: opts.description,
        priority: opts.priority,
        status: opts.status,
        createdById: opts.assigner.id,
        dueDate,
        completionDate: opts.completed ? new Date() : null,
        createdAt,
      },
    });

    await prisma.taskAssignment.create({
      data: {
        taskId: task.id,
        assignedToId: opts.assignee.id,
        assignedById: opts.assigner.id,
        dueDate,
      },
    });

    await prisma.taskMovement.create({
      data: {
        taskId: task.id,
        actorId: opts.assigner.id,
        action: 'CREATED',
        newStatus: TaskStatus.NEW,
        createdAt,
      },
    });
    await prisma.taskMovement.create({
      data: {
        taskId: task.id,
        actorId: opts.assigner.id,
        action: 'ASSIGNED',
        previousStatus: TaskStatus.NEW,
        newStatus: opts.status,
        remarks: `Assigned to ${opts.assignee.name}`,
        createdAt: new Date(createdAt.getTime() + 5 * 60000),
      },
    });

    return task;
  }

  await createTask({
    subject: 'Prepare Q3 budget utilization report',
    description: 'Compile department-wise budget utilization for Q3 2026.',
    priority: TaskPriority.HIGH,
    status: TaskStatus.IN_PROGRESS,
    assignee: staff[0],
    assigner: officeHead,
    daysAgoCreated: 4,
    dueInDays: 2,
  });

  await createTask({
    subject: 'Server room AC maintenance',
    description: 'Coordinate with vendor for annual AC servicing.',
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.PENDING,
    assignee: staff[1],
    assigner: officeHead,
    daysAgoCreated: 10,
    dueInDays: -3, // overdue
  });

  await createTask({
    subject: 'Update visitor management register',
    description: 'Digitize the last quarter visitor logs.',
    priority: TaskPriority.LOW,
    status: TaskStatus.COMPLETED,
    assignee: staff[2],
    assigner: officeHead,
    daysAgoCreated: 15,
    dueInDays: -10,
    completed: true,
  });

  await createTask({
    subject: 'Renew office internet service contract',
    description: 'Negotiate renewal terms with ISP before expiry.',
    priority: TaskPriority.CRITICAL,
    status: TaskStatus.ASSIGNED,
    assignee: staff[3],
    assigner: admin,
    daysAgoCreated: 1,
    dueInDays: 5,
  });

  await createTask({
    subject: 'File annual compliance return',
    description: 'Submit statutory compliance filing for FY 2025-26.',
    priority: TaskPriority.HIGH,
    status: TaskStatus.RETURNED,
    assignee: staff[4],
    assigner: admin,
    daysAgoCreated: 20,
    dueInDays: -15,
  });

  console.log('Seed complete.');
  console.log(`Super Admin login -> ${adminEmail} / ${adminPassword}`);
  console.log(`Admin login       -> priya.sharma@eoffice.local / Staff@12345`);
  console.log(`Staff login       -> rahul.verma@eoffice.local / Staff@12345`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
