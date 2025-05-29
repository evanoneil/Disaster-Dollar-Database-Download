import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
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
  showDateSelection?: boolean; // New prop to control date selection visibility
  showChart?: boolean; // New prop to control chart visibility
  title?: string; // New prop for custom title
  description?: string; // New prop for custom description
  filterSummary?: Array<{
    label: string;
    value: string;
  }>; // New prop for structured filter data
}

const TimeSeriesBrush: React.FC<TimeSeriesBrushProps> = ({
  data,
  dateRange,
  onDateRangeChange,
  showDateSelection = true,
  showChart = true,
  title,
  description,
  filterSummary
}) => {
  // State to track if data is ready to render
  const [isDataReady, setIsDataReady] = useState(false);
  
  // Flag to show/hide brush slider - set to false to hide for now
  const showBrush = false;

  // State for manual date inputs
  const [manualStartYear, setManualStartYear] = useState(dateRange.startYear.toString());
  const [manualStartMonth, setManualStartMonth] = useState(dateRange.startMonth.toString());
  const [manualEndYear, setManualEndYear] = useState(dateRange.endYear.toString());
  const [manualEndMonth, setManualEndMonth] = useState(dateRange.endMonth.toString());

  // Month names for dropdown
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Calculate data range for explanatory text
  const dataRangeInfo = useMemo(() => {
    if (!data || data.length === 0) return null;
    
    const datesWithData = data
      .filter(item => item.incident_start)
      .map(item => new Date(item.incident_start))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (datesWithData.length === 0) return null;
    
    const earliestDate = datesWithData[0];
    const latestDate = datesWithData[datesWithData.length - 1];
    
    return {
      earliest: earliestDate,
      latest: latestDate,
      totalRecords: data.length,
      recordsWithDates: datesWithData.length
    };
  }, [data]);

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

  // Update manual inputs when dateRange prop changes
  useEffect(() => {
    setManualStartYear(dateRange.startYear.toString());
    setManualStartMonth(dateRange.startMonth.toString());
    setManualEndYear(dateRange.endYear.toString());
    setManualEndMonth(dateRange.endMonth.toString());
  }, [dateRange]);

  // Handle manual date input changes
  const handleManualDateChange = () => {
    const startYear = parseInt(manualStartYear) || dateRange.startYear;
    const startMonth = parseInt(manualStartMonth) || dateRange.startMonth;
    const endYear = parseInt(manualEndYear) || dateRange.endYear;
    const endMonth = parseInt(manualEndMonth) || dateRange.endMonth;
    
    // Validate date range
    const startDate = new Date(startYear, startMonth - 1);
    const endDate = new Date(endYear, endMonth - 1);
    
    if (startDate <= endDate) {
      onDateRangeChange({
        startYear,
        startMonth,
        endYear,
        endMonth
      });
    }
  };

  // Generate year options based on available data
  const yearOptions = useMemo(() => {
    if (!dataRangeInfo) return [];
    const startYear = dataRangeInfo.earliest.getFullYear();
    const endYear = dataRangeInfo.latest.getFullYear();
    const years = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }
    return years;
  }, [dataRangeInfo]);

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
      
      const newDateRange = {
        startYear: startDate.getFullYear(),
        startMonth: startDate.getMonth() + 1,
        endYear: endDate.getFullYear(),
        endMonth: endDate.getMonth() + 1
      };
      
      // Only update if the date range has actually changed
      if (
        newDateRange.startYear !== dateRange.startYear ||
        newDateRange.startMonth !== dateRange.startMonth ||
        newDateRange.endYear !== dateRange.endYear ||
        newDateRange.endMonth !== dateRange.endMonth
      ) {
        onDateRangeChange(newDateRange);
      }
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
      <div className="w-full mt-4 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-[#003A63]">Filter Disaster Data</h2>
          <div className="text-sm font-medium text-gray-600">Loading data...</div>
        </div>
        <div className="w-full h-56 flex items-center justify-center bg-gray-50 rounded">
          <p className="text-gray-500">Loading timeline data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-4 mb-8">
      {/* Header and Data Info */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-[#003A63]">{title || "Filter Disaster Data"}</h2>
        </div>
        
        {/* Data Availability Information */}
        {filterSummary ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Current Filters Applied</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {filterSummary.map((filter, index) => (
                <div key={index}>
                  <span className="font-medium text-gray-600">{filter.label}:</span>
                  <p className="text-gray-800">{filter.value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : description ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Current Filters Applied</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Note: Description will be passed as structured data rather than a string */}
              <div dangerouslySetInnerHTML={{ __html: description }} />
            </div>
          </div>
        ) : dataRangeInfo && showDateSelection ? (
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Disaster data is available from{' '}
              <span className="font-medium">
                {format(dataRangeInfo.earliest, 'MMMM yyyy')}
              </span>{' '}
              to{' '}
              <span className="font-medium">
                {format(dataRangeInfo.latest, 'MMMM yyyy')}
              </span>.{' '}
              The database contains{' '}
              <span className="font-medium">{dataRangeInfo.totalRecords.toLocaleString()}</span>{' '}
              disaster records.
            </p>
          </div>
        ) : null}
        
        {/* Manual Date Entry - Styled to match other filters */}
        {showDateSelection && (
          <div className="border rounded-lg mb-4">
            <div className="p-2 border-b flex justify-between items-center bg-gray-50">
              <span className="text-sm font-medium text-[#003A63]">Select Time Frame</span>
              <button
                onClick={handleManualDateChange}
                className="px-2 py-1 text-xs bg-[#00A79D] text-white rounded hover:bg-[#003A63]"
              >
                Apply
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Start Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                  <div className="flex gap-2">
                    <select
                      value={manualStartMonth}
                      onChange={(e) => setManualStartMonth(e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      {months.map((month, index) => (
                        <option key={index + 1} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                    <select
                      value={manualStartYear}
                      onChange={(e) => setManualStartYear(e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      {yearOptions.map(year => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* End Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                  <div className="flex gap-2">
                    <select
                      value={manualEndMonth}
                      onChange={(e) => setManualEndMonth(e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      {months.map((month, index) => (
                        <option key={index + 1} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                    <select
                      value={manualEndYear}
                      onChange={(e) => setManualEndYear(e.target.value)}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      {yearOptions.map(year => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Timeline Chart */}
      {showChart && (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={timeSeriesData}
              margin={{ top: 40, right: 30, left: 0, bottom: 0 }}
              barCategoryGap={1} // Set to 1 for histogram-like appearance
              barGap={0}
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
                fontSize={11} // Smaller font for axis labels
              />
              <YAxis 
                tickFormatter={(value) => value === 0 ? '$0M' : `$${(value / 1000000).toFixed(0)}M`}
                height={50}
                width={70} // Wider for the dollar signs
                fontSize={11} // Smaller font size
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
              <Bar 
                dataKey="totalFunding" 
                fill="url(#colorFunding)"
                stroke="#41B6E6"
                isAnimationActive={false}
              />
              {showBrush && (
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
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default TimeSeriesBrush; 