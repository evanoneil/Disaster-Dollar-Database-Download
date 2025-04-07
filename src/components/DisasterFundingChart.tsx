"use client";

import * as React from 'react';
import * as Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

interface StormData {
  name: string;
  incidentNumber: number;
  ihpTotal: number;
  paTotal: number;
  cdbgDrTotal: number;
  totalFunding: number;
  date?: string; // Optional date field
}

interface DisasterFundingChartProps {
  data: StormData[];
  title?: string;
  subtitle?: string;
  dateRange?: string; // New prop for date range
}

const DisasterFundingChart: React.FC<DisasterFundingChartProps> = ({ 
  data, 
  title = '',
  subtitle = '',
  dateRange
}) => {
  // Format numbers to human-readable form (e.g., $1.2B)
  const formatNumber = (value: number) => {
    if (value >= 1e9) {
      return `$${(value / 1e9).toFixed(1)}B`;
    } else if (value >= 1e6) {
      return `$${(value / 1e6).toFixed(1)}M`;
    } else if (value >= 1e3) {
      return `$${(value / 1e3).toFixed(1)}K`;
    }
    return `$${value}`;
  };

  // Sort and take top 10 events by funding amount
  const sortedData = [...data]
    .sort((a, b) => b.totalFunding - a.totalFunding)
    .slice(0, 10); // Only take top 10

  // Extract data for series
  const categories = sortedData.map(d => {
    // Simplify and shorten for better display
    let name = d.name;
    if (name.length > 35) {
      name = name.substring(0, 32) + '...';
    }
    return name;
  });
  
  const femaIHPData = sortedData.map(d => d.ihpTotal);
  const femaPAData = sortedData.map(d => d.paTotal);
  const hudCDBGData = sortedData.map(d => d.cdbgDrTotal);

  // Calculate an appropriate chart height based on number of items
  const calculateChartHeight = () => {
    const baseHeight = 400; // Minimum height
    const heightPerItem = 40; // Add this much height per item
    return Math.max(baseHeight, 300 + sortedData.length * heightPerItem);
  };

  // Create the subtitle with date range
  const formattedSubtitle = subtitle || `Top 10 disasters by funding amount, ${dateRange}`;

  // Calculate current year for reference
  const currentYear = new Date().getFullYear();
  const defaultSubtitle = `Top 10 disasters by funding amount, ${currentYear-9}-${currentYear}`;

  const options: Highcharts.Options = {
    chart: {
      type: 'bar',
      height: calculateChartHeight(),
      backgroundColor: '#ffffff',
      spacingTop: 40,
      spacingBottom: 40,
      spacingLeft: 10,
      spacingRight: 10,
      style: {
        fontFamily: '"Source Sans 3", "Source Sans", sans-serif',
        fontWeight: 'bold'
      }
    },
    title: {
      text: title,
      style: {
        fontSize: '20px',
        fontWeight: 'bold',
        color: '#003366',
        fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
      },
      margin: 30
    },
    subtitle: {
      text: "Top 10 disasters by funding amount, 2016-2025",
      style: {
        fontSize: '14px',
        fontWeight: 'bold',
        color: '#555555',
        fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
      }
    },
    xAxis: {
      categories: categories,
      labels: {
        style: {
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#333333',
          fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
        },
        y: 3 // Adjust vertical position
      },
      lineWidth: 0, // Remove axis line
      tickLength: 0 // Remove tick marks
    },
    yAxis: {
      min: 0,
      title: {
        text: null
      },
      labels: {
        formatter: function() {
          return typeof this.value === 'number' ? formatNumber(this.value) : '';
        },
        style: {
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#333333',
          fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
        }
      },
      gridLineWidth: 1,
      gridLineColor: '#e6e6e6'
    },
    plotOptions: {
      bar: {
        stacking: 'normal',
        groupPadding: 0.15,
        pointPadding: 0.05,
        borderWidth: 0
      },
      series: {
        dataLabels: {
          enabled: true,
          formatter: function() {
            return this.y && this.y > 0 ? formatNumber(this.y) : '';
          },
          style: {
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#ffffff',
            textOutline: '1px contrast',
            fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
          },
          allowOverlap: false
        },
        events: {
          // Disable all interactions
          legendItemClick: function() { return false; }
        },
        states: {
          hover: { enabled: false },
          inactive: { opacity: 1 }
        },
        enableMouseTracking: false
      }
    },
    legend: {
      enabled: true,
      align: 'center',
      verticalAlign: 'bottom',
      layout: 'horizontal',
      padding: 20,
      margin: 25,
      itemStyle: {
        fontSize: '12px',
        fontWeight: 'bold',
        color: '#333333',
        fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
      },
      itemDistance: 20
    },
    series: [{
      name: 'HUD CDBG-DR',
      data: hudCDBGData,
      color: '#89684F',
      type: 'bar'
    }, {
      name: 'FEMA Public Assistance',
      data: femaPAData,
      color: '#41B6E6',
      type: 'bar'
    }, {
      name: 'FEMA Individuals and Households Program',
      data: femaIHPData,
      color: '#2171b5',
      type: 'bar'
    }],
    credits: {
      enabled: false
    },
    tooltip: {
      enabled: false
    },
    responsive: {
      rules: [{
        condition: {
          maxWidth: 500
        },
        chartOptions: {
          chart: {
            spacingLeft: 5,
            spacingRight: 5
          },
          legend: {
            itemDistance: 10,
            symbolHeight: 8,
            symbolWidth: 8,
            itemStyle: {
              fontWeight: 'bold'
            }
          }
        }
      }]
    },
    exporting: {
      enabled: false
    }
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      {sortedData.length > 0 ? (
        <HighchartsReact highcharts={Highcharts} options={options} />
      ) : (
        <div className="p-6 text-center text-gray-500">
          No major disasters with significant funding found.
        </div>
      )}
    </div>
  );
};

export default DisasterFundingChart; 