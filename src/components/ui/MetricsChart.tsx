import React from 'react';
import { 
  BarChart, Bar, 
  PieChart, Pie, Cell, 
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer 
} from 'recharts';

export interface MetricData {
  name: string;
  value: number;
}

interface DivisionData {
  division: string;
  technicians: number;
  vehicles: number;
  equipment: number;
}

interface MetricsChartProps {
  type: 'bar' | 'pie' | 'line' | 'divisions';
  data: MetricData[] | DivisionData[];
  title: string;
  colors?: string[];
  height?: number;
}

export const MetricsChart: React.FC<MetricsChartProps> = ({ 
  type, 
  data, 
  title,
  colors = ['#f26722', '#8D5F3D', '#FFB74D', '#FF8A65', '#FFD54F'],
  height = 300
}) => {
  
  // Basic validation to avoid rendering errors
  if (!data || data.length === 0) {
    return <div className="flex justify-center items-center h-[200px] text-gray-400">No data available</div>;
  }

  // Custom label function for pie chart with better formatting
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 1.2;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="#374151" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize="12"
        fontWeight="500"
      >
        {`${name}: ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Render different chart types based on props
  switch (type) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data as MetricData[]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill={colors[0]} name={title}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
      
    case 'pie':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart margin={{ top: 20, right: 60, bottom: 20, left: 60 }}>
            <Pie
              data={data as MetricData[]}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={Math.min(height * 0.25, 100)}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value, name) => [`${value}`, name]}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              iconType="circle"
              wrapperStyle={{
                fontSize: '12px',
                paddingTop: '10px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      );
      
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={data as MetricData[]}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke={colors[0]} activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      );
      
    case 'divisions': {
      const divisionData = data as DivisionData[];
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={divisionData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="division" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="technicians" fill={colors[0]} name="Technicians" />
            <Bar dataKey="vehicles" fill={colors[1]} name="Vehicles" />
            <Bar dataKey="equipment" fill={colors[2]} name="Equipment" />
          </BarChart>
        </ResponsiveContainer>
      );
    }
      
    default:
      return <div>Invalid chart type specified</div>;
  }
};

export default MetricsChart; 