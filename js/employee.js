/* =====================================================
   EMPLOYEE DASHBOARD – Employee Module Logic
   ===================================================== */

let empSession;
document.addEventListener('DOMContentLoaded', () => {
    empSession = requireEmployee();
    if (!empSession) return;

    // Set user info
    const emp = empSession.user;
    document.getElementById('topbarName').textContent = emp.name;
    document.getElementById('topbarAvatar').textContent = emp.name.charAt(0).toUpperCase();

    navigateTo('profile');
});
function navigateTo(page) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.querySelector(`[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');

    const titles = {
        profile: ['Profile', 'View your personal details'],
        attendance: ['Attendance', 'View your marked attendance by month'],
        salary: ['Salary Details', 'View your monthly salary records'],
        payslip: ['Salary Slip', 'View and print your salary slip'],
        leave: ['Leave Request', 'Submit a request and track approval status'],
        notifications: ['Notifications', 'Updates on leave, salary, and attendance'],
        settings: ['Change password', 'Update your account password'],
    };
    const [title, subtitle] = titles[page] || ['', ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = subtitle;

    switch (page) {
        case 'profile': loadProfile(); break;
        case 'attendance': loadEmployeeAttendance(); break;
        case 'salary': loadSalaryHistory(); break;
        case 'payslip': loadPayslipSelector(); break;
        case 'leave': loadLeavePage(); break;
        case 'notifications': loadNotifications(); break;
        case 'settings': loadSettings(); break;
    }
}

function loadProfile() {
    // Refresh employee data from localStorage (in case admin updated it)
    const emp = getEmployee(empSession.user.emp_id) || empSession.user;

    document.getElementById('profileAvatar').textContent = emp.name.charAt(0).toUpperCase();
    document.getElementById('profileName').textContent = emp.name;
    document.getElementById('profileDesignation').textContent = emp.designation;

    document.getElementById('profEmpId').textContent = '#' + emp.emp_id;
    document.getElementById('profEmail').textContent = emp.email;
    document.getElementById('profPhone').textContent = emp.phone || '-';
    document.getElementById('profAddress').textContent = emp.address && String(emp.address).trim() ? emp.address : '-';
    document.getElementById('profDept').textContent = emp.department;
    document.getElementById('profDesig').textContent = emp.designation;
    document.getElementById('profJoinDate').textContent = emp.join_date;
}

// =====================================================
// ATTENDANCE (read-only for employee)
// =====================================================
function _ensureEmpAttendanceFilters() {
    const mSel = document.getElementById('empAttMonth');
    const ySel = document.getElementById('empAttYear');
    if (!mSel || !ySel) return;

    if (!mSel.dataset.initialized) {
        mSel.innerHTML = MONTHS.map(m => `<option value="${m}">${m}</option>`).join('');
        const cy = getCurrentYear();
        const years = new Set();
        getAttendance().forEach(a => {
            if (a.emp_id === empSession.user.emp_id) {
                const d = _parseLocalYmd(a.date);
                if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
            }
        });
        years.add(cy);
        years.add(cy - 1);
        const sortedYears = [...years].sort((a, b) => b - a);
        ySel.innerHTML = sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
        mSel.value = getCurrentMonth();
        ySel.value = String(cy);
        mSel.dataset.initialized = '1';
    }
}

function _formatStatusLabel(status) {
    if (status === 'half-day') return 'Half day';
    if (!status) return '—';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function loadEmployeeAttendance() {
    _ensureEmpAttendanceFilters();
    const month = document.getElementById('empAttMonth').value;
    const year = parseInt(document.getElementById('empAttYear').value, 10);
    const summaryEl = document.getElementById('empAttendanceSummary');
    const tbody = document.getElementById('empAttendanceBody');

    if (!month || !Number.isFinite(year)) {
        if (summaryEl) summaryEl.innerHTML = '';
        if (tbody) tbody.innerHTML = '';
        return;
    }

    const records = getAttendanceRecordsForMonth(empSession.user.emp_id, month, year);
    const sum = getAttendanceSummary(empSession.user.emp_id, month, year);

    summaryEl.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <span class="badge text-bg-success">Present: ${sum.present}</span>
        <span class="badge text-bg-danger">Absent: ${sum.absent}</span>
        <span class="badge text-bg-warning text-dark">Half day: ${sum.half_day}</span>
        <span class="badge text-bg-info text-dark">Leave: ${sum.leave}</span>
        <span class="badge text-bg-secondary">Payable days: ${sum.payable_days}</span>
        <span class="badge text-bg-light text-dark border">Work hours: ${sum.total_work_hours}</span>
      </div>`;

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No attendance marked for this month</td></tr>';
        return;
    }

    tbody.innerHTML = records.map(r => `
      <tr>
        <td>${r.date}</td>
        <td><span class="badge badge-primary">${_formatStatusLabel(r.status)}</span></td>
        <td>${r.work_hours != null ? r.work_hours : '—'}</td>
        <td>${r.note && String(r.note).trim() ? escapeHtml(r.note) : '—'}</td>
      </tr>
    `).join('');
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// =====================================================
// NOTIFICATIONS (derived from leaves, salaries, attendance)
// =====================================================
function loadNotifications() {
    const ul = document.getElementById('notificationsList');
    const empId = empSession.user.emp_id;
    const items = [];

    getLeavesByEmployee(empId).forEach(l => {
        const range = `${l.from_date} → ${l.to_date}`;
        if (l.status === 'pending') {
            items.push({
                sort: l.applied_on || l.from_date,
                icon: 'bi-hourglass-split',
                cls: 'text-warning',
                title: 'Leave request pending',
                body: `Your request (${range}) is awaiting approval.`,
            });
        } else {
            const when = l.actioned_on || l.applied_on || '';
            const verb = l.status === 'approved' ? 'approved' : (l.status === 'rejected' ? 'rejected' : String(l.status));
            const ac = l.admin_comment && String(l.admin_comment).trim()
                ? ` Note: ${String(l.admin_comment).trim()}` : '';
            items.push({
                sort: when || l.from_date,
                icon: l.status === 'approved' ? 'bi-check-circle' : 'bi-x-circle',
                cls: l.status === 'approved' ? 'text-success' : 'text-secondary',
                title: `Leave request ${l.status}`,
                body: `Request (${range}) was ${verb}.${ac}`,
            });
        }
    });

    getSalariesByEmployee(empId).forEach(s => {
        items.push({
            sort: `${s.year}-${String(MONTHS.indexOf(s.month) + 1).padStart(2, '0')}-01`,
            icon: 'bi-cash-coin',
            cls: 'text-primary',
            title: 'Salary processed',
            body: `Your salary for ${s.month} ${s.year} is available (net ${formatCurrency(s.net_salary)}).`,
        });
    });

    const recentAtt = getAttendance()
        .filter(a => a.emp_id === empId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);
    recentAtt.forEach(a => {
        items.push({
            sort: a.date,
            icon: 'bi-calendar2-check',
            cls: 'text-muted',
            title: 'Attendance marked',
            body: `${a.date}: ${_formatStatusLabel(a.status)}.`,
        });
    });

    items.sort((a, b) => String(b.sort).localeCompare(String(a.sort)));
    const capped = items.slice(0, 40);

    if (capped.length === 0) {
        ul.innerHTML = '<li class="list-group-item text-center text-muted py-4">No notifications yet</li>';
        return;
    }

    ul.innerHTML = capped.map(it => `
      <li class="list-group-item d-flex gap-3 py-3">
        <div class="fs-4 ${it.cls}"><i class="bi ${it.icon}"></i></div>
        <div>
          <div class="fw-semibold">${escapeHtml(it.title)}</div>
          <div class="small text-muted">${escapeHtml(it.body)}</div>
        </div>
      </li>
    `).join('');
}


function loadSalaryHistory() {
    const salaries = getSalariesByEmployee(empSession.user.emp_id);
    const tbody = document.getElementById('salaryHistoryBody');

    if (salaries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No salary records found</td></tr>';
        return;
    }

    // Sort by year desc, month desc
    const sorted = salaries.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
    });

    tbody.innerHTML = sorted.map(s => `<tr>
    <td><strong>${s.month} ${s.year}</strong></td>
    <td>${formatCurrency(s.basic_salary)}</td>
    <td>${formatCurrency(s.hra)}</td>
    <td>${formatCurrency(s.da + s.ta)}</td>
    <td>${formatCurrency(s.gross_salary)}</td>
    <td class="text-danger">${formatCurrency(s.total_deductions)}</td>
    <td><strong>${formatCurrency(s.net_salary)}</strong></td>
    <td>
      <button class="btn btn-sm btn-outline" onclick="viewEmpPayslip('${s.month}', ${s.year})">
        <i class="bi bi-file-earmark-text"></i> View
      </button>
    </td>
  </tr>`).join('');
}


// PAYSLIP

function loadPayslipSelector() {
    const salaries = getSalariesByEmployee(empSession.user.emp_id);
    const sel = document.getElementById('empPayslipMonth');

    if (salaries.length === 0) {
        sel.innerHTML = '<option value="">No records available</option>';
        document.getElementById('empPayslipArea').innerHTML = `
      <div class="empty-state">
        <i class="bi bi-file-earmark-x"></i>
        <h5>No Payslips</h5>
        <p>Your salary records will appear here once processed by admin.</p>
      </div>`;
        return;
    }

    const sorted = salaries.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
    });

    sel.innerHTML = sorted.map(s =>
        `<option value="${s.month}|${s.year}">${s.month} ${s.year}</option>`
    ).join('');

    // Load first payslip
    showSelectedPayslip();
}

function showSelectedPayslip() {
    const val = document.getElementById('empPayslipMonth').value;
    if (!val) return;
    const [month, year] = val.split('|');
    renderPayslip(empSession.user.emp_id, month, parseInt(year));
}

function viewEmpPayslip(month, year) {
    navigateTo('payslip');
    setTimeout(() => {
        const sel = document.getElementById('empPayslipMonth');
        sel.value = `${month}|${year}`;
        showSelectedPayslip();
    }, 100);
}

function renderPayslip(empId, month, year) {
    const emp = getEmployee(empId) || empSession.user;
    const sal = getSalaryRecord(empId, month, year);

    if (!sal) {
        document.getElementById('empPayslipArea').innerHTML = `
      <div class="empty-state">
        <i class="bi bi-file-earmark-x"></i>
        <h5>Not Found</h5>
        <p>No payslip for ${month} ${year}.</p>
      </div>`;
        return;
    }

    const hr = parseFloat(sal.hourly_rate);
    const hourlyMeta = !Number.isNaN(hr) && hr > 0
        ? `<tr><td colspan="2" class="text-muted small">${formatCurrency(sal.hourly_rate)}/hr (hourly component)</td><td colspan="2"></td></tr>`
        : '';
    const earnedLabel = !Number.isNaN(hr) && hr > 0 ? 'Earned pay' : 'Basic Salary';
    const advance = Math.max(0, parseFloat(sal.advance_amount) || 0);
    const advanceRow = advance > 0
        ? `<tr><td colspan="2"></td><td>Advance (deduction)</td><td>${formatCurrency(advance)}</td></tr>`
        : '';

    document.getElementById('empPayslipArea').innerHTML = `
    <div class="payslip-container">
      <div class="payslip-header">
        <div>
          <h2><i class="bi bi-wallet2"></i> PayrollMS</h2>
          <p>Company Payslip</p>
        </div>
        <div class="payslip-period">
          <strong>Pay Period</strong><br>
          <span>${sal.month} ${sal.year}</span>
        </div>
      </div>
      <div class="payslip-body">
        <div class="payslip-info">
          <div class="payslip-info-item">
            <label>Employee Name</label>
            <span>${emp.name}</span>
          </div>
          <div class="payslip-info-item">
            <label>Employee ID</label>
            <span>#${emp.emp_id}</span>
          </div>
          <div class="payslip-info-item">
            <label>Department</label>
            <span>${emp.department}</span>
          </div>
          <div class="payslip-info-item">
            <label>Designation</label>
            <span>${emp.designation}</span>
          </div>
        </div>

        <table class="payslip-table">
          <thead>
            <tr><th colspan="2">Earnings</th><th colspan="2">Deductions</th></tr>
          </thead>
          <tbody>
            ${hourlyMeta}
            <tr>
              <td>${earnedLabel}</td><td>${formatCurrency(sal.basic_salary)}</td>
              <td>Provident Fund (PF)</td><td>${formatCurrency(sal.pf)}</td>
            </tr>
            ${advanceRow}
            <tr>
              <td>HRA</td><td>${formatCurrency(sal.hra)}</td>
              <td></td><td></td>
            </tr>
            <tr>
              <td>TA</td><td>${formatCurrency(sal.ta)}</td>
              <td></td><td></td>
            </tr>
            <tr>
              <td>DA</td><td>${formatCurrency(sal.da)}</td>
              <td></td><td></td>
            </tr>
            <tr>
              <td><strong>Gross Salary</strong></td><td><strong>${formatCurrency(sal.gross_salary)}</strong></td>
              <td><strong>Total deductions</strong></td><td><strong>${formatCurrency(sal.total_deductions)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="payslip-total">
          <div class="total-box">
            <div class="total-label">Net Salary</div>
            <div class="total-amount">${formatCurrency(sal.net_salary)}</div>
          </div>
        </div>
      </div>
      <div class="payslip-footer">
        This is a computer-generated payslip and does not require a signature.
      </div>
    </div>
  `;
}

function printEmpPayslip() {
    const content = document.getElementById('empPayslipArea').innerHTML;
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
// LEAVE
// =====================================================
function loadLeavePage() {
    const form = document.getElementById('leaveApplyForm');
    if (form) form.reset();
    updateLeaveSelectionInfo();
    loadMyLeaves();
}

function updateLeaveSelectionInfo() {
    const fromDate = document.getElementById('leaveFromDate').value;
    const toDate = document.getElementById('leaveToDate').value;
    const info = document.getElementById('leaveSelectionInfo');
    if (!info) return;

    if (!fromDate || !toDate) {
        info.textContent = 'Select leave dates to see total days.';
        return;
    }
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (to < from) {
        info.textContent = 'To Date cannot be before From Date.';
        return;
    }
    const days = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
    info.textContent = `Selected leave period: ${fromDate} to ${toDate} (${days} day${days > 1 ? 's' : ''}).`;
}

function applyEmployeeLeave(e) {
    e.preventDefault();
    const fromDate = document.getElementById('leaveFromDate').value;
    const toDate = document.getElementById('leaveToDate').value;
    const reason = document.getElementById('leaveReason').value.trim();

    if (!fromDate || !toDate || !reason) {
        showToast('Please fill all leave fields', 'error');
        return;
    }
    if (new Date(toDate) < new Date(fromDate)) {
        showToast('To Date cannot be before From Date', 'error');
        return;
    }

    applyLeave({
        emp_id: empSession.user.emp_id,
        from_date: fromDate,
        to_date: toDate,
        reason,
    });
    const days = Math.floor((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)) + 1;
    showToast(`Leave request submitted for ${days} day${days > 1 ? 's' : ''}`, 'success');
    loadLeavePage();
}

function loadMyLeaves() {
    const tbody = document.getElementById('myLeavesBody');
    const leaves = getLeavesByEmployee(empSession.user.emp_id);
    if (leaves.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No leave requests yet</td></tr>';
        return;
    }
    tbody.innerHTML = leaves.map(l => `
      <tr>
        <td>${l.from_date}</td>
        <td>${l.to_date}</td>
        <td>${l.reason}</td>
        <td><span class="badge badge-primary">${l.status}</span></td>
        <td>${l.admin_comment || '-'}</td>
      </tr>
    `).join('');
}

// =====================================================
// SETTINGS
// =====================================================
function loadSettings() {
    const form = document.getElementById('changePasswordForm');
    if (form) form.reset();
}

function handleChangePassword(e) {
    e.preventDefault();

    const currentPassword = normalizePasswordInput(document.getElementById('currentPassword').value);
    const newPassword = normalizePasswordInput(document.getElementById('newPassword').value);
    const confirmNewPassword = normalizePasswordInput(document.getElementById('confirmNewPassword').value);

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        showToast('Please fill all password fields', 'error');
        return;
    }
    if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters', 'error');
        return;
    }
    if (newPassword !== confirmNewPassword) {
        showToast('New password and confirm password do not match', 'error');
        return;
    }
    if (currentPassword === newPassword) {
        showToast('New password must be different from current password', 'error');
        return;
    }

    const result = changeEmployeePassword(empSession.user.emp_id, currentPassword, newPassword);
    if (!result.ok) {
        showToast(result.message, 'error');
        return;
    }

    empSession = { ...empSession, user: result.employee };
    setSession('employee', result.employee);
    loadSettings();
    showToast('Password updated successfully!', 'success');
}
