import { FormEvent, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api/client';
import { Role } from '../types';

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  designation?: string | null;
  canSubAssign: boolean;
  department?: { id: string; name: string } | null;
}

export function Staff() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [designation, setDesignation] = useState('');
  const [canSubAssign, setCanSubAssign] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.get('/users');
    setRows(res.data.users);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/users', { name, email, password, role, designation: designation || undefined, canSubAssign });
      setName(''); setEmail(''); setPassword(''); setRole('STAFF'); setDesignation(''); setCanSubAssign(false);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create user.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(row: StaffRow) {
    await api.patch(`/users/${row.id}`, { status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ New Staff'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2 rounded-md border-l-2 border-l-danger-500 bg-danger-50 px-3 py-2 text-sm text-danger-500">
              {error}
            </div>
          )}
          <div>
            <label className="label">Name</label>
            <input required className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input required type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Temporary Password</label>
            <input required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">Designation</label>
            <input className="input" value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin / Office Head</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm text-navy-700">
            <input type="checkbox" checked={canSubAssign} onChange={(e) => setCanSubAssign(e.target.checked)} />
            Can sub-assign tasks
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border2 bg-navy-50/60 text-left text-xs uppercase tracking-wide text-slate2-500">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Department</th>
              <th className="px-4 py-2.5 font-medium">Sub-assign</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate2-500">Loading…</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-b border-border2 last:border-0 hover:bg-navy-50/50">
                <td className="px-4 py-2.5 font-medium text-navy-900">{r.name}</td>
                <td className="px-4 py-2.5 text-slate2-600">{r.email}</td>
                <td className="px-4 py-2.5">{r.role.replace('_', ' ')}</td>
                <td className="px-4 py-2.5 text-slate2-600">{r.department?.name ?? '—'}</td>
                <td className="px-4 py-2.5">{r.canSubAssign ? 'Yes' : 'No'}</td>
                <td className="px-4 py-2.5">
                  <span className={r.status === 'ACTIVE' ? 'text-success-500' : 'text-danger-500'}>
                    {r.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <button className="text-xs font-medium text-navy-600 hover:underline" onClick={() => toggleStatus(r)}>
                    {r.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
