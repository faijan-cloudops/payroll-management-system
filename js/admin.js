/* =====================================================
   ADMIN DASHBOARD – All Admin Module Logic
   ===================================================== */

// ---- Init ----
let session;
document.addEventListener('DOMContentLoaded', () => {
    session = requireAdmin();
    if (!session) return;

    // Set user info in topbar
    document.getElementById('topbarName').textContent = session.user.username;
    document.getElementById('topbarAvatar').textContent = session.user.username.charAt(0).toUpperCase();

    ensureOrgDepartmentsSynced();
    if (typeof dedupeAndNormalizeDepartments === 'function') dedupeAndNormalizeDepartments();

    // Navigate to dashboard by default
    navigateTo('dashboard');
});

// ====================================================
// NAVIGATION
// =====================================================
function navigateTo(page) {
    // Hide all sections
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    // Show target
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.querySelector(`[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');

    // Update topbar title
    const titles = {
        dashboard: ['Dashboard', 'Overview of your payroll system'],
        employees: ['Employees', 'Manage employee records'],
        departments: ['Departments', 'Manage company departments'],
        attendance: ['Attendance', 'Mark daily employee attendance'],
        leaves: ['Leave Requests', 'Approve or reject employee leaves'],
        salary: ['Salary Setup', ''],
        payroll: ['Process Payroll', 'Generate monthly salary records'],
        reports: ['Reports', 'View payroll reports and history'],
    };
    const [title, subtitle] = titles[page] || ['', ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = subtitle;

    // Load page data
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'employees': loadEmployees(); break;
        case 'departments': loadDepartments(); break;
        case 'attendance': loadAttendancePage(); break;
        case 'leaves': loadLeaveRequests(); break;
        case 'salary': loadSalarySetup(); break;
        case 'payroll': loadPayroll(); break;
        case 'reports': loadReports(); break;
    }
}

// =====================================================
// DASHBOARD
// =====================================================
function loadDashboard() {
    const emps = getEmployees();
    const deps = getDepartments();
    const sals = getSalaries();
    const currentMonth = getCurrentMonth();
    const currentYear = getCurrentYear();
    const monthSalaries = sals.filter(s => s.month === currentMonth && s.year === currentYear);
    const totalPayroll = monthSalaries.reduce((sum, s) => sum + s.net_salary, 0);

    document.getElementById('statTotalEmployees').textContent = emps.length;
    document.getElementById('statTotalDepartments').textContent = deps.length;
    document.getElementById('statMonthlyPayroll').textContent = formatCurrency(totalPayroll);
    document.getElementById('statProcessed').textContent = monthSalaries.length + '/' + emps.length;

    // Recent salary records table
    const recentSalaries = sals.slice(-5).reverse();
    const tbody = document.getElementById('recentSalariesBody');
    if (recentSalaries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No salary records yet</td></tr>';
        return;
    }
    tbody.innerHTML = recentSalaries.map(s => {
        const emp = getEmployee(s.emp_id);
        return `<tr>
      <td><strong>${emp ? emp.name : 'Unknown'}</strong></td>
      <td>${emp ? emp.department : '-'}</td>
      <td>${s.month} ${s.year}</td>
      <td>${formatCurrency(s.gross_salary)}</td>
      <td class="text-danger">${formatCurrency(s.total_deductions)}</td>
      <td><strong class="text-success">${formatCurrency(s.net_salary)}</strong></td>
    </tr>`;
    }).join('');
}

// =====================================================
// EMPLOYEES
// =====================================================
let editingEmpId = null;

function loadEmployees(search = '') {
    let emps = getEmployees();
    if (search) {
        const q = search.toLowerCase();
        emps = emps.filter(e =>
            e.name.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            e.department.toLowerCase().includes(q) ||
            String(e.emp_id).includes(q)
        );
    }

    const tbody = document.getElementById('employeesBody');
    if (emps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">
      ${search ? 'No employees match your search' : 'No employees added yet'}
    </td></tr>`;
        return;
    }

    tbody.innerHTML = emps.map(e => `<tr>
    <td><span class="badge badge-primary">#${e.emp_id}</span></td>
    <td><strong>${e.name}</strong></td>
    <td>${e.email}</td>
    <td>${e.phone}</td>
    <td><span class="badge badge-success">${e.department}</span></td>
    <td>${e.designation}</td>
    <td>${formatCurrency(e.daily_salary || 0)}</td>
    <td>
      <button class="action-btn edit" onclick="openEditEmployee(${e.emp_id})" title="Edit"><i class="bi bi-pencil-square"></i></button>
      <button class="action-btn delete" onclick="confirmDeleteEmployee(${e.emp_id})" title="Delete"><i class="bi bi-trash3"></i></button>
    </td>
  </tr>`).join('');
}

function openAddEmployee() {
    editingEmpId = null;
    document.getElementById('empModalTitle').textContent = 'Add New Employee';
    document.getElementById('empForm').reset();
    document.getElementById('empPfPercent').value = '10';
    populateOrgDepartmentDropdown('');
    populateEmpDesignationDropdown('', '');
    document.getElementById('empDesignation').disabled = true;
    const modal = new bootstrap.Modal(document.getElementById('employeeModal'));
    modal.show();
}

function openEditEmployee(id) {
    const emp = getEmployee(id);
    if (!emp) return;
    editingEmpId = id;
    document.getElementById('empModalTitle').textContent = 'Edit Employee';
    document.getElementById('empName').value = emp.name;
    document.getElementById('empEmail').value = emp.email;
    document.getElementById('empPhone').value = emp.phone;
    document.getElementById('empAddress').value = emp.address || '';
    populateOrgDepartmentDropdown(emp.department);
    populateEmpDesignationDropdown(emp.department, emp.designation);
    document.getElementById('empDesignation').disabled = !emp.department;
    document.getElementById('empJoinDate').value = emp.join_date;
    document.getElementById('empDailySalary').value = emp.daily_salary || '';
    document.getElementById('empHraAmount').value =
        emp.hra_amount != null && emp.hra_amount !== '' ? emp.hra_amount : '';
    document.getElementById('empTaAmount').value =
        emp.ta_amount != null && emp.ta_amount !== '' ? emp.ta_amount : '';
    document.getElementById('empDaAmount').value =
        emp.da_amount != null && emp.da_amount !== '' ? emp.da_amount : '';
    document.getElementById('empPfPercent').value =
        emp.pf_percent != null && emp.pf_percent !== '' ? emp.pf_percent : '12';
    const modal = new bootstrap.Modal(document.getElementById('employeeModal'));
    modal.show();
}

function saveEmployee() {
    const data = {
        name: document.getElementById('empName').value.trim(),
        email: document.getElementById('empEmail').value.trim(),
        phone: document.getElementById('empPhone').value.trim(),
        address: document.getElementById('empAddress').value.trim(),
        department: document.getElementById('empDepartment').value,
        designation: document.getElementById('empDesignation').value.trim(),
        join_date: document.getElementById('empJoinDate').value,
        daily_salary: document.getElementById('empDailySalary').value,
        hra_amount: document.getElementById('empHraAmount').value,
        ta_amount: document.getElementById('empTaAmount').value,
        da_amount: document.getElementById('empDaAmount').value,
        pf_percent: document.getElementById('empPfPercent').value,
    };

    if (!data.name || !data.email || !data.department || !data.designation || !data.join_date || parseFloat(data.daily_salary) <= 0) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    let affectedEmpId = editingEmpId;
    if (editingEmpId) {
        updateEmployee(editingEmpId, data);
        showToast('Employee updated successfully!', 'success');
    } else {
        const newEmp = addEmployee(data);
        affectedEmpId = newEmp.emp_id;
        showToast('Employee added successfully!', 'success');
    }

    bootstrap.Modal.getInstance(document.getElementById('employeeModal')).hide();
    loadEmployees();
    refreshSalarySetupAllowancesForEmployee(affectedEmpId);
}

function confirmDeleteEmployee(id) {
    const emp = getEmployee(id);
    if (confirm(`Are you sure you want to delete "${emp.name}"? This will also remove their salary records.`)) {
        deleteEmployee(id);
        showToast('Employee deleted', 'info');
        loadEmployees();
    }
}

function searchEmployees() {
    const q = document.getElementById('empSearchInput').value;
    loadEmployees(q);
}

// =====================================================
// DEPARTMENTS
// =====================================================
let editingDeptId = null;

function ensureOrgDepartmentsSynced() {
    if (typeof ORG_STRUCTURE === 'undefined' || !ORG_STRUCTURE.length) return;
    const deps = getDepartments();
    const names = new Set(deps.map(d => d.name));
    ORG_STRUCTURE.forEach(o => {
        if (!names.has(o.dept)) {
            addDepartment(o.dept);
            names.add(o.dept);
        }
    });
}

function loadDepartments() {
    ensureOrgDepartmentsSynced();
    if (typeof dedupeAndNormalizeDepartments === 'function') dedupeAndNormalizeDepartments();
    const deps = getDepartments();
    const emps = getEmployees();
    const tbody = document.getElementById('departmentsBody');

    if (deps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No departments yet</td></tr>';
        return;
    }

    const desigLabel = (deptName) => {
        if (typeof getDesignationsForDept !== 'function') return '—';
        const list = getDesignationsForDept(deptName);
        return list.length ? escapeHtmlText(list.join(', ')) : '<span class="text-muted">—</span>';
    };

    tbody.innerHTML = deps.map(d => {
        const count = emps.filter(e => e.department === d.name).length;
        return `<tr>
      <td><span class="badge badge-primary">#${d.dept_id}</span></td>
      <td><strong>${escapeHtmlText(d.name)}</strong></td>
      <td style="max-width:320px;font-size:13px;line-height:1.4;">${desigLabel(d.name)}</td>
      <td><span class="badge badge-success">${count} employees</span></td>
      <td>
        <button class="action-btn edit" onclick="openEditDept(${d.dept_id})" title="Edit"><i class="bi bi-pencil-square"></i></button>
        <button class="action-btn delete" onclick="confirmDeleteDept(${d.dept_id})" title="Delete"><i class="bi bi-trash3"></i></button>
      </td>
    </tr>`;
    }).join('');
}

function openAddDept() {
    editingDeptId = null;
    document.getElementById('deptModalTitle').textContent = 'Add Department';
    document.getElementById('deptName').value = '';
    new bootstrap.Modal(document.getElementById('deptModal')).show();
}

function openEditDept(id) {
    const dept = getDepartments().find(d => d.dept_id === id);
    if (!dept) return;
    editingDeptId = id;
    document.getElementById('deptModalTitle').textContent = 'Edit Department';
    document.getElementById('deptName').value = dept.name;
    new bootstrap.Modal(document.getElementById('deptModal')).show();
}

function saveDept() {
    const name = document.getElementById('deptName').value.trim();
    if (!name) { showToast('Please enter department name', 'error'); return; }

    if (editingDeptId) {
        const oldDept = getDepartments().find(d => d.dept_id === editingDeptId);
        // Update employees with old department name
        if (oldDept) {
            getEmployees().forEach(e => {
                if (e.department === oldDept.name) updateEmployee(e.emp_id, { department: name });
            });
        }
        updateDepartment(editingDeptId, name);
        showToast('Department updated!', 'success');
    } else {
        addDepartment(name);
        showToast('Department added!', 'success');
    }

    bootstrap.Modal.getInstance(document.getElementById('deptModal')).hide();
    loadDepartments();
}

function confirmDeleteDept(id) {
    const dept = getDepartments().find(d => d.dept_id === id);
    const count = getEmployees().filter(e => e.department === dept.name).length;
    if (count > 0) {
        showToast(`Cannot delete "${dept.name}" – it has ${count} employee(s).`, 'error');
        return;
    }
    if (confirm(`Delete department "${dept.name}"?`)) {
        deleteDepartment(id);
        showToast('Department deleted', 'info');
        loadDepartments();
    }
}

// =====================================================
// SALARY SETUP
// =====================================================
function loadSalarySetup() {
    populateEmpDropdown('salaryEmpSelect');
    populateMonthDropdown('salaryMonth');
    document.getElementById('salaryYear').value = getCurrentYear();
    syncSalaryAllowanceFromConfig();
    clearSalaryForm();
}

function syncSalaryAllowanceFromConfig() {}

function prefillSalaryAllowances(empId, month, year) {
    const emp = getEmployee(empId);
    const cfg = getPayrollConfig();
    const hraEl = document.getElementById('salHRA');
    const taEl = document.getElementById('salTA');
    const daEl = document.getElementById('salDA');
    if (!hraEl || !taEl || !daEl) return;
    hraEl.value = resolveEmployeeHra(emp, cfg);
    taEl.value = resolveEmployeeTa(emp, cfg);
    daEl.value = resolveEmployeeDa(emp, cfg);
}

/** After editing an employee, refresh salary setup if that employee is selected (same month/year). */
function refreshSalarySetupAllowancesForEmployee(empId) {
    if (!document.getElementById('page-salary')?.classList.contains('active')) return;
    const sel = document.getElementById('salaryEmpSelect');
    if (!sel || parseInt(sel.value, 10) !== empId) return;
    const month = document.getElementById('salaryMonth').value;
    const year = document.getElementById('salaryYear').value;
    if (!month || !year) return;
    prefillSalaryAllowances(empId, month, year);
    calculateSalary();
}

function loadSalaryForEmployee() {
    const empId = parseInt(document.getElementById('salaryEmpSelect').value);
    const month = document.getElementById('salaryMonth').value;
    const year = document.getElementById('salaryYear').value;

    if (!empId || !month || !year) return;

    const summary = getAttendanceSummary(empId, month, parseInt(year));
    document.getElementById('salPayableDaysDisplay').value =
        summary.payable_days != null ? String(summary.payable_days) : '';

    clearSalaryInputs();
    fillAttendanceInSalary();
    updateSalaryAttendanceInfo(empId, month, year);
    const existingSal = getSalaryRecord(empId, month, parseInt(year));
    const advEl = document.getElementById('salAdvance');
    if (advEl) {
        advEl.value = existingSal && existingSal.advance_amount != null
            ? String(Math.max(0, parseFloat(existingSal.advance_amount) || 0))
            : '0';
    }
    calculateSalary();
}

function clearSalaryInputs() {
    document.getElementById('salWorkingDays').value = '';
    document.getElementById('salPresentDays').value = '';
    syncSalaryAllowanceFromConfig();
    document.getElementById('salBasicSalary').value = '0';
    document.getElementById('salPayableDaysDisplay').value = '0';
    const salPerDay = document.getElementById('salPerDaySalaryDisplay');
    if (salPerDay) salPerDay.value = formatCurrency(0);
    const salPresent = document.getElementById('salPresentDaysDisplay');
    if (salPresent) salPresent.value = '0';
    const hraEl = document.getElementById('salHRA');
    const taEl = document.getElementById('salTA');
    const daEl = document.getElementById('salDA');
    if (hraEl) hraEl.value = '0';
    if (taEl) taEl.value = '0';
    if (daEl) daEl.value = '0';
    const pfDisp = document.getElementById('salPFDisplay');
    if (pfDisp) pfDisp.value = formatCurrency(0);
    const advEl = document.getElementById('salAdvance');
    if (advEl) advEl.value = '0';
    const attInfo = document.getElementById('salaryAttendanceInfo');
    if (attInfo) attInfo.innerHTML = '';
}

function clearSalaryForm() {
    clearSalaryInputs();
    calculateSalary();
}

function calculateSalary() {
    const cfg = getPayrollConfig();
    const empId = parseInt(document.getElementById('salaryEmpSelect').value);
    const emp = empId ? getEmployee(empId) : null;
    const dayRate = Math.max(0, parseFloat(emp?.daily_salary) || 0);
    const presentDays = Math.max(0, parseFloat(document.getElementById('salPresentDays').value) || 0);
    const suggestedBasic = Math.round(dayRate * presentDays * 100) / 100;

    const basicInput = document.getElementById('salBasicSalary');
    let basic = parseFloat(basicInput?.value);
    if (!Number.isFinite(basic) || basic < 0) basic = suggestedBasic;
    const salPerDay = document.getElementById('salPerDaySalaryDisplay');
    if (salPerDay) salPerDay.value = dayRate > 0 ? formatCurrency(dayRate) : '';
    const salPresent = document.getElementById('salPresentDaysDisplay');
    if (salPresent) salPresent.value = String(presentDays);

    const parseAllowanceField = (id, fallback) => {
        const el = document.getElementById(id);
        if (!el) return fallback;
        const raw = String(el.value).trim();
        if (raw === '') {
            el.value = fallback;
            return fallback;
        }
        const v = parseFloat(raw);
        if (!Number.isFinite(v) || v < 0) {
            el.value = fallback;
            return fallback;
        }
        return Math.round(v * 100) / 100;
    };

    const hraFb = emp ? resolveEmployeeHra(emp, cfg) : 0;
    const taFb = emp ? resolveEmployeeTa(emp, cfg) : 0;
    const daFb = emp ? resolveEmployeeDa(emp, cfg) : 0;
    const hra = parseAllowanceField('salHRA', hraFb);
    const ta = parseAllowanceField('salTA', taFb);
    const da = parseAllowanceField('salDA', daFb);

    const pfPct = resolveEmployeePfPercent(emp);
    const pf = computePfFromBasic(basic, pfPct);
    const advRaw = document.getElementById('salAdvance');
    const advance = Math.max(0, parseFloat(advRaw && advRaw.value) || 0);
    const gross = basic + hra + da + ta;
    const deductions = Math.round((pf + advance) * 100) / 100;
    const net = Math.max(0, Math.round((gross - deductions) * 100) / 100);
    const earnedLine = document.getElementById('calcEarnedLine');
    if (earnedLine) earnedLine.textContent = formatCurrency(basic);

    const pfDisp = document.getElementById('salPFDisplay');
    if (pfDisp) pfDisp.value = formatCurrency(pf);
    const pfLine = document.getElementById('calcPFLine');
    if (pfLine) pfLine.textContent = formatCurrency(pf);
    const advLine = document.getElementById('calcAdvanceLine');
    if (advLine) advLine.textContent = formatCurrency(advance);
    const hraLine = document.getElementById('calcHRALine');
    if (hraLine) hraLine.textContent = formatCurrency(hra);
    const taLine = document.getElementById('calcTALine');
    if (taLine) taLine.textContent = formatCurrency(ta);
    const daLine = document.getElementById('calcDALine');
    if (daLine) daLine.textContent = formatCurrency(da);
    document.getElementById('calcGross').textContent = formatCurrency(gross);
    document.getElementById('calcDeductions').textContent = formatCurrency(deductions);
    document.getElementById('calcNet').textContent = formatCurrency(net);
}

function updateSalaryAttendanceInfo(empId, month, year) {
    const info = document.getElementById('salaryAttendanceInfo');
    if (!info || !empId || !month || !year) return;
    const s = getAttendanceSummary(empId, month, parseInt(year));
    const hrs = s.total_work_hours != null ? s.total_work_hours : 0;
    info.innerHTML = `Marked days: <strong>${s.total_marked}</strong> | Present: <strong>${s.present}</strong> | Half-day: <strong>${s.half_day}</strong> | Leave: <strong>${s.leave}</strong> | Payable days: <strong>${s.payable_days}</strong> | <strong>Σ work hrs:</strong> ${hrs}`;
}

function fillAttendanceInSalary() {
    const empId = parseInt(document.getElementById('salaryEmpSelect').value);
    const month = document.getElementById('salaryMonth').value;
    const year = document.getElementById('salaryYear').value;
    if (!empId || !month || !year) {
        showToast('Select employee, month and year first', 'error');
        return;
    }
    const summary = getAttendanceSummary(empId, month, parseInt(year));
    const daysInMonth = new Date(parseInt(year), MONTHS.indexOf(month) + 1, 0).getDate();
    const payable = summary.payable_days != null ? summary.payable_days : 0;
    document.getElementById('salWorkingDays').value = daysInMonth;
    document.getElementById('salPresentDays').value = payable;
    document.getElementById('salPayableDaysDisplay').value = String(payable);
    const salPresent = document.getElementById('salPresentDaysDisplay');
    if (salPresent) salPresent.value = String(payable);
    const emp = getEmployee(empId);
    const dayRate = Math.max(0, parseFloat(emp?.daily_salary) || 0);
    const suggestedBasic = Math.round(dayRate * payable * 100) / 100;
    document.getElementById('salBasicSalary').value = suggestedBasic;
    prefillSalaryAllowances(empId, month, year);
    updateSalaryAttendanceInfo(empId, month, year);
    calculateSalary();
}

function getAttendanceDaysForPayroll(empId, month, year) {
    const y = parseInt(year);
    const workingDays = new Date(y, MONTHS.indexOf(month) + 1, 0).getDate();
    const summary = getAttendanceSummary(empId, month, y);
    return { workingDays, presentDays: summary.payable_days };
}

function saveSalary() {
    const empId = parseInt(document.getElementById('salaryEmpSelect').value);
    const month = document.getElementById('salaryMonth').value;
    const year = document.getElementById('salaryYear').value;

    if (!empId || !month || !year) {
        showToast('Please select employee, month and year', 'error');
        return;
    }

    const emp = getEmployee(empId);
    const dayRate = Math.max(0, parseFloat(emp?.daily_salary) || 0);
    if (dayRate <= 0) {
        showToast('Please set per-day salary in employee profile first.', 'error');
        return;
    }

    const autoDays = getAttendanceDaysForPayroll(empId, month, year);
    const workingDays = document.getElementById('salWorkingDays').value || autoDays.workingDays;
    const presentDays = document.getElementById('salPresentDays').value || autoDays.presentDays;
    const basic = Math.max(0, parseFloat(document.getElementById('salBasicSalary').value) || 0);
    if (basic <= 0) {
        showToast('Enter a basic salary greater than zero (refresh attendance or type an amount).', 'error');
        return;
    }

    const advanceVal = Math.max(0, parseFloat(document.getElementById('salAdvance').value) || 0);

    addOrUpdateSalary({
        emp_id: empId,
        basic_salary: basic,
        hra: document.getElementById('salHRA').value,
        ta: document.getElementById('salTA').value,
        da: document.getElementById('salDA').value,
        advance_amount: advanceVal,
        working_days: workingDays,
        present_days: presentDays,
        month, year,
    });

    showToast(`Salary saved (monthly legacy — attendance ${presentDays}/${workingDays})`, 'success');
}

// =====================================================
// PROCESS PAYROLL (Bulk)
// =====================================================
function loadPayroll() {
    populateMonthDropdown('payrollMonth');
    document.getElementById('payrollYear').value = getCurrentYear();
    loadPayrollTable();
}

function loadPayrollTable() {
    const month = document.getElementById('payrollMonth').value;
    const year = document.getElementById('payrollYear').value;
    const salaries = getSalariesByMonth(month, parseInt(year));
    const emps = getEmployees();

    const tbody = document.getElementById('payrollBody');
    if (salaries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No payroll records for ${month} ${year}</td></tr>`;
        document.getElementById('payrollTotal').textContent = formatCurrency(0);
        return;
    }

    let total = 0;
    tbody.innerHTML = salaries.map(s => {
        const emp = emps.find(e => e.emp_id === s.emp_id);
        total += s.net_salary;
        return `<tr>
      <td><strong>${emp ? emp.name : 'Unknown'}</strong></td>
      <td>${formatCurrency(s.basic_salary)}</td>
      <td>${formatCurrency(s.gross_salary)}</td>
      <td class="text-danger">${formatCurrency(s.total_deductions)}</td>
      <td><strong class="text-success">${formatCurrency(s.net_salary)}</strong></td>
      <td><span class="badge badge-success">Processed</span></td>
      <td>
        <button class="action-btn view" onclick="viewPayslip(${s.emp_id}, '${s.month}', ${s.year})" title="View Payslip"><i class="bi bi-eye"></i></button>
      </td>
    </tr>`;
    }).join('');

    document.getElementById('payrollTotal').textContent = formatCurrency(total);
}

function generateBulkPayroll() {
    const month = document.getElementById('payrollMonth').value;
    const year = document.getElementById('payrollYear').value;
    const emps = getEmployees();

    if (emps.length === 0) {
        showToast('No employees to process', 'error');
        return;
    }

    let count = 0;
    emps.forEach(emp => {
        const autoDays = getAttendanceDaysForPayroll(emp.emp_id, month, year);
        const daily = Math.max(0, parseFloat(emp.daily_salary) || 0);
        const basic = Math.round(daily * autoDays.presentDays * 100) / 100;
        if (basic > 0) {
            addOrUpdateSalary({
                emp_id: emp.emp_id,
                basic_salary: basic,
                advance_amount: 0,
                working_days: autoDays.workingDays,
                present_days: autoDays.presentDays,
                month, year,
            });
            count++;
        }
    });

    if (count > 0) {
        showToast(`Payroll generated/recalculated for ${count} employee(s) using attendance!`, 'success');
    } else {
        showToast('No payable attendance found or daily salary missing for employees.', 'info');
    }
    loadPayrollTable();
}

// =====================================================
// REPORTS
// =====================================================
function loadReports() {
    populateMonthDropdown('reportMonth');
    document.getElementById('reportYear').value = getCurrentYear();
    generateReport();
}

function generateReport() {
    const month = document.getElementById('reportMonth').value;
    const year = document.getElementById('reportYear').value;
    const salaries = getSalariesByMonth(month, parseInt(year));
    const emps = getEmployees();

    const tbody = document.getElementById('reportBody');
    if (salaries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No records for ${month} ${year}</td></tr>`;
        return;
    }

    tbody.innerHTML = salaries.map(s => {
        const emp = emps.find(e => e.emp_id === s.emp_id);
        return `<tr>
      <td>${emp ? emp.name : '-'}</td>
      <td>${emp ? emp.department : '-'}</td>
      <td>${formatCurrency(s.basic_salary)}</td>
      <td>${formatCurrency(s.hra)}</td>
      <td>${formatCurrency(s.ta)}</td>
      <td class="text-danger">${formatCurrency(s.total_deductions)}</td>
      <td><strong class="text-success">${formatCurrency(s.net_salary)}</strong></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="viewPayslip(${s.emp_id}, '${s.month}', ${s.year})">
          <i class="bi bi-file-earmark-text"></i> Payslip
        </button>
      </td>
    </tr>`;
    }).join('');
}

function printReport() {
    window.print();
}

// =====================================================
// PAYSLIP VIEW
// =====================================================
function viewPayslip(empId, month, year) {
    const emp = getEmployee(empId);
    const sal = getSalaryRecord(empId, month, parseInt(year));
    if (!emp || !sal) { showToast('Record not found', 'error'); return; }

    document.getElementById('slipEmpName').textContent = emp.name;
    document.getElementById('slipEmpId').textContent = '#' + emp.emp_id;
    document.getElementById('slipDept').textContent = emp.department;
    document.getElementById('slipDesignation').textContent = emp.designation;
    document.getElementById('slipMonth').textContent = sal.month + ' ' + sal.year;

    const slipHourlyRow = document.getElementById('slipHourlyMetaRow');
    const slipEarnedLabel = document.getElementById('slipEarnedLabel');
    slipHourlyRow.style.display = 'none';
    slipEarnedLabel.textContent = 'Basic Salary';
    document.getElementById('slipBasic').textContent = formatCurrency(sal.basic_salary);
    document.getElementById('slipHRA').textContent = formatCurrency(sal.hra);
    document.getElementById('slipTA').textContent = formatCurrency(sal.ta);
    document.getElementById('slipDA').textContent = formatCurrency(sal.da);
    document.getElementById('slipGross').textContent = formatCurrency(sal.gross_salary);

    document.getElementById('slipPF').textContent = formatCurrency(sal.pf);
    const adv = Math.max(0, parseFloat(sal.advance_amount) || 0);
    const advRow = document.getElementById('slipAdvanceRow');
    if (advRow) {
        advRow.style.display = adv > 0 ? '' : 'none';
        const slipAdv = document.getElementById('slipAdvance');
        if (slipAdv) slipAdv.textContent = formatCurrency(adv);
    }
    document.getElementById('slipTotalDed').textContent = formatCurrency(sal.total_deductions);

    document.getElementById('slipNetSalary').textContent = formatCurrency(sal.net_salary);

    new bootstrap.Modal(document.getElementById('payslipModal')).show();
}

function printPayslip() {
    const content = document.getElementById('payslipPrintArea').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
    <html><head><title>Payslip</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="css/style.css" rel="stylesheet">
    <style>body{padding:20px;background:#fff;}</style>
    </head><body>${content}
    <script>setTimeout(()=>window.print(),500);<\/script>
    </body></html>
  `);
}

// =====================================================
// ATTENDANCE
// =====================================================
function loadAttendancePage() {
    const dateInput = document.getElementById('attendanceDate');
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
    populateEmpDropdown('attendanceSummaryEmp');
    populateEmpDropdown('bulkAttendanceEmp');
    const bulkFrom = document.getElementById('bulkAttendanceFrom');
    const bulkTo = document.getElementById('bulkAttendanceTo');
    if (bulkFrom && bulkTo && !bulkFrom.value && !bulkTo.value) {
        const end = new Date();
        const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        start.setDate(start.getDate() - 9);
        const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        bulkTo.value = ymd(end);
        bulkFrom.value = ymd(start);
    }
    const yrInput = document.getElementById('attendanceSummaryYear');
    if (yrInput && !yrInput.value) yrInput.value = getCurrentYear();
    populateMonthDropdown('attendanceDetailMonth');
    loadAttendanceTable();
    loadAttendanceMonthlySummary();
}

function loadAttendanceTable() {
    const date = document.getElementById('attendanceDate').value;
    const emps = getEmployees();
    const todayRows = getAttendanceByDate(date);
    const map = {};
    todayRows.forEach(r => {
        map[r.emp_id] = r.status;
    });

    const tbody = document.getElementById('attendanceBody');
    if (emps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No employees found</td></tr>';
        return;
    }
    tbody.innerHTML = emps.map(e => {
        return `
    <tr>
      <td><strong>${e.name}</strong> <span class="text-muted">#${e.emp_id}</span></td>
      <td>${e.department}</td>
      <td><span class="badge badge-primary">${map[e.emp_id] || 'not marked'}</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="setEmployeeAttendance(${e.emp_id}, 'present')">Present</button>
        <button class="btn btn-sm btn-outline" onclick="setEmployeeAttendance(${e.emp_id}, 'absent')">Absent</button>
        <button class="btn btn-sm btn-outline" onclick="setEmployeeAttendance(${e.emp_id}, 'half-day')">Half Day</button>
        <button class="btn btn-sm btn-outline" onclick="setEmployeeAttendance(${e.emp_id}, 'leave')">Leave</button>
      </td>
    </tr>`;
    }).join('');
}

function setEmployeeAttendance(empId, status) {
    const date = document.getElementById('attendanceDate').value;
    if (!date) {
        showToast('Please select date', 'error');
        return;
    }
    markAttendance(empId, date, status);
    loadAttendanceTable();
    loadAttendanceMonthlySummary();
    showToast(`Attendance marked: ${status}`, 'success');
}

function applyBulkAttendance(status) {
    const empId = parseInt(document.getElementById('bulkAttendanceEmp').value, 10);
    const from = document.getElementById('bulkAttendanceFrom').value;
    const to = document.getElementById('bulkAttendanceTo').value;
    const skipWeekends = document.getElementById('bulkAttendanceSkipWeekends').checked;

    if (!empId) {
        showToast('Select an employee', 'error');
        return;
    }
    if (!from || !to) {
        showToast('Choose From and To dates', 'error');
        return;
    }
    if (typeof markAttendanceDateRange !== 'function') {
        showToast('Bulk attendance is unavailable', 'error');
        return;
    }

    const r = markAttendanceDateRange(empId, from, to, status, { skipWeekends });
    if (r.error === 'range_order') {
        showToast('From date must be on or before To date', 'error');
        return;
    }
    if (r.error === 'invalid_date') {
        showToast('Invalid date', 'error');
        return;
    }
    if (r.error === 'range_too_long') {
        showToast('Range is too long (max 400 days)', 'error');
        return;
    }
    if (r.count === 0) {
        showToast(skipWeekends ? 'No weekdays in that range' : 'No days in range', 'info');
        return;
    }

    loadAttendanceTable();
    loadAttendanceMonthlySummary();
    const w = r.skippedWeekend > 0 ? ` (${r.skippedWeekend} weekend day(s) skipped)` : '';
    showToast(`Marked ${r.count} day(s) as ${status}${w}`, 'success');
}

function loadAttendanceMonthlySummary() {
    const empId = parseInt(document.getElementById('attendanceSummaryEmp').value);
    const year = parseInt(document.getElementById('attendanceSummaryYear').value);
    const tbody = document.getElementById('attendanceMonthlyBody');

    if (!empId || !year) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Select employee and year</td></tr>';
        return;
    }

    tbody.innerHTML = MONTHS.map(month => {
        const s = getAttendanceSummary(empId, month, year);
        const th = s.total_work_hours != null ? s.total_work_hours : 0;
        return `<tr>
          <td>${month} ${year}</td>
          <td>${s.present}</td>
          <td>${s.half_day}</td>
          <td>${s.leave}</td>
          <td>${s.absent}</td>
          <td><strong>${s.payable_days}</strong></td>
          <td><strong>${th}</strong></td>
        </tr>`;
    }).join('');

    loadAttendanceMonthlyDetail();
}

function loadAttendanceMonthlyDetail() {
    const tbody = document.getElementById('attendanceMonthlyDetailBody');
    if (!tbody) return;

    const empId = parseInt(document.getElementById('attendanceSummaryEmp').value, 10);
    const year = parseInt(document.getElementById('attendanceSummaryYear').value, 10);
    const monthEl = document.getElementById('attendanceDetailMonth');
    const month = monthEl ? monthEl.value : '';

    if (!empId || !Number.isFinite(year) || !month) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">Select an employee and year, then choose a month below.</td></tr>';
        return;
    }
    if (typeof getAttendanceRecordsForMonth !== 'function') {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">Daily breakdown is unavailable</td></tr>';
        return;
    }

    const rows = getAttendanceRecordsForMonth(empId, month, year);
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-3 text-muted">No attendance saved for ${escapeHtmlText(month)} ${year}. Mark attendance on the Daily Attendance tab for those dates.</td></tr>`;
        return;
    }

    const dowShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    tbody.innerHTML = rows.map((r) => {
        const parts = String(r.date).split('-').map(Number);
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        const dayName = dowShort[dt.getDay()];
        const dateLabel = dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const st = r.status || '';
        const label = st === 'present' ? 'Present' : st === 'absent' ? 'Absent' : st === 'half-day' ? 'Half day' : st === 'leave' ? 'Leave' : st;
        const badge = st === 'present' ? 'badge-success' : st === 'absent' ? 'badge-danger' : st === 'half-day' ? 'badge-warning' : st === 'leave' ? 'badge-info' : 'badge-primary';
        const wh = r.work_hours != null && r.work_hours !== '' ? escapeHtmlText(String(r.work_hours)) : '—';
        return `<tr>
      <td><strong>${escapeHtmlText(r.date)}</strong><br><span class="text-muted small">${escapeHtmlText(dateLabel)}</span></td>
      <td>${escapeHtmlText(dayName)}</td>
      <td><span class="badge ${badge}">${escapeHtmlText(label)}</span></td>
      <td>${wh}</td>
    </tr>`;
    }).join('');
}

// =====================================================
// LEAVE REQUESTS
// =====================================================
function loadLeaveRequests() {
    const filter = document.getElementById('leaveFilter').value;
    let leaves = getLeaves();
    if (filter !== 'all') leaves = leaves.filter(l => l.status === filter);
    leaves = leaves.sort((a, b) => b.leave_id - a.leave_id);

    const tbody = document.getElementById('leaveRequestsBody');
    if (leaves.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No leave requests found</td></tr>';
        return;
    }
    tbody.innerHTML = leaves.map(l => {
        const emp = getEmployee(l.emp_id);
        const actions = l.status === 'pending'
            ? `<button class="btn btn-sm btn-success" onclick="approveLeave(${l.leave_id})">Approve</button>
               <button class="btn btn-sm btn-danger" onclick="rejectLeave(${l.leave_id})">Reject</button>`
            : `<span class="text-muted">-</span>`;
        return `<tr>
          <td>${emp ? emp.name : 'Unknown'} (#${l.emp_id})</td>
          <td>${l.from_date}</td>
          <td>${l.to_date}</td>
          <td>${l.reason}</td>
          <td><span class="badge badge-primary">${l.status}</span></td>
          <td>${actions}</td>
        </tr>`;
    }).join('');
}

function approveLeave(leaveId) {
    const comment = prompt('Add approval comment (optional):') || '';
    updateLeaveStatus(leaveId, 'approved', comment);
    loadLeaveRequests();
    showToast('Leave approved successfully', 'success');
}

function rejectLeave(leaveId) {
    const comment = prompt('Reason for rejection:') || '';
    updateLeaveStatus(leaveId, 'rejected', comment);
    loadLeaveRequests();
    showToast('Leave rejected', 'info');
}

// =====================================================
// HELPERS
// =====================================================
function populateOrgDepartmentDropdown(selected = '') {
    const sel = document.getElementById('empDepartment');
    if (!sel || typeof ORG_STRUCTURE === 'undefined') return;
    const known = ORG_STRUCTURE.some(o => o.dept === selected);
    let html = '<option value="">Select Department</option>';
    if (selected && !known) {
        html += `<option value="${escapeHtmlAttr(selected)}" selected>${escapeHtmlText(selected)}</option>`;
    }
    html += ORG_STRUCTURE.map(o =>
        `<option value="${escapeHtmlAttr(o.dept)}" ${known && o.dept === selected ? 'selected' : ''}>${escapeHtmlText(o.dept)}</option>`
    ).join('');
    sel.innerHTML = html;
}

function populateEmpDesignationDropdown(deptName, selectedDesig = '') {
    const sel = document.getElementById('empDesignation');
    if (!sel) return;
    if (!deptName) {
        sel.innerHTML = '<option value="">Select Designation</option>';
        return;
    }
    const list = getDesignationsForDept(deptName);
    let html = '<option value="">Select Designation</option>';
    list.forEach(d => {
        const esc = escapeHtmlAttr(d);
        html += `<option value="${esc}" ${d === selectedDesig ? 'selected' : ''}>${escapeHtmlText(d)}</option>`;
    });
    if (selectedDesig && !list.includes(selectedDesig)) {
        const esc = escapeHtmlAttr(selectedDesig);
        html += `<option value="${esc}" selected>${escapeHtmlText(selectedDesig)}</option>`;
    }
    sel.innerHTML = html;
}

function onEmpDepartmentChange() {
    const dept = document.getElementById('empDepartment').value;
    const desigSel = document.getElementById('empDesignation');
    desigSel.disabled = !dept;
    populateEmpDesignationDropdown(dept, '');
}

function escapeHtmlAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function escapeHtmlText(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function populateEmpDropdown(id) {
    const sel = document.getElementById(id);
    const emps = getEmployees();
    sel.innerHTML = '<option value="">Select Employee</option>' +
        emps.map(e => `<option value="${e.emp_id}">${e.name} (#${e.emp_id})</option>`).join('');
}

function populateMonthDropdown(id) {
    const sel = document.getElementById(id);
    sel.innerHTML = MONTHS.map(m =>
        `<option value="${m}" ${m === getCurrentMonth() ? 'selected' : ''}>${m}</option>`
    ).join('');
}
