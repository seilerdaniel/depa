'use client';

import { useMemo } from 'react';
import { useApp } from '@/state/AppProvider';
import { money, formatMonth } from '@/lib/utils';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const COLORS = ['#1f5c45', '#7ecfa8', '#f0b64b', '#ff8a7a', '#79d3a4', '#a49d90'];

export function Dashboard() {
  const { items } = useApp();

  // 1. Datos por Categoría (Solo artículos pendientes de comprar)
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

  // 2. Datos por Mes
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

  return (
    <section className="pt-2 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold tracking-tight text-ink">Dashboard Financiero</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Gráfico de Torta: Categorías */}
        <div className="p-5 border border-line rounded-3xl bg-surface shadow-sm">
          <h3 className="text-sm font-bold text-ink mb-4">Gasto Pendiente por Categoría</h3>
          {categoryData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: any) => money(Number(value))}
                    contentStyle={{ 
                      backgroundColor: 'var(--surface)', 
                      borderColor: 'var(--line)', 
                      borderRadius: '12px', 
                      color: 'var(--ink)',
                      boxShadow: 'var(--shadow)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted text-sm text-center">
              No hay compras pendientes con categoría.
            </div>
          )}
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
                  <Tooltip 
                    formatter={(value: any) => money(Number(value))} 
                    cursor={{ fill: 'var(--surface-2)' }}
                    contentStyle={{ 
                      backgroundColor: 'var(--surface)', 
                      borderColor: 'var(--line)', 
                      borderRadius: '12px', 
                      color: 'var(--ink)',
                      boxShadow: 'var(--shadow)'
                    }}
                  />
                  <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted text-sm text-center">
              No hay meses planificados.
            </div>
          )}
        </div>

      </div>
    </section>
  );
}