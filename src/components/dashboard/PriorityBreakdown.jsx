import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PRIORITY_META } from '../../data/mockData';
import { useTheme } from '../../context/ThemeContext';
import { chartTooltipStyle, chartCursorFill } from '../../utils/chartTheme';

const colorHex = {
  low: '#4E8D7C',
  medium: '#D9A441',
  high: '#E8604C',
};

/**
 * Horizontal bar chart summarizing open (non-done) tasks by priority level.
 * @param {{ tasks: import('../../types').Task[] }} props
 */
export default function PriorityBreakdown({ tasks }) {
  const { theme } = useTheme();
  const open = tasks.filter((t) => t.status !== 'done');
  const data = ['high', 'medium', 'low'].map((priority) => ({
    priority: PRIORITY_META[priority].label,
    key: priority,
    count: open.filter((t) => t.priority === priority).length,
  }));

  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl p-5 shadow-soft h-full">
      <h3 className="font-display font-semibold text-fluid-lg text-ink-900 dark:text-white mb-1">
        Priority breakdown
      </h3>
      <p className="text-fluid-xs text-ink-500 mb-4">Open tasks by priority level</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="priority"
            width={70}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'currentColor', fontSize: 13 }}
            className="text-ink-700 dark:text-ink-300"
          />
          <Tooltip cursor={{ fill: chartCursorFill(theme) }} contentStyle={chartTooltipStyle(theme)} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={22}>
            {data.map((d) => (
              <Cell key={d.key} fill={colorHex[d.key]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
