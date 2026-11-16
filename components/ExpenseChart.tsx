'use client';

import { useMemo } from 'react';
import { useFinance, usePrefs } from '@/state/AppProvider';
import { money, toArs } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function ExpenseChart() {
  const { accounts, transactions } = useFinance();
  const { prefs } = usePrefs();

  const data = useMemo(() => {
    const now = new Date();
    const currencyOf = new Map(
      accounts.map((account) => [account.id, account.currency ?? 'ARS'] as const),
    );

    const currentMonthTx = transactions.filter(t => {
      const d = new Date(t.date);
      return t.type === 'gasto' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    // Agrupar por categoría. Todo se consolida en pesos para que un gasto en
    // dólares no se sume como si fuera un peso.
    const grouped = currentMonthTx.reduce((acc, t) => {
      const cat = t.category || 'Sin categoría';
      const inArs = toArs(t.amount, currencyOf.get(t.accountId) ?? 'ARS', prefs.usdRate);
      acc[cat] = (acc[cat] || 0) + inArs;
      return acc;
    }, {} as Record<string, number>);

    // Convertir a array para Recharts
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value); // Mayor gasto primero
  }, [accounts, transactions, prefs.usdRate]);

  if (data.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-3xl p-6 shadow-soft flex flex-col items-center justify-center h-[300px]">
        <p className="text-sm text-muted italic text-center">No hay gastos registrados este mes.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-3xl p-6 shadow-soft">
      <h3 className="text-base font-bold text-ink mb-6">Gastos del Mes por Categoría</h3>
      
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Gráfico */}
        <div className="w-full sm:w-1/2 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => money(Number(value ?? 0))}
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Leyenda */}
        <div className="w-full sm:w-1/2 flex flex-col gap-3">
          {data.map((entry, index) => (
            <div key={entry.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-sm font-medium text-ink capitalize">{entry.name}</span>
              </div>
              <span className="text-sm font-bold text-muted tabular-nums">{money(entry.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}