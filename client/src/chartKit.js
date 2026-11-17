// The recharts components the Dashboard draws with, as one module that
// LazyCharts imports dynamically. A dynamic import('recharts') would take the
// whole package namespace and defeat tree-shaking (the charts chunk grew from
// 443 KB to 515 KB that way); named re-exports keep it to what is used.
// Add a component here before using it inside <LazyCharts>.
export {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  PieChart, Pie, Cell, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
