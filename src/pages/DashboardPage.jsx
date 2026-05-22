/**
 * DashboardPage — v5
 *
 * PROPERTY SWITCHING FIX:
 * Uses usePropertyVersion() in useEffect deps so the dashboard
 * automatically refetches when the user switches properties.
 *
 * Pattern used here should be applied to ALL page components:
 *
 *   const propertyVersion = usePropertyVersion();
 *   useEffect(() => {
 *     loadData();
 *   }, [propertyVersion]);  ← refetches on mount AND on property switch
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePropertyVersion } from '../hooks/usePropertyVersion';
import toast from 'react-hot-toast';

function MetricCard({ label, value, color, sub }) {
  return (
    <div className="card py-3 px-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xl font-semibold" style={{ color: color || 'var(--color-text-primary)' }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

const HK_COLORS = {
  pending:     '#9CA3AF',
  assigned:    '#3B82F6',
  in_progress: '#F59E0B',
  completed:   '#8B5CF6',
};

export default function DashboardPage() {
  const { activeProperty } = useAuth();
  const propertyVersion    = usePropertyVersion(); // refetch trigger
  const navigate           = useNavigate();

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/dashboard');
      setData(r.data);
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to load dashboard';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [propertyVersion]); // ← propertyVersion here is the key fix

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-gray-400 text-sm">
      <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      Loading {activeProperty?.name || 'dashboard'}…
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="text-red-600 text-sm mb-3">{error}</div>
      <button onClick={loadDashboard} className="btn btn-sm">Retry</button>
    </div>
  );

  if (!data) return null;

  const fmtCur = n => `${data.property?.currency_symbol || activeProperty?.currency_symbol || '₹'}${Number(n || 0).toLocaleString('en-IN')}`;

  const roomChart = [
    { name: 'Available', value: data.rooms?.available  || 0, color: '#059669' },
    { name: 'Occupied',  value: data.rooms?.occupied   || 0, color: '#DC2626' },
    { name: 'Reserved',  value: data.rooms?.reserved   || 0, color: '#D97706' },
    { name: 'Maint.',    value: (data.rooms?.maintenance || 0) + (data.rooms?.closed || 0), color: '#9CA3AF' },
  ];

  return (
    <div className="p-6">
      {/* Property header */}
      {activeProperty && (
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ background: activeProperty.primary_color || '#185FA5' }}>
            {(activeProperty.code || activeProperty.name || '?')[0]}
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900">{activeProperty.name}</div>
            {activeProperty.city && <div className="text-xs text-gray-400">{activeProperty.city}</div>}
          </div>
          <div className="ml-auto text-xs text-gray-300">Property data</div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <MetricCard label="Total rooms"    value={data.rooms?.total || 0} />
        <MetricCard label="Occupied"       value={data.rooms?.occupied || 0}      color="#DC2626" />
        <MetricCard label="Available"      value={data.rooms?.available || 0}     color="#059669" />
        <MetricCard label="Occupancy"      value={`${data.occupancy_pct || 0}%`}  color="#185FA5" />
        <MetricCard label="Arrivals today" value={data.arrivals_today || 0}       color="#D97706" />
        <MetricCard label="Today revenue"  value={fmtCur(data.today_revenue)}     color="#059669" />
        <MetricCard label="Month revenue"  value={fmtCur(data.month_revenue)}     color="#185FA5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Room status chart */}
        <div className="card">
          <div className="text-sm font-medium text-gray-800 mb-3">Room status</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={roomChart} barSize={32}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={22} />
              <Tooltip />
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {roomChart.map((e,i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Arrivals */}
        <div className="card overflow-y-auto max-h-48">
          <div className="text-sm font-medium text-gray-800 mb-3">
            Arrivals ({data.arrivals?.length || 0})
          </div>
          {data.arrivals?.length ? data.arrivals.map(a => (
            <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <div className="text-xs font-medium">{a.first_name} {a.last_name}</div>
                <div className="text-xs text-gray-400">Room {a.room_number} · {a.source}</div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Arriving</span>
            </div>
          )) : <div className="text-xs text-gray-400">No arrivals today</div>}
        </div>

        {/* Departures */}
        <div className="card overflow-y-auto max-h-48">
          <div className="text-sm font-medium text-gray-800 mb-3">
            Departures ({data.departures?.length || 0})
          </div>
          {data.departures?.length ? data.departures.map(d => (
            <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <div className="text-xs font-medium">{d.first_name} {d.last_name}</div>
                <div className="text-xs text-gray-400">Room {d.room_number}</div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Departing</span>
            </div>
          )) : <div className="text-xs text-gray-400">No departures today</div>}
        </div>
      </div>

      {/* Housekeeping summary */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-gray-800">Housekeeping</div>
          <button onClick={() => navigate('/housekeeping')} className="text-xs text-brand-600">View all →</button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(HK_COLORS).map(([k, color]) => (
            <div key={k} className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-xl font-semibold" style={{ color }}>{data.housekeeping?.[k] || 0}</div>
              <div className="text-xs text-gray-400 mt-1 capitalize">{k.replace('_', ' ')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
