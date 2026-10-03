/* =====================================================
   DATA LAYER – localStorage CRUD + Seed Data
   =====================================================
   All business data persists in the browser via localStorage (DevTools → Application).
   Login session (who is signed in) uses sessionStorage — see js/auth.js.

   Logical “tables” ↔ storage keys / shapes
   -----------------------------------------
   1) Salary structure (inputs used to compute pay)
      • pms_employees — per person: daily_salary, hra_amount, ta_amount, da_amount, pf_percent, …
      • pms_payroll_config — defaults: default_hra, default_ta, default_da
      Helpers: getSalaryStructureDefaults() → getPayrollConfig()

   2) Attendance
      • pms_attendance — rows: attendance_id, emp_id, date (YYYY-MM-DD), status, work_hours, note
      Helpers: getAttendanceTable() → getAttendance()

   3) Payroll (monthly salary calculation / payslip source)
      • pms_salaries — rows: salary_id, emp_id, month, year, basic_salary, hra, da, ta, pf,
        advance_amount, gross_salary, total_deductions (PF + advance), net_salary,
        working_days, present_days, … (no tax / total_hours fields)
      Helpers: getPayrollRecords() → getSalaries()

   4) Users / login (optional second store not required — credentials live here)
      • pms_admins — admin login: admin_id, username, password
      • pms_employees — employee portal login: same row as profile; email + password
      App code: findAdmin(), findEmployeeByLogin() — email or numeric Employee ID

   Other: pms_departments, pms_leaves, pms_counters, pms_seeded flag.
   ===================================================== */
const DB = {
  ADMINS: 'pms_admins',
  EMPLOYEES: 'pms_employees',
  DEPARTMENTS: 'pms_departments',
  /** Payroll table — monthly calculated salary per employee */
  SALARIES: 'pms_salaries',
  /** Attendance table — daily marks */
  ATTENDANCE: 'pms_attendance',
  LEAVES: 'pms_leaves',
  COUNTERS: 'pms_counters',
  /** Default allowances (salary structure fallbacks) */
  CONFIG: 'pms_payroll_config',
};

function getPayrollConfig() {
  try {
    const raw = localStorage.getItem(DB.CONFIG);
    const o = raw ? JSON.parse(raw) : null;
    return {
      default_hra: Math.max(0, parseFloat(o?.default_hra) || 0),
      default_ta: Math.max(0, parseFloat(o?.default_ta) || 0),
      default_da: Math.max(0, parseFloat(o?.default_da) || 0),
    };
  } catch {
    return {
      default_hra: 0,
      default_ta: 0,
      default_da: 0,
    };
  }
}

/** Salary-structure defaults (HRA/TA/DA) stored in pms_payroll_config. */
function getSalaryStructureDefaults() {
  return getPayrollConfig();
}

function setPayrollConfig(data) {
  const cur = getPayrollConfig();
  const next = {
    default_hra: data.default_hra != null
      ? Math.max(0, parseFloat(data.default_hra) || 0)
      : cur.default_hra,
    default_ta: data.default_ta != null
      ? Math.max(0, parseFloat(data.default_ta) || 0)
      : cur.default_ta,
    default_da: data.default_da != null
      ? Math.max(0, parseFloat(data.default_da) || 0)
      : cur.default_da,
  };
  localStorage.setItem(DB.CONFIG, JSON.stringify(next));
  return next;
}

// ---- Generic helpers ----
function dbGet(key) {
  return JSON.parse(localStorage.getItem(key) || '[]');
}
function dbSet(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ---- Counter (auto-increment IDs) ----
function getNextId(entity) {
  const counters = JSON.parse(localStorage.getItem(DB.COUNTERS) || '{}');
  const next = (counters[entity] || 0) + 1;
  counters[entity] = next;
  localStorage.setItem(DB.COUNTERS, JSON.stringify(counters));
  return next;
}

// =====================================================
// ADMIN CRUD
// =====================================================
function getAdmins() { return dbGet(DB.ADMINS); }

function findAdmin(username, password) {
  return getAdmins().find(a => a.username === username && a.password === password);
}

// =====================================================
// DEPARTMENT CRUD
// =====================================================
function getDepartments() { return dbGet(DB.DEPARTMENTS); }

function addDepartment(name) {
  const deps = getDepartments();
  const dept = { dept_id: getNextId('dept'), name };
  deps.push(dept);
  dbSet(DB.DEPARTMENTS, deps);
  return dept;
}

function updateDepartment(id, name) {
  const deps = getDepartments().map(d => d.dept_id === id ? { ...d, name } : d);
  dbSet(DB.DEPARTMENTS, deps);
}

function deleteDepartment(id) {
  dbSet(DB.DEPARTMENTS, getDepartments().filter(d => d.dept_id !== id));
}

/**
 * Merge legacy duplicate names into canonical ORG names, then remove exact duplicate rows.
 * Safe to call multiple times.
 */
function mergeDepartmentAliasPairs() {
  const pairs = [
    ['Human Resources', 'Human Resources (HR)'],
    ['Finance', 'Accounts / Finance'],
    ['IT Department', 'IT'],
  ];
  pairs.forEach(([oldName, newName]) => {
    const deps = getDepartments();
    const oldD = deps.find(d => d.name === oldName);
    const newD = deps.find(d => d.name === newName);
    if (!oldD || !newD || oldD.dept_id === newD.dept_id) return;
    getEmployees().forEach(e => {
      if (e.department === oldName) updateEmployee(e.emp_id, { department: newName });
    });
    deleteDepartment(oldD.dept_id);
  });
}

function dedupeDepartmentsExactName() {
  const groups = {};
  getDepartments().forEach(d => {
    const k = d.name.trim().toLowerCase();
    if (!groups[k]) groups[k] = [];
    groups[k].push(d);
  });
  Object.values(groups).forEach(list => {
    if (list.length < 2) return;
    list.sort((a, b) => a.dept_id - b.dept_id);
    const keeper = list[0];
    list.slice(1).forEach(dup => {
      getEmployees().forEach(e => {
        if (e.department === dup.name) updateEmployee(e.emp_id, { department: keeper.name });
      });
      deleteDepartment(dup.dept_id);
    });
  });
}

function dedupeAndNormalizeDepartments() {
  mergeDepartmentAliasPairs();
  dedupeDepartmentsExactName();
}

// =====================================================
// EMPLOYEE CRUD
// =====================================================
function getEmployees() { return dbGet(DB.EMPLOYEES); }

/** Parse login / URL input → numeric emp_id, or null if not a plain id. */
function coerceEmpId(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  const s = String(raw).trim().replace(/^#/, '');
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * One employee row from localStorage by emp_id.
 * Accepts number or numeric string (e.g. 3, "3", "#3").
 */
function getEmployee(id) {
  const list = getEmployees();
  const direct = list.find(e => e.emp_id === id);
  if (direct) return direct;
  const n = coerceEmpId(id);
  return n == null ? undefined : list.find(e => Number(e.emp_id) === n);
}

/** Empty / null → null (then resolver uses ₹0 defaults from stored config if needed). */
function parseOptionalPayrollOverride(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeEmployeePfPercent(raw) {
  if (raw == null || String(raw).trim() === '') return 12;
  const v = parseFloat(raw);
  return Number.isFinite(v) && v >= 0 ? v : 12;
}

function resolveEmployeeHra(emp, cfg) {
  if (emp != null && emp.hra_amount != null && emp.hra_amount !== '') {
    const v = parseFloat(emp.hra_amount);
    if (Number.isFinite(v) && v >= 0) return Math.round(v * 100) / 100;
  }
  return Math.max(0, parseFloat(cfg.default_hra) || 0);
}

function resolveEmployeeTa(emp, cfg) {
  if (emp != null && emp.ta_amount != null && emp.ta_amount !== '') {
    const v = parseFloat(emp.ta_amount);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return Math.max(0, parseFloat(cfg.default_ta) || 0);
}

function resolveEmployeeDa(emp, cfg) {
  if (emp != null && emp.da_amount != null && emp.da_amount !== '') {
    const v = parseFloat(emp.da_amount);
    if (Number.isFinite(v) && v >= 0) return Math.round(v * 100) / 100;
  }
  return Math.max(0, parseFloat(cfg.default_da) || 0);
}

function resolveEmployeePfPercent(emp) {
  if (emp != null && emp.pf_percent != null && emp.pf_percent !== '') {
    const v = parseFloat(emp.pf_percent);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return 12;
}

function addEmployee(data) {
  const emps = getEmployees();
  const pwd = data.password != null && String(data.password).trim() !== ''
    ? normalizePasswordInput(data.password)
    : 'emp123';
  const emp = {
    emp_id: getNextId('emp'),
    name: data.name,
    email: normalizeEmail(data.email),
    phone: data.phone,
    address: data.address != null ? String(data.address).trim() : '',
    department: data.department,
    designation: data.designation,
    join_date: data.join_date,
    daily_salary: Math.max(0, parseFloat(data.daily_salary) || 0),
    hra_amount: parseOptionalPayrollOverride(data.hra_amount),
    ta_amount: parseOptionalPayrollOverride(data.ta_amount),
    da_amount: parseOptionalPayrollOverride(data.da_amount),
    pf_percent: normalizeEmployeePfPercent(data.pf_percent),
    password: pwd,
  };
  emps.push(emp);
  dbSet(DB.EMPLOYEES, emps);
  return emp;
}

function updateEmployee(id, data) {
  const targetId = coerceEmpId(id) ?? id;
  const emps = getEmployees().map(e => {
    if (e.emp_id === targetId) {
      const merged = { ...e, ...data, emp_id: targetId };
      if (data.email != null && data.email !== '') {
        merged.email = normalizeEmail(data.email);
      }
      if (data.daily_salary != null) {
        merged.daily_salary = Math.max(0, parseFloat(data.daily_salary) || 0);
      }
      if ('hra_amount' in data) {
        merged.hra_amount = parseOptionalPayrollOverride(data.hra_amount);
      }
      if ('ta_amount' in data) {
        merged.ta_amount = parseOptionalPayrollOverride(data.ta_amount);
      }
      if ('da_amount' in data) {
        merged.da_amount = parseOptionalPayrollOverride(data.da_amount);
      }
      if ('pf_percent' in data) {
        merged.pf_percent = normalizeEmployeePfPercent(data.pf_percent);
      }
      if (!('password' in data)) {
        merged.password = e.password != null && String(e.password).trim() !== ''
          ? normalizePasswordInput(e.password)
          : 'emp123';
      } else if (data.password === '' || data.password == null) {
        merged.password = e.password != null && String(e.password).trim() !== ''
          ? normalizePasswordInput(e.password)
          : 'emp123';
      } else {
        merged.password = normalizePasswordInput(data.password);
      }
      return merged;
    }
    return e;
  });
  dbSet(DB.EMPLOYEES, emps);
}

function deleteEmployee(id) {
  const targetId = coerceEmpId(id) ?? id;
  dbSet(DB.EMPLOYEES, getEmployees().filter(e => e.emp_id !== targetId));
  // Also delete salary records
  dbSet(DB.SALARIES, getSalaries().filter(s => s.emp_id !== targetId));
  dbSet(DB.ATTENDANCE, getAttendance().filter(a => a.emp_id !== targetId));
  dbSet(DB.LEAVES, getLeaves().filter(l => l.emp_id !== targetId));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePasswordInput(password) {
  return String(password || '').trim();
}

/**
 * Employee portal login: registered email or numeric Employee ID (e.g. 12 or #12) + password.
 */
function findEmployeeByLogin(identifier, password) {
  const raw = String(identifier || '').trim();
  const wantPass = normalizePasswordInput(password);
  const matchPass = (e) => {
    const storedPass = e.password != null && String(e.password).trim() !== ''
      ? normalizePasswordInput(e.password)
      : 'emp123';
    return storedPass === wantPass;
  };

  const idNum = coerceEmpId(raw);
  if (idNum != null && !raw.includes('@')) {
    const e = getEmployee(idNum);
    if (e && matchPass(e)) return e;
  }

  const wantEmail = normalizeEmail(raw);
  return getEmployees().find(e => {
    const eEmail = normalizeEmail(e.email);
    return eEmail === wantEmail && matchPass(e);
  });
}

function changeEmployeePassword(empId, currentPassword, newPassword) {
  const cur = normalizePasswordInput(currentPassword);
  const next = normalizePasswordInput(newPassword);
  if (!next) {
    return { ok: false, message: 'New password cannot be empty' };
  }
  if (next.length < 6) {
    return { ok: false, message: 'New password must be at least 6 characters' };
  }

  const employees = getEmployees();
  const nid = coerceEmpId(empId);
  const index = nid != null
    ? employees.findIndex(e => e.emp_id === nid)
    : employees.findIndex(e => e.emp_id === empId);
  if (index === -1) {
    return { ok: false, message: 'Employee not found' };
  }

  if (normalizePasswordInput(employees[index].password) !== cur) {
    return { ok: false, message: 'Current password is incorrect' };
  }

  employees[index] = { ...employees[index], password: next };
  dbSet(DB.EMPLOYEES, employees);
  return { ok: true, employee: employees[index] };
}

// =====================================================
// ATTENDANCE TABLE (daily records)
// =====================================================
function getAttendance() { return dbGet(DB.ATTENDANCE); }

/** Alias: full attendance table for reports / UI wording. */
function getAttendanceTable() {
  return getAttendance();
}

function getAttendanceByDate(date) {
  return getAttendance().filter(a => a.date === date);
}

/** Default hours when status changes and no explicit hours are given (optional field). */
function defaultWorkHoursForStatus(status) {
  if (status === 'present') return 8;
  if (status === 'half-day') return 4;
  if (status === 'leave') return 8;
  return 0;
}

/**
 * @param {number} workHours — if undefined, derive from previous row or defaults; if '' treated as undefined
 */
function markAttendance(empId, date, status, note = '', workHours) {
  const rows = getAttendance();
  const idx = rows.findIndex(a => a.emp_id === empId && a.date === date);
  const prev = idx >= 0 ? rows[idx] : null;
  const statusChanged = !prev || prev.status !== status;

  let wh;
  if (workHours !== undefined && workHours !== null && workHours !== '') {
    const n = parseFloat(workHours);
    wh = Number.isNaN(n) ? null : Math.round(Math.max(0, n) * 100) / 100;
  } else if (workHours === null) {
    wh = null;
  } else if (statusChanged) {
    wh = defaultWorkHoursForStatus(status);
  } else {
    const p = prev && prev.work_hours != null ? parseFloat(prev.work_hours) : NaN;
    wh = !Number.isNaN(p) ? p : defaultWorkHoursForStatus(status);
  }
  if (status === 'absent') wh = 0;

  const record = {
    attendance_id: idx >= 0 ? rows[idx].attendance_id : getNextId('attendance'),
    emp_id: empId,
    date,
    status, // present | absent | half-day | leave
    note,
    work_hours: wh,
  };
  if (idx >= 0) rows[idx] = record;
  else rows.push(record);
  dbSet(DB.ATTENDANCE, rows);
  return record;
}

/** YYYY-MM-DD using local calendar (avoids UTC off-by-one). */
function _parseLocalYmd(ymd) {
  const p = String(ymd).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function _formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Mark the same status for one employee for each day from start through end (inclusive).
 * @param {object} [opts] skipWeekends — if true, Saturday/Sunday are not marked
 * @returns {{ count: number, skippedWeekend: number, error?: string }}
 */
function markAttendanceDateRange(empId, dateStart, dateEnd, status, opts = {}) {
  const skipWeekends = !!opts.skipWeekends;
  const start = _parseLocalYmd(dateStart);
  const end = _parseLocalYmd(dateEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { count: 0, skippedWeekend: 0, error: 'invalid_date' };
  }
  if (start > end) {
    return { count: 0, skippedWeekend: 0, error: 'range_order' };
  }
  const maxDays = 400;
  const span = Math.round((end - start) / 864e5) + 1;
  if (span > maxDays) {
    return { count: 0, skippedWeekend: 0, error: 'range_too_long' };
  }

  let count = 0;
  let skippedWeekend = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    const weekend = dow === 0 || dow === 6;
    if (skipWeekends && weekend) {
      skippedWeekend++;
    } else {
      markAttendance(empId, _formatLocalYmd(cur), status);
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { count, skippedWeekend };
}

/** Sorted attendance rows for one employee in one calendar month (local YYYY-MM-DD). */
function getAttendanceRecordsForMonth(empId, month, year) {
  const mi = MONTHS.indexOf(month);
  const y = parseInt(String(year), 10);
  if (mi < 0 || !Number.isFinite(y)) return [];
  return getAttendance()
    .filter(a => {
      if (a.emp_id !== empId) return false;
      const d = _parseLocalYmd(a.date);
      return d.getMonth() === mi && d.getFullYear() === y;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getAttendanceSummary(empId, month, year) {
  const records = getAttendanceRecordsForMonth(empId, month, year);
  const summary = {
    present: 0, absent: 0, half_day: 0, leave: 0, total_marked: records.length, total_work_hours: 0,
  };
  records.forEach(r => {
    if (r.status === 'present') summary.present += 1;
    else if (r.status === 'absent') summary.absent += 1;
    else if (r.status === 'half-day') summary.half_day += 1;
    else if (r.status === 'leave') summary.leave += 1;
    const h = parseFloat(r.work_hours);
    if (!Number.isNaN(h)) summary.total_work_hours += h;
  });
  summary.total_work_hours = Math.round(summary.total_work_hours * 100) / 100;
  summary.payable_days = summary.present + summary.leave + (summary.half_day * 0.5);
  return summary;
}

// =====================================================
// LEAVE CRUD
// =====================================================
function getLeaves() { return dbGet(DB.LEAVES); }

function getLeavesByEmployee(empId) {
  return getLeaves().filter(l => l.emp_id === empId).sort((a, b) => b.leave_id - a.leave_id);
}

function getLeaveById(leaveId) {
  return getLeaves().find(l => l.leave_id === leaveId);
}

function applyLeave(data) {
  const leaves = getLeaves();
  const record = {
    leave_id: getNextId('leave'),
    emp_id: data.emp_id,
    from_date: data.from_date,
    to_date: data.to_date,
    reason: data.reason,
    status: 'pending',
    admin_comment: '',
    applied_on: new Date().toISOString().slice(0, 10),
  };
  leaves.push(record);
  dbSet(DB.LEAVES, leaves);
  return record;
}

function updateLeaveStatus(leaveId, status, adminComment = '') {
  const leaves = getLeaves();
  const idx = leaves.findIndex(l => l.leave_id === leaveId);
  if (idx === -1) return null;
  const updated = {
    ...leaves[idx],
    status,
    admin_comment: adminComment,
    actioned_on: new Date().toISOString().slice(0, 10),
  };
  leaves[idx] = updated;
  dbSet(DB.LEAVES, leaves);

  if (status === 'approved') {
    const from = new Date(updated.from_date);
    const to = new Date(updated.to_date);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      markAttendance(
        updated.emp_id,
        d.toISOString().slice(0, 10),
        'leave',
        'Approved leave'
      );
    }
  }
  return updated;
}

// =====================================================
// PAYROLL TABLE — monthly salary calculation (pms_salaries)
// =====================================================
function getSalaries() { return dbGet(DB.SALARIES); }

/** Alias: payroll rows (same backing store as getSalaries). */
function getPayrollRecords() {
  return getSalaries();
}

function getSalariesByEmployee(empId) {
  return getSalaries().filter(s => s.emp_id === empId);
}

function getSalariesByMonth(month, year) {
  return getSalaries().filter(s => s.month === month && s.year === parseInt(year));
}

function getSalaryRecord(empId, month, year) {
  return getSalaries().find(s => s.emp_id === empId && s.month === month && s.year === parseInt(year));
}

/** PF = pfPercent% of basic (default 12). */
function computePfFromBasic(earnedAmount, pfPercent) {
  const b = parseFloat(earnedAmount) || 0;
  let p = parseFloat(pfPercent);
  if (!Number.isFinite(p) || p < 0) p = 12;
  return Math.round(b * (p / 100) * 100) / 100;
}

function pickAllowanceAmount(raw, fallbackFn) {
  if (raw != null && raw !== '') {
    const v = parseFloat(raw);
    if (Number.isFinite(v) && v >= 0) return Math.round(v * 100) / 100;
  }
  return fallbackFn();
}

function addOrUpdateSalary(data) {
  const salaries = getSalaries();
  const cfg = getPayrollConfig();
  const emp = data.emp_id != null ? getEmployee(data.emp_id) : null;
  const basic = Math.max(0, parseFloat(data.basic_salary) || 0);
  const hra = pickAllowanceAmount(data.hra, () => resolveEmployeeHra(emp, cfg));
  const ta = pickAllowanceAmount(data.ta, () => resolveEmployeeTa(emp, cfg));
  const da = pickAllowanceAmount(data.da, () => resolveEmployeeDa(emp, cfg));
  const hraPercentStored = 0;
  const pfPct = resolveEmployeePfPercent(emp);
  const pf = computePfFromBasic(basic, pfPct);
  const workingDays = Math.max(0, parseFloat(data.working_days) || 0);
  const presentDays = Math.max(0, parseFloat(data.present_days) || 0);
  const advance = Math.max(0, parseFloat(data.advance_amount) || 0);
  const gross = basic + hra + da + ta;
  const deductions = Math.round((pf + advance) * 100) / 100;
  const net = Math.max(0, Math.round((gross - deductions) * 100) / 100);

  const existing = salaries.findIndex(
    s => s.emp_id === data.emp_id && s.month === data.month && s.year === parseInt(data.year)
  );

  const record = {
    salary_id: existing >= 0 ? salaries[existing].salary_id : getNextId('salary'),
    emp_id: data.emp_id,
    basic_salary: basic,
    hra_percent: hraPercentStored,
    hra, da, ta, pf,
    advance_amount: advance,
    gross_salary: gross,
    total_deductions: deductions,
    net_salary: net,
    working_days: workingDays,
    present_days: presentDays,
    month: data.month,
    year: parseInt(data.year),
  };

  if (existing >= 0) {
    salaries[existing] = record;
  } else {
    salaries.push(record);
  }

  dbSet(DB.SALARIES, salaries);
  return record;
}

function deleteSalary(salaryId) {
  dbSet(DB.SALARIES, getSalaries().filter(s => s.salary_id !== salaryId));
}

// =====================================================
// SEED DATA (runs once)
// =====================================================
function seedDatabase() {
  if (localStorage.getItem('pms_seeded')) return;

  // Admin
  dbSet(DB.ADMINS, [
    { admin_id: 1, username: 'admin', password: 'admin123' }
  ]);

  // Departments: empty — org-structure.js + admin ensureOrgDepartmentsSynced fills the list
  dbSet(DB.DEPARTMENTS, []);

  // Employees (admin will add)
  dbSet(DB.EMPLOYEES, []);

  // Salary records (start empty)
  dbSet(DB.SALARIES, []);
  dbSet(DB.ATTENDANCE, []);
  dbSet(DB.LEAVES, []);

  // Set counters (dept ids start at 0; first addDepartment uses 1)
  localStorage.setItem(DB.COUNTERS, JSON.stringify({ dept: 0, emp: 0, salary: 0, attendance: 0, leave: 0 }));
  localStorage.setItem('pms_seeded', 'true');
}

// ---- Helpers ----
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function formatCurrency(num) {
  return '₹' + parseFloat(num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCurrentMonth() { return MONTHS[new Date().getMonth()]; }
function getCurrentYear() { return new Date().getFullYear(); }

/** Remove legacy payroll keys (tax, total_hours, hourly snapshot fields) from stored rows. */
function migrateSalaryRecordsStripLegacyFields() {
  const flag = 'pms_salary_strip_legacy_v1';
  if (localStorage.getItem(flag)) return;
  const keys = ['tax', 'total_hours', 'hourly_rate', 'hours_per_day'];
  const rows = getSalaries().map((s) => {
    const o = { ...s };
    keys.forEach((k) => { delete o[k]; });
    const pf = parseFloat(o.pf) || 0;
    const adv = Math.max(0, parseFloat(o.advance_amount) || 0);
    const gross = Math.max(0, parseFloat(o.gross_salary) || 0);
    o.total_deductions = Math.round((pf + adv) * 100) / 100;
    o.net_salary = Math.max(0, Math.round((gross - o.total_deductions) * 100) / 100);
    return o;
  });
  dbSet(DB.SALARIES, rows);
  localStorage.setItem(flag, '1');
}

// Seed on load
seedDatabase();
migrateSalaryRecordsStripLegacyFields();

if (!localStorage.getItem(DB.CONFIG)) {
  localStorage.setItem(DB.CONFIG, JSON.stringify({
    default_hra: 0,
    default_ta: 0,
    default_da: 0,
  }));
}
