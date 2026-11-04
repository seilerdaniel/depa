'use client';

import { useMemo } from 'react';
import { useData } from '@/state/AppProvider';
import { money, formatMonth } from '@/lib/utils';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const COLORS = ['#1f5c45', '#7ecfa8', '#f0b64b', '#ff8a7a', '#79d3a4', '#a49d90'];
const PRIO_COLORS = ['#ff8a7a', '#f0b64b', '#79d3a4']; // Urgente, Media, Baja

function Icon({ name, size = 24 }: { name: string; size?: number }) {
  if (name === 'finance') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 7.5h18" />
        <path d="M5 7.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5" />
        <path d="M8 7.5V5.7A1.7 1.7 0 0 1 9.7 4h4.6A1.7 1.7 0 0 1 16 5.7v1.8" />
        <path d="M12 11.5v5" />
        <path d="M9.5 14.5h5" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

export function Dashboard() {
  const { items } = useData();

  // 1. KPIs
  const kpis = useMemo(() => {
    let currentMonthInstallments = 0;
    let totalDebt = 0; // Cuotas restantes
    const currentMonthStr = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    for (const it of items) {
      if (it.wishlist || it.bought) continue;
      
      if (it.installments && it.installments.count > 0) {
        totalDebt += (it.installments.count * it.installments.amount);
        // Si el mes planificado es el actual (o no tiene mes, asumimos que aplica)
        if (it.purchaseMonth === currentMonthStr || !it.purchaseMonth) {
           currentMonthInstallments += it.installments.amount;
        }
      }
    }
    return { currentMonthInstallments, totalDebt };
  }, [items]);

  // 2. Datos por Categoría
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.wishlist || it.bought) continue;
      map.set(it.category, (map.get(it.category) || 0) + it.price);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [items]);

  // 3. Datos por Prioridad
  const priorityData = useMemo(() => {
    const map = { urgente: 0, media: 0, baja: 0 };
    for (const it of items) {
      if (it.wishlist || it.bought) continue;
      map[it.priority] += it.price;
    }
    return [
      { name: 'Urgente', value: map.urgente },
      { name: 'Media', value: map.media },
      { name: 'Baja', value: map.baja },
    ].filter(d => d.value > 0);
  }, [items]);

  // 4. Datos por Mes
  const monthData = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.wishlist || it.bought || !it.purchaseMonth) continue;
      map.set(it.purchaseMonth, (map.get(it.purchaseMonth) || 0) + it.price);
    }
    return Array.from(map.entries())
      .map(([month, value]) => ({ month: formatMonth(month), value }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [items]);

  const tooltipStyle = { backgroundColor: 'var(--surface)', borderColor: 'var(--line)', borderRadius: '12px', color: 'var(--ink)', boxShadow: 'var(--shadow)' };

  return (
    <section className="pt-2 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold tracking-tight text-ink">Dashboard Financiero</h2>
      </div>

      {/* TARJETAS KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface p-5 rounded-3xl border border-line shadow-sm flex items-center gap-4">
          <div className="p-3 bg-accent-soft text-accent-ink rounded-2xl"><Icon name="finance" size={24} /></div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider">Cuotas a pagar este mes</p>
            <p className="text-2xl font-bold text-ink">{money(kpis.currentMonthInstallments)}</p>
          </div>
        </div>
        <div className="bg-surface p-5 rounded-3xl border border-line shadow-sm flex items-center gap-4">
          <div className="p-3 bg-danger-soft text-danger rounded-2xl"><Icon name="finance" size={24} /></div>
          <div>
            <p className="text-xs font-bold text-muted uppercase tracking-wider">Deuda total (Cuotas)</p>
            <p className="text-2xl font-bold text-ink">{money(kpis.totalDebt)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Gráfico de Torta: Categorías */}
        <div className="p-5 border border-line rounded-3xl bg-surface shadow-sm">
          <h3 className="text-sm font-bold text-ink mb-4">Gasto Pendiente por Categoría</h3>
          {categoryData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => money(Number(v))} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-muted text-sm text-center py-10">Sin datos.</p>}
        </div>

        {/* Gráfico de Barras: Meses */}
        <div className="p-5 border border-line rounded-3xl bg-surface shadow-sm">
          <h3 className="text-sm font-bold text-ink mb-4">Planificación por Mes</h3>
          {monthData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Number(v)/1000}k`} />
                  <Tooltip formatter={(v: any) => money(Number(v))} cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-muted text-sm text-center py-10">Sin meses planificados.</p>}
        </div>

      </div>
    </section>
  );
}