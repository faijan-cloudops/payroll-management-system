/**
 * Predefined departments and designations for employee dropdowns.
 */
const ORG_STRUCTURE = [
  {
    dept: 'Engineering',
    designations: [
      'Engineering Manager',
      'Mechanical Engineer',
      'Electrical Engineer',
      'Production Engineer',
      'Design Engineer',
      'Maintenance Engineer',
      'Project Engineer',
      'Junior Engineer',
      'Senior Engineer',
      'Trainee Engineer',
    ],
  },
  { dept: 'Production', designations: ['Production Manager', 'Machine Operator', 'Production Supervisor'] },
  { dept: 'Quality Control', designations: ['Quality Inspector', 'Quality Engineer'] },
  { dept: 'Maintenance', designations: ['Maintenance Technician', 'Maintenance Supervisor'] },
  { dept: 'Human Resources (HR)', designations: ['HR Manager', 'HR Executive'] },
  { dept: 'Accounts / Finance', designations: ['Accountant', 'Accounts Assistant'] },
  { dept: 'Sales', designations: ['Sales Manager', 'Sales Executive'] },
  { dept: 'Marketing', designations: ['Marketing Executive'] },
  { dept: 'Stores / Inventory', designations: ['Store Keeper', 'Inventory Manager'] },
  { dept: 'Administration', designations: ['Office Administrator', 'Office Assistant'] },
  {
    dept: 'IT',
    designations: [
      'Software Developer',
      'Web Developer',
      'Frontend Developer',
      'Backend Developer',
      'Full Stack Developer',
      'Software Engineer',
      'System Administrator',
      'Database Administrator',
      'IT Support Engineer',
      'Network Engineer',
      'QA / Test Engineer',
      'DevOps Engineer',
      'UI/UX Designer',
    ],
  },
];

function getDesignationsForDept(deptName) {
  const row = ORG_STRUCTURE.find(o => o.dept === deptName);
  return row ? row.designations.slice() : [];
}
