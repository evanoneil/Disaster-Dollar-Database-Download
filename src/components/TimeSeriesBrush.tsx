import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  ReferenceArea,
  Text
} from 'recharts';
import { format, parseISO } from 'date-fns';
import _ from 'lodash';

interface TimeSeriesBrushProps {
  data: any[];
  dateRange: {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  };
  onDateRangeChange: (newDateRange: {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
  }) => void;
}

const TimeSeriesBrush: React.FC<TimeSeriesBrushProps> = ({
  data,
  dateRange,
  onDateRangeChange
}) => {
  // State to track if data is ready to render
  const [isDataReady, setIsDataReady] = useState(false);

  // Aggregate data by month
  const timeSeriesData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Group data by month and sum funding
    const monthlyData = _.chain(data)
      .filter(item => item.incident_start && (item.ihp_total || item.pa_total || item.cdbg_dr_allocation))
      .groupBy(item => {
        const date = new Date(item.incident_start);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      })
      .map((items, monthKey) => {
        const [year, month] = monthKey.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        
        // Sum up all funding types
        const totalFunding = items.reduce((sum, item) => {
          return sum + 
            (Number(item.ihp_total) || 0) + 
            (Number(item.pa_total) || 0) + 
            (Number(item.cdbg_dr_allocation) || 0);
        }, 0);
        
        return {
          date: date.toISOString(),
          totalFunding,
          count: items.length,
          year: year,
          month: month
        };
      })
      .sortBy('date')
      .value();

    return monthlyData;
  }, [data]);

  // Set data ready state when timeSeriesData is populated
  useEffect(() => {
    setIsDataReady(timeSeriesData.length > 0);
  }, [timeSeriesData]);

  // Convert the current date range to dates for the brush
  const startDate = useMemo(() => {
    try {
      return new Date(dateRange.startYear, dateRange.startMonth - 1, 1).toISOString();
    } catch (e) {
      return new Date().toISOString(); // Fallback to current date
    }
  }, [dateRange.startYear, dateRange.startMonth]);
  
  const endDate = useMemo(() => {
    try {
      return new Date(dateRange.endYear, dateRange.endMonth, 0).toISOString();
    } catch (e) {
      return new Date().toISOString(); // Fallback to current date
    }
  }, [dateRange.endYear, dateRange.endMonth]);

  // Find indices for the brush
  const startIndex = useMemo(() => {
    if (!timeSeriesData.length) return 0;
    const index = timeSeriesData.findIndex(item => item.date >= startDate);
    return index >= 0 ? index : 0;
  }, [timeSeriesData, startDate]);
  
  const endIndex = useMemo(() => {
    if (!timeSeriesData.length) return 0;
    const index = timeSeriesData.findIndex(item => item.date > endDate);
    return index >= 0 ? index - 1 : timeSeriesData.length - 1;
  }, [timeSeriesData, endDate]);

  // Selected date range for display
  const selectedRange = useMemo(() => {
    if (!isDataReady || timeSeriesData.length === 0) return "No data";
    
    const startItem = timeSeriesData[startIndex];
    const endItem = timeSeriesData[endIndex >= 0 ? endIndex : timeSeriesData.length - 1];
    
    if (!startItem || !endItem) return "No data";
    
    try {
      const startDateFormatted = format(parseISO(startItem.date), 'MMM yyyy');
      const endDateFormatted = format(parseISO(endItem.date), 'MMM yyyy');
      return `${startDateFormatted} - ${endDateFormatted}`;
    } catch (e) {
      return "Invalid date range";
    }
  }, [timeSeriesData, startIndex, endIndex, isDataReady]);

  // Handle brush change
  const handleBrushChange = (brushData: any) => {
    if (!timeSeriesData.length) return;
    if (typeof brushData.startIndex !== 'number' || typeof brushData.endIndex !== 'number') return;
    
    const startItem = timeSeriesData[brushData.startIndex];
    const endItem = timeSeriesData[brushData.endIndex];
    
    if (!startItem || !endItem) return;
    
    try {
      const startDate = new Date(startItem.date);
      const endDate = new Date(endItem.date);
      
      onDateRangeChange({
        startYear: startDate.getFullYear(),
        startMonth: startDate.getMonth() + 1,
        endYear: endDate.getFullYear(),
        endMonth: endDate.getMonth() + 1
      });
    } catch (e) {
      console.error("Error updating date range:", e);
    }
  };

  // Format tick labels
  const formatXAxis = (tickItem: string) => {
    try {
      const date = parseISO(tickItem);
      // Only show year and month for certain intervals to avoid crowding
      if (date.getMonth() === 0 || timeSeriesData.length < 24) {
        return format(date, 'MMM yyyy');
      }
      return format(date, 'MMM');
    } catch (e) {
      return "";
    }
  };

  // Format tooltip labels
  const formatTooltip = (value: number, name: string) => {
    if (name === 'totalFunding') {
      return [`$${value.toLocaleString()}`, 'Total Funding'];
    }
    return [value, name];
  };

  // If data is not ready, show a loading state
  if (!isDataReady || timeSeriesData.length === 0) {
    return (
      <div className="w-full h-56 mt-4 mb-8">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-[#003A63]">Select Time Frame</h2>
          <div className="text-sm font-medium text-gray-600">Loading data...</div>
        </div>
        <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded">
          <p className="text-gray-500">Loading timeline data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-56 mt-4 mb-8">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold text-[#003A63]">Select Time Frame</h2>
        <div className="text-sm font-medium text-gray-600">
          Selected: {selectedRange}
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={timeSeriesData}
          margin={{ top: 40, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorFunding" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#41B6E6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#41B6E6" stopOpacity={0.2}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="date" 
            tickFormatter={formatXAxis}
            type="category"
            allowDuplicatedCategory={false}
            height={30}
          />
          <YAxis 
            tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`}
            height={50}
            width={60}
          />
          <Tooltip 
            formatter={formatTooltip}
            labelFormatter={(label) => {
              try {
                return format(parseISO(label as string), 'MMMM yyyy');
              } catch (e) {
                return "Unknown date";
              }
            }}
          />
          {/* Only render text if we have valid data */}
          {selectedRange !== "No data" && (
            <text
              x={String(50) + "%"}
              y="20"
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-sm font-medium"
              fill="#003A63"
            >
              {selectedRange}
            </text>
          )}
          <Area 
            type="monotone" 
            dataKey="totalFunding" 
            stroke="#41B6E6" 
            fill="url(#colorFunding)"
            fillOpacity={0.8}
            isAnimationActive={false}
          />
          <Brush 
            dataKey="date"
            height={30}
            stroke="#003A63"
            y={0}
            startIndex={startIndex}
            endIndex={endIndex}
            onChange={handleBrushChange}
            tickFormatter={formatXAxis}
            fill="#f5f5f5"
            fillOpacity={0.5}
            travellerWidth={10}
            alwaysShowText={true}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TimeSeriesBrush; 