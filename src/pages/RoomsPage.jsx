/**
 * RoomsPage — v3.1
 *
 * Tabs:
 *   1. Inventory    — room grid, click to edit, status legend
 *   2. Add / Edit   — single room form using config (class, type, floor, amenities, attributes)
 *   3. Bulk Create  — paste/upload CSV, preview rows, import with results report
 *   4. Closures     — create, view, edit, delete closures; bulk-close multiple rooms
 *   5. Configuration— manage room classes, types, floors, amenities
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

// ── helpers ──────────────────────────────────────────────────────
const fmtCur  = n => `₹${Number(n||0).toLocaleString('en-IN')}`;
const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';

const STATUS_DOT = {
  available:   '#059669', occupied: '#DC2626', reserved: '#D97706',
  closed:      '#9CA3AF', maintenance: '#9333EA',
};
const STATUS_RING = {
  available: 'ring-emerald-400', occupied: 'ring-red-400', reserved: 'ring-amber-400',
  closed: 'ring-gray-300', maintenance: 'ring-purple-400',
};

const REASONS = ['Maintenance','Renovation','Owner block','Event','Deep cleaning','Pest control','Other'];

const EMPTY_ROOM = {
  number:'', floor:'', max_occupancy:'2', base_rate:'', description:'',
  room_class_id:'', room_type_id:'', floor_id:'', amenity_ids:[], attributes:{},
};

// ── Tab button ────────────────────────────────────────────────────
function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
      {children}
    </button>
  );
}

// ── Small section card ────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
export default function RoomsPage() {
  const { isAtLeast } = useAuth();
  const [tab, setTab] = useState('inventory');

  const [rooms,    setRooms]    = useState([]);
  const [config,   setConfig]   = useState({ classes:[], types:[], floors:[], amenities:[] });
  const [loading,  setLoading]  = useState(true);
  const [editRoom, setEditRoom] = useState(null); // null = new, object = editing

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        api.get('/rooms').then(x => x.data),
        api.get('/room-config/all').then(x => x.data),
      ]);
      setRooms(r);
      setConfig(c);
    } catch { toast.error('Failed to load rooms'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-fetch data when switching back to inventory tab
  useEffect(() => { if (tab === 'inventory') load(); }, [tab]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 pt-4">
        <h1 className="text-xl font-semibold text-gray-900 mb-3">Room inventory</h1>
        <div className="flex gap-1 border-b border-gray-100 -mb-px">
          <Tab active={tab==='inventory'}     onClick={() => setTab('inventory')}>Inventory</Tab>
          {isAtLeast('manager') && <Tab active={tab==='addedit'} onClick={() => { setEditRoom(null); setTab('addedit'); }}>Add / Edit room</Tab>}
          {isAtLeast('manager') && <Tab active={tab==='bulk'}    onClick={() => setTab('bulk')}>Bulk create</Tab>}
          {isAtLeast('manager') && <Tab active={tab==='closures'}onClick={() => setTab('closures')}>Closures</Tab>}
          {isAtLeast('manager') && <Tab active={tab==='config'}  onClick={() => setTab('config')}>Configuration</Tab>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'inventory' && (
          <InventoryTab rooms={rooms} loading={loading}
            onEdit={r => { setEditRoom(r); setTab('addedit'); }} />
        )}
        {tab === 'addedit' && (
          <AddEditTab rooms={rooms} config={config} editRoom={editRoom}
            onSaved={() => { setEditRoom(null); load(); setTab('inventory'); }}
            onCancel={() => setTab('inventory')} />
        )}
        {tab === 'bulk' && (
          <BulkCreateTab onDone={() => { load(); setTab('inventory'); }} />
        )}
        {tab === 'closures' && (
          <ClosuresTab rooms={rooms} onDone={load} />
        )}
        {tab === 'config' && (
          <ConfigTab config={config} onDone={load} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 1 — INVENTORY
// ═══════════════════════════════════════════════════════════════════
function InventoryTab({ rooms, loading, onEdit }) {
  const counts = rooms.reduce((a, r) => { a[r.status] = (a[r.status]||0)+1; return a; }, {});
  const grouped = rooms.reduce((acc, r) => {
    const grp = r.class_name || r.type || 'Rooms';
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(r); return acc;
  }, {});

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>;

  return (
    <div>
      {/* Status summary */}
      <div className="flex gap-4 flex-wrap mb-5 text-xs text-gray-600">
        {Object.entries(STATUS_DOT).map(([s, col]) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: col }}></span>
            <span className="capitalize">{s}</span>
            <span className="font-semibold text-gray-900">{counts[s]||0}</span>
          </span>
        ))}
        <span className="ml-auto text-gray-400">Total: {rooms.length}</span>
      </div>

      {Object.entries(grouped).map(([grp, rs]) => (
        <div key={grp} className="mb-6">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{grp}</div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-2">
            {rs.map(r => (
              <div key={r.id} onClick={() => onEdit(r)}
                className={`border border-gray-100 border-l-4 rounded-lg p-2.5 cursor-pointer
                  hover:shadow-md transition-all ring-offset-1 ${STATUS_RING[r.status]||''}`}
                style={{ borderLeftColor: STATUS_DOT[r.status] || '#9CA3AF' }}>
                <div className="text-sm font-bold text-gray-900">{r.number}</div>
                <div className="text-xs text-gray-400 truncate">{r.type_name||r.type}</div>
                <div className="text-xs font-medium capitalize mt-0.5" style={{ color: STATUS_DOT[r.status] }}>
                  {r.status}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{fmtCur(r.base_rate)}/n</div>
                {/* Amenities preview dots */}
                {r.amenity_ids && JSON.parse(typeof r.amenity_ids==='string'?r.amenity_ids:'[]').length > 0 && (
                  <div className="text-xs text-gray-300 mt-0.5">
                    {JSON.parse(typeof r.amenity_ids==='string'?r.amenity_ids:'[]').length} amenities
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {rooms.length === 0 && (
        <div className="text-center text-gray-400 py-16 text-sm">
          No rooms yet. Use the "Add / Edit room" tab to get started.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2 — ADD / EDIT ROOM
// ═══════════════════════════════════════════════════════════════════
function AddEditTab({ rooms, config, editRoom, onSaved, onCancel }) {
  const isEditing = !!editRoom;

  const parseIds = raw => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  };
  const parseAttrs = raw => {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  };

  const [form, setForm] = useState(() => editRoom ? {
    number:         editRoom.number || '',
    floor:          editRoom.floor  || '',
    max_occupancy:  editRoom.max_occupancy || '2',
    base_rate:      editRoom.base_rate || '',
    description:    editRoom.description || '',
    room_class_id:  editRoom.room_class_id || '',
    room_type_id:   editRoom.room_type_id  || '',
    floor_id:       editRoom.floor_id      || '',
    amenity_ids:    parseIds(editRoom.amenity_ids),
    attributes:     parseAttrs(editRoom.attributes),
    status:         editRoom.status || 'available',
  } : { ...EMPTY_ROOM });

  const [newAttrKey, setNewAttrKey] = useState('');
  const [newAttrVal, setNewAttrVal] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleAmenity = id => {
    setForm(f => ({
      ...f,
      amenity_ids: f.amenity_ids.includes(id)
        ? f.amenity_ids.filter(x => x !== id)
        : [...f.amenity_ids, id],
    }));
  };

  const addAttr = () => {
    if (!newAttrKey.trim()) return;
    setForm(f => ({ ...f, attributes: { ...f.attributes, [newAttrKey.trim()]: newAttrVal.trim() } }));
    setNewAttrKey(''); setNewAttrVal('');
  };
  const removeAttr = k => {
    setForm(f => { const a = { ...f.attributes }; delete a[k]; return { ...f, attributes: a }; });
  };

  const save = async () => {
    if (!form.number || !form.base_rate) return toast.error('Room number and base rate required');
    setSaving(true);
    try {
      const payload = {
        ...form,
        floor:         parseInt(form.floor) || 1,
        max_occupancy: parseInt(form.max_occupancy) || 2,
        base_rate:     parseFloat(form.base_rate),
        room_class_id: form.room_class_id || null,
        room_type_id:  form.room_type_id  || null,
        floor_id:      form.floor_id      || null,
        amenity_ids:   form.amenity_ids,
        attributes:    form.attributes,
      };
      if (isEditing) {
        await api.put(`/rooms/${editRoom.id}`, payload);
        toast.success(`Room ${form.number} updated`);
      } else {
        await api.post('/rooms', payload);
        toast.success(`Room ${form.number} created`);
      }
      onSaved();
    } catch (e) { toast.error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const del = async () => {
    if (!window.confirm(`Delete Room ${editRoom.number}? This cannot be undone.`)) return;
    try { await api.delete(`/rooms/${editRoom.id}`); toast.success('Room deleted'); onSaved(); }
    catch (e) { toast.error(e.response?.data?.error || 'Delete failed'); }
  };

  // Amenities grouped by category
  const amenityGroups = config.amenities.reduce((acc, a) => {
    if (!acc[a.category]) acc[a.category] = [];
    acc[a.category].push(a); return acc;
  }, {});

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">{isEditing ? `Edit Room ${editRoom.number}` : 'Add new room'}</h2>
        <button onClick={onCancel} className="btn btn-sm text-gray-500">← Back</button>
      </div>

      {/* ── Core details ── */}
      <Section title="Room details">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Room number *</label>
            <input className="input" placeholder="e.g. 205" value={form.number}
              onChange={e => set('number', e.target.value)} />
          </div>
          <div>
            <label className="label">Base rate (₹/night) *</label>
            <input className="input" type="number" placeholder="3500" value={form.base_rate}
              onChange={e => set('base_rate', e.target.value)} />
          </div>
          <div>
            <label className="label">Floor (number)</label>
            <input className="input" type="number" min="0" placeholder="1" value={form.floor}
              onChange={e => set('floor', e.target.value)} />
          </div>
          <div>
            <label className="label">Max occupancy</label>
            <input className="input" type="number" min="1" max="20" value={form.max_occupancy}
              onChange={e => set('max_occupancy', e.target.value)} />
          </div>
          {isEditing && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {['available','reserved','occupied','maintenance','closed'].map(s =>
                  <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
              </select>
            </div>
          )}
          <div className={isEditing ? '' : 'col-span-2'}>
            <label className="label">Description</label>
            <input className="input" placeholder="Brief room description" value={form.description}
              onChange={e => set('description', e.target.value)} />
          </div>
        </div>
      </Section>

      {/* ── Classification ── */}
      <Section title="Classification">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Room class</label>
            <select className="input" value={form.room_class_id} onChange={e => set('room_class_id', e.target.value)}>
              <option value="">— none —</option>
              {config.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {config.classes.length === 0 && <p className="text-xs text-gray-400 mt-1">Add classes in Configuration tab</p>}
          </div>
          <div>
            <label className="label">Room type</label>
            <select className="input" value={form.room_type_id} onChange={e => set('room_type_id', e.target.value)}>
              <option value="">— none —</option>
              {config.types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {config.types.length === 0 && <p className="text-xs text-gray-400 mt-1">Add types in Configuration tab</p>}
          </div>
          <div>
            <label className="label">Floor</label>
            <select className="input" value={form.floor_id} onChange={e => set('floor_id', e.target.value)}>
              <option value="">— none —</option>
              {config.floors.map(f => <option key={f.id} value={f.id}>
                Floor {f.number}{f.display_name ? ` — ${f.display_name}` : ''}
              </option>)}
            </select>
            {config.floors.length === 0 && <p className="text-xs text-gray-400 mt-1">Add floors in Configuration tab</p>}
          </div>
        </div>
      </Section>

      {/* ── Amenities ── */}
      <Section title="Amenities">
        {config.amenities.length === 0 ? (
          <p className="text-sm text-gray-400">No amenities defined. Add them in the Configuration tab.</p>
        ) : (
          Object.entries(amenityGroups).map(([cat, ams]) => (
            <div key={cat} className="mb-3">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">{cat}</div>
              <div className="flex flex-wrap gap-2">
                {ams.map(a => {
                  const checked = form.amenity_ids.includes(a.id);
                  return (
                    <button key={a.id} type="button" onClick={() => toggleAmenity(a.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all
                        ${checked ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <span>{a.icon}</span> {a.name}
                      {checked && <span className="text-brand-500">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </Section>

      {/* ── Attributes (freeform key-value) ── */}
      <Section title="Attributes">
        <p className="text-xs text-gray-400 mb-3">Freeform details like bed size, view type, balcony, etc.</p>
        {Object.entries(form.attributes).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-gray-600 w-28 flex-shrink-0 capitalize">{k.replace(/_/g,' ')}</span>
            <input className="input flex-1" value={v}
              onChange={e => setForm(f => ({ ...f, attributes: { ...f.attributes, [k]: e.target.value } }))} />
            <button onClick={() => removeAttr(k)} className="text-gray-300 hover:text-red-400 text-lg flex-shrink-0">×</button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input className="input" placeholder="key (e.g. bed_size)" value={newAttrKey}
            onChange={e => setNewAttrKey(e.target.value)} onKeyDown={e => e.key==='Enter'&&addAttr()} />
          <input className="input" placeholder="value (e.g. King)" value={newAttrVal}
            onChange={e => setNewAttrVal(e.target.value)} onKeyDown={e => e.key==='Enter'&&addAttr()} />
          <button onClick={addAttr} className="btn btn-sm flex-shrink-0">Add</button>
        </div>
        {/* Quick-add common attributes */}
        <div className="flex gap-2 flex-wrap mt-2">
          {['bed_size','view','balcony','smoking','connecting_room','smart_tv'].map(k => (
            !form.attributes[k] &&
            <button key={k} onClick={() => { setNewAttrKey(k); }}
              className="text-xs text-gray-400 hover:text-brand-600 border border-dashed border-gray-200 px-2 py-0.5 rounded">
              + {k.replace(/_/g,' ')}
            </button>
          ))}
        </div>
      </Section>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create room'}
        </button>
        <button onClick={onCancel} className="btn">Cancel</button>
        {isEditing && (
          <button onClick={del} className="btn btn-danger ml-auto">Delete room</button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 3 — BULK CREATE
// ═══════════════════════════════════════════════════════════════════
function BulkCreateTab({ onDone }) {
  const [csvText,  setCsvText]  = useState('');
  const [preview,  setPreview]  = useState([]);
  const [result,   setResult]   = useState(null);
  const [busy,     setBusy]     = useState(false);
  const fileRef = useRef();

  const downloadTemplate = () => {
    api.get('/rooms/csv-template', { responseType: 'blob' })
      .then(r => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(r.data);
        a.download = 'rooms-import-template.csv';
        a.click();
      })
      .catch(() => toast.error('Download failed'));
  };

  const parsePreview = text => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length < 2) { setPreview([]); return; }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows = lines.slice(1).map(l => {
      const cols = l.split(',').map(c => c.trim());
      return headers.reduce((obj, h, i) => { obj[h] = cols[i]||''; return obj; }, {});
    }).filter(r => r.number || r.base_rate);
    setPreview(rows);
  };

  const onFileChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { const t = ev.target.result; setCsvText(t); parsePreview(t); };
    reader.readAsText(file);
  };

  const importCSV = async () => {
    if (!csvText.trim()) return toast.error('Paste or upload a CSV first');
    setBusy(true);
    try {
      const r = await api.post('/rooms/csv-import', { csv: csvText });
      setResult(r.data);
      if (r.data.summary.created > 0) {
        toast.success(`${r.data.summary.created} room(s) created`);
        onDone();
      }
    } catch (e) { toast.error(e.response?.data?.error || 'Import failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-base font-semibold text-gray-900 flex-1">Bulk room creation</h2>
        <button onClick={downloadTemplate} className="btn btn-sm">⬇ Download CSV template</button>
        <button onClick={() => fileRef.current.click()} className="btn btn-sm">📂 Upload CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileChange} />
      </div>

      <div className="card mb-4">
        <label className="label">Paste CSV content</label>
        <textarea className="input font-mono text-xs h-40" placeholder={'number,type,floor,max_occupancy,base_rate\n101,Standard,1,2,3500\n102,Standard,1,2,3500'}
          value={csvText} onChange={e => { setCsvText(e.target.value); parsePreview(e.target.value); }} />
      </div>

      {/* Preview table */}
      {preview.length > 0 && !result && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium text-gray-800">Preview — {preview.length} row{preview.length!==1?'s':''}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {Object.keys(preview[0]).map(h => <th key={h} className="th py-2 capitalize">{h.replace(/_/g,' ')}</th>)}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0,20).map((row, i) => (
                  <tr key={i} className="table-row">
                    {Object.values(row).map((v, j) => <td key={j} className="td py-1.5">{v||'—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 20 && <p className="text-xs text-gray-400 mt-2 px-4">… and {preview.length-20} more rows</p>}
          </div>
          <button onClick={importCSV} disabled={busy} className="btn btn-primary mt-4">
            {busy ? 'Importing…' : `Import ${preview.length} rooms`}
          </button>
        </div>
      )}

      {/* Import result */}
      {result && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Import complete</h3>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[['Total', result.summary.total, 'text-gray-900'],
              ['Created', result.summary.created, 'text-emerald-700'],
              ['Skipped', result.summary.skipped, 'text-amber-700'],
              ['Errors',  result.summary.errors,  'text-red-600']].map(([l,v,c]) => (
              <div key={l} className="text-center p-3 bg-gray-50 rounded-lg">
                <div className={`text-2xl font-semibold ${c}`}>{v}</div>
                <div className="text-xs text-gray-400">{l}</div>
              </div>
            ))}
          </div>
          {result.skipped.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-amber-700 mb-1">Skipped (already exist):</div>
              <div className="text-xs text-gray-600">{result.skipped.map(s => s.number).join(', ')}</div>
            </div>
          )}
          {result.errors.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-600 mb-1">Errors:</div>
              {result.errors.map((e,i) => <div key={i} className="text-xs text-red-500">Room {e.number}: {e.reason}</div>)}
            </div>
          )}
          <button onClick={() => { setResult(null); setCsvText(''); setPreview([]); }}
            className="btn btn-sm mt-4">Import more</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 4 — CLOSURES
// ═══════════════════════════════════════════════════════════════════
function ClosuresTab({ rooms, onDone }) {
  const [closures,    setClosures]    = useState([]);
  const [editC,       setEditC]       = useState(null); // closure being edited
  const [singleForm,  setSingleForm]  = useState({ room_id:'', from_date:'', to_date:'', reason:'Maintenance', notes:'' });
  const [bulkForm,    setBulkForm]    = useState({ from_date:'', to_date:'', reason:'Maintenance', notes:'' });
  const [bulkSelected,setBulkSelected]= useState([]);
  const [view, setView] = useState('list'); // list | single | bulk

  const loadClosures = async () => {
    try {
      const all = await Promise.all(rooms.map(r => api.get(`/rooms/${r.id}/closures`).then(x => x.data.map(c => ({ ...c, room_number: r.number, room_type: r.type })))));
      setClosures(all.flat().sort((a,b) => a.from_date > b.from_date ? 1 : -1));
    } catch { toast.error('Failed to load closures'); }
  };
  useEffect(() => { loadClosures(); }, [rooms]);

  const saveSingle = async () => {
    if (!singleForm.room_id||!singleForm.from_date||!singleForm.to_date) return toast.error('Select room and dates');
    try {
      await api.post(`/rooms/${singleForm.room_id}/close`, singleForm);
      toast.success('Room closed');
      setSingleForm({ room_id:'', from_date:'', to_date:'', reason:'Maintenance', notes:'' });
      loadClosures(); onDone();
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const saveBulk = async () => {
    if (!bulkSelected.length||!bulkForm.from_date||!bulkForm.to_date) return toast.error('Select rooms and dates');
    try {
      const r = await api.post('/rooms/bulk-close', { room_ids: bulkSelected, ...bulkForm });
      toast.success(`${r.data.summary.closed} room(s) closed`);
      setBulkSelected([]); setBulkForm({ from_date:'', to_date:'', reason:'Maintenance', notes:'' });
      loadClosures(); onDone();
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const saveEdit = async () => {
    try {
      await api.put(`/rooms/${editC.room_id}/closures/${editC.id}`, editC);
      toast.success('Closure updated'); setEditC(null); loadClosures();
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const lift = async c => {
    if (!window.confirm(`Lift closure for Room ${c.room_number}?`)) return;
    try {
      await api.delete(`/rooms/${c.room_id}/close/${c.id}`);
      toast.success('Closure lifted'); loadClosures(); onDone();
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  return (
    <div className="max-w-3xl">
      {/* Sub-nav */}
      <div className="flex gap-2 mb-5">
        {[['list','Active closures'],['single','Close room'],['bulk','Bulk close']].map(([v,l]) => (
          <button key={v} onClick={() => setView(v)}
            className={`btn btn-sm ${view===v?'btn-primary':''}`}>{l}</button>
        ))}
      </div>

      {/* ── Active closures list ── */}
      {view === 'list' && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Active closures</h3>
          {closures.length === 0 ? (
            <p className="text-sm text-gray-400">No active closures.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="th">Room</th><th className="th">From</th><th className="th">To</th>
                <th className="th">Reason</th><th className="th">Notes</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {closures.map(c => (
                  editC?.id === c.id ? (
                    <tr key={c.id} className="bg-amber-50">
                      <td className="td font-medium">{c.room_number}</td>
                      <td className="td"><input className="input py-1 text-xs" type="date" value={editC.from_date} onChange={e=>setEditC(x=>({...x,from_date:e.target.value}))}/></td>
                      <td className="td"><input className="input py-1 text-xs" type="date" value={editC.to_date}   onChange={e=>setEditC(x=>({...x,to_date:e.target.value}))}/></td>
                      <td className="td"><select className="input py-1 text-xs" value={editC.reason} onChange={e=>setEditC(x=>({...x,reason:e.target.value}))}>{REASONS.map(r=><option key={r}>{r}</option>)}</select></td>
                      <td className="td"><input className="input py-1 text-xs" value={editC.notes||''} onChange={e=>setEditC(x=>({...x,notes:e.target.value}))} placeholder="Optional notes"/></td>
                      <td className="td">
                        <button onClick={saveEdit} className="btn btn-sm btn-primary mr-1">Save</button>
                        <button onClick={()=>setEditC(null)} className="btn btn-sm">×</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id} className="table-row">
                      <td className="td font-medium">Room {c.room_number}</td>
                      <td className="td">{fmtDate(c.from_date)}</td>
                      <td className="td">{fmtDate(c.to_date)}</td>
                      <td className="td">{c.reason}</td>
                      <td className="td text-gray-400 text-xs max-w-32 truncate">{c.notes||'—'}</td>
                      <td className="td">
                        <button onClick={()=>setEditC({...c})} className="btn btn-sm mr-1">Edit</button>
                        <button onClick={()=>lift(c)} className="btn btn-sm btn-danger">Lift</button>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Single room closure ── */}
      {view === 'single' && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Close a room</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Room</label>
              <select className="input" value={singleForm.room_id} onChange={e=>setSingleForm(f=>({...f,room_id:e.target.value}))}>
                <option value="">Select room…</option>
                {rooms.map(r=><option key={r.id} value={r.id}>Room {r.number} — {r.type} ({r.status})</option>)}
              </select>
            </div>
            <div><label className="label">From</label>
              <input className="input" type="date" value={singleForm.from_date} onChange={e=>setSingleForm(f=>({...f,from_date:e.target.value}))}/></div>
            <div><label className="label">To</label>
              <input className="input" type="date" value={singleForm.to_date} onChange={e=>setSingleForm(f=>({...f,to_date:e.target.value}))}/></div>
            <div><label className="label">Reason</label>
              <select className="input" value={singleForm.reason} onChange={e=>setSingleForm(f=>({...f,reason:e.target.value}))}>
                {REASONS.map(r=><option key={r}>{r}</option>)}
              </select></div>
            <div><label className="label">Notes</label>
              <input className="input" placeholder="Optional detail" value={singleForm.notes} onChange={e=>setSingleForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <button onClick={saveSingle} className="btn btn-danger mt-4">Close room</button>
        </div>
      )}

      {/* ── Bulk close ── */}
      {view === 'bulk' && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Bulk close rooms</h3>
          <p className="text-xs text-gray-400 mb-3">Select rooms, then set the date range and reason.</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
            {rooms.map(r => {
              const sel = bulkSelected.includes(r.id);
              return (
                <button key={r.id} onClick={() => setBulkSelected(s => sel ? s.filter(x=>x!==r.id) : [...s,r.id])}
                  className={`p-2 rounded-lg border text-xs text-left transition-all
                    ${sel ? 'bg-brand-50 border-brand-400 text-brand-700' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}
                    ${r.status==='occupied'?'opacity-40 cursor-not-allowed':''}`}
                  disabled={r.status==='occupied'}>
                  <div className="font-semibold">{r.number}</div>
                  <div className="text-gray-400 capitalize">{r.status}</div>
                  {sel && <div className="text-brand-500 font-medium">✓ selected</div>}
                </button>
              );
            })}
          </div>
          <div className="text-xs text-gray-400 mb-3">{bulkSelected.length} room{bulkSelected.length!==1?'s':''} selected</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">From</label>
              <input className="input" type="date" value={bulkForm.from_date} onChange={e=>setBulkForm(f=>({...f,from_date:e.target.value}))}/></div>
            <div><label className="label">To</label>
              <input className="input" type="date" value={bulkForm.to_date} onChange={e=>setBulkForm(f=>({...f,to_date:e.target.value}))}/></div>
            <div><label className="label">Reason</label>
              <select className="input" value={bulkForm.reason} onChange={e=>setBulkForm(f=>({...f,reason:e.target.value}))}>
                {REASONS.map(r=><option key={r}>{r}</option>)}
              </select></div>
            <div><label className="label">Notes</label>
              <input className="input" placeholder="Optional detail" value={bulkForm.notes} onChange={e=>setBulkForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <button onClick={saveBulk} disabled={!bulkSelected.length} className="btn btn-danger mt-4 disabled:opacity-50">
            Close {bulkSelected.length} room{bulkSelected.length!==1?'s':''}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB 5 — CONFIGURATION
// ═══════════════════════════════════════════════════════════════════
function ConfigTab({ config, onDone }) {
  const [section, setSection] = useState('classes');
  const [items,   setItems]   = useState([]);
  const [editItem,setEditItem] = useState(null);
  const [newItem, setNewItem] = useState({});
  const [busy,    setBusy]    = useState(false);

  const SECTIONS = {
    classes:   { label: 'Room classes',  api: '/room-config/classes',  fields: ['name','description','color','sort_order'], hint: 'e.g. Economy, Standard, Premium, Luxury' },
    types:     { label: 'Room types',    api: '/room-config/types',    fields: ['name','description','room_class_id','default_max_occupancy','default_base_rate','sort_order'], hint: 'e.g. Standard Twin, Deluxe King, Suite' },
    floors:    { label: 'Floors',        api: '/room-config/floors',   fields: ['number','display_name','notes'], hint: 'e.g. Floor 1 = "Ground Floor"' },
    amenities: { label: 'Amenities',     api: '/room-config/amenities',fields: ['name','icon','category','sort_order'], hint: 'e.g. Air Conditioning, Pool View, Balcony' },
  };

  const loadSection = async () => {
    try {
      const r = await api.get(SECTIONS[section].api);
      setItems(r.data);
    } catch { toast.error('Failed to load'); }
  };
  useEffect(() => { setEditItem(null); setNewItem({}); loadSection(); }, [section]);

  const saveNew = async () => {
    if (!newItem.name && !newItem.number) return toast.error('Name / number required');
    setBusy(true);
    try {
      await api.post(SECTIONS[section].api, newItem);
      toast.success('Added'); setNewItem({}); loadSection(); onDone();
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.put(`${SECTIONS[section].api}/${editItem.id}`, editItem);
      toast.success('Updated'); setEditItem(null); loadSection(); onDone();
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const del = async item => {
    if (!window.confirm(`Remove "${item.name||'Floor '+item.number}"?`)) return;
    try {
      await api.delete(`${SECTIONS[section].api}/${item.id}`);
      toast.success('Removed'); loadSection(); onDone();
    } catch (e) { toast.error(e.response?.data?.error||'Failed'); }
  };

  const cfg = SECTIONS[section];

  return (
    <div className="max-w-2xl">
      {/* Section selector */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {Object.entries(SECTIONS).map(([k, s]) => (
          <button key={k} onClick={() => setSection(k)}
            className={`btn btn-sm ${section===k?'btn-primary':''}`}>{s.label}</button>
        ))}
      </div>

      <Section title={cfg.label} action={<span className="text-xs text-gray-400">{cfg.hint}</span>}>
        {/* Existing items */}
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 mb-4">No {cfg.label.toLowerCase()} defined yet.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {items.map(item => (
              editItem?.id === item.id ? (
                <div key={item.id} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <ConfigForm section={section} item={editItem} onChange={setEditItem} config={config}/>
                  <div className="flex gap-2 mt-2">
                    <button onClick={saveEdit} disabled={busy} className="btn btn-sm btn-primary">Save</button>
                    <button onClick={()=>setEditItem(null)} className="btn btn-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.color && <span className="w-4 h-4 rounded-sm flex-shrink-0" style={{background:item.color}}></span>}
                    {item.icon  && <span className="text-base">{item.icon}</span>}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {item.name || `Floor ${item.number}`}
                        {item.display_name && <span className="text-gray-400 font-normal"> — {item.display_name}</span>}
                      </div>
                      {item.class_name && <div className="text-xs text-gray-400">{item.class_name}</div>}
                      {item.description && <div className="text-xs text-gray-400 truncate">{item.description}</div>}
                      {item.category    && <div className="text-xs text-gray-400">{item.category}</div>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={()=>setEditItem({...item})} className="btn btn-sm">Edit</button>
                    <button onClick={()=>del(item)} className="btn btn-sm btn-danger">×</button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {/* Add new */}
        <div className="border-t border-gray-100 pt-4">
          <div className="text-xs font-medium text-gray-500 mb-2">Add new</div>
          <ConfigForm section={section} item={newItem} onChange={setNewItem} config={config}/>
          <button onClick={saveNew} disabled={busy} className="btn btn-primary btn-sm mt-3">
            {busy ? 'Adding…' : `Add ${cfg.label.replace(/s$/, '')}`}
          </button>
        </div>
      </Section>
    </div>
  );
}

function ConfigForm({ section, item, onChange, config }) {
  const set = (k, v) => onChange(x => ({ ...x, [k]: v }));
  if (section === 'classes') return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2"><label className="label">Name *</label><input className="input" value={item.name||''} onChange={e=>set('name',e.target.value)} placeholder="e.g. Premium"/></div>
      <div><label className="label">Colour</label><input className="input" type="color" value={item.color||'#6B7280'} onChange={e=>set('color',e.target.value)}/></div>
      <div><label className="label">Sort order</label><input className="input" type="number" value={item.sort_order||0} onChange={e=>set('sort_order',parseInt(e.target.value))}/></div>
      <div className="col-span-2"><label className="label">Description</label><input className="input" value={item.description||''} onChange={e=>set('description',e.target.value)} placeholder="Optional"/></div>
    </div>
  );
  if (section === 'types') return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2"><label className="label">Name *</label><input className="input" value={item.name||''} onChange={e=>set('name',e.target.value)} placeholder="e.g. Deluxe King"/></div>
      <div><label className="label">Class</label>
        <select className="input" value={item.room_class_id||''} onChange={e=>set('room_class_id',e.target.value||null)}>
          <option value="">— none —</option>
          {config.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div><label className="label">Default max occ.</label><input className="input" type="number" value={item.default_max_occupancy||2} onChange={e=>set('default_max_occupancy',parseInt(e.target.value))}/></div>
      <div><label className="label">Default rate (₹)</label><input className="input" type="number" value={item.default_base_rate||''} onChange={e=>set('default_base_rate',e.target.value?parseFloat(e.target.value):null)} placeholder="Optional"/></div>
      <div><label className="label">Sort order</label><input className="input" type="number" value={item.sort_order||0} onChange={e=>set('sort_order',parseInt(e.target.value))}/></div>
    </div>
  );
  if (section === 'floors') return (
    <div className="grid grid-cols-2 gap-2">
      <div><label className="label">Floor number *</label><input className="input" type="number" value={item.number||''} onChange={e=>set('number',parseInt(e.target.value))} placeholder="1"/></div>
      <div><label className="label">Display name</label><input className="input" value={item.display_name||''} onChange={e=>set('display_name',e.target.value)} placeholder="e.g. Ground Floor"/></div>
      <div className="col-span-2"><label className="label">Notes</label><input className="input" value={item.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Optional"/></div>
    </div>
  );
  if (section === 'amenities') return (
    <div className="grid grid-cols-2 gap-2">
      <div><label className="label">Name *</label><input className="input" value={item.name||''} onChange={e=>set('name',e.target.value)} placeholder="e.g. Air Conditioning"/></div>
      <div><label className="label">Icon (emoji)</label><input className="input" value={item.icon||'✓'} onChange={e=>set('icon',e.target.value)} placeholder="❄"/></div>
      <div><label className="label">Category</label>
        <select className="input" value={item.category||'General'} onChange={e=>set('category',e.target.value)}>
          {['General','Room','Bathroom','Entertainment','View','Services','Food & Beverage'].map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div><label className="label">Sort order</label><input className="input" type="number" value={item.sort_order||0} onChange={e=>set('sort_order',parseInt(e.target.value))}/></div>
    </div>
  );
  return null;
}
