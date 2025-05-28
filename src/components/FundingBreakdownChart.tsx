"use client";

import * as React from 'react';
import * as Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

interface FundingData {
  name: string;
  amount: number;
  color: string;
}

interface FundingBreakdownChartProps {
  ihpTotal: number;
  paTotal: number;
  cdbgTotal: number;
  title?: string;
}

const FundingBreakdownChart: React.FC<FundingBreakdownChartProps> = ({ 
  ihpTotal,
  paTotal,
  cdbgTotal,
  title = "Funding Breakdown by Source"
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

  // Prepare data
  const fundingData: FundingData[] = [
    {
      name: 'FEMA Individual & Household Program',
      amount: ihpTotal,
      color: '#2171b5'
    },
    {
      name: 'FEMA Public Assistance',
      amount: paTotal,
      color: '#41B6E6'
    },
    {
      name: 'HUD CDBG-DR',
      amount: cdbgTotal,
      color: '#89684F'
    }
  ].filter(item => item.amount > 0); // Only show funding sources with actual amounts

  const totalFunding = ihpTotal + paTotal + cdbgTotal;

  // Calculate percentages
  const dataWithPercentages = fundingData.map(item => ({
    ...item,
    percentage: totalFunding > 0 ? ((item.amount / totalFunding) * 100) : 0
  }));

  const options: Highcharts.Options = {
    chart: {
      type: 'bar',
      height: 300,
      backgroundColor: '#ffffff',
      spacingTop: 20,
      spacingBottom: 20,
      spacingLeft: 10,
      spacingRight: 10,
      style: {
        fontFamily: '"Source Sans 3", "Source Sans", sans-serif',
        fontWeight: 'bold'
      }
    },
    title: {
      text: '',
      style: {
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#003366',
        fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
      }
    },
    xAxis: {
      categories: dataWithPercentages.map(d => d.name),
      labels: {
        style: {
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#333333',
          fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
        }
      },
      lineWidth: 0,
      tickLength: 0
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
        groupPadding: 0.1,
        pointPadding: 0.05,
        borderWidth: 0
      },
      series: {
        dataLabels: {
          enabled: true,
          formatter: function() {
            return formatNumber(this.y || 0);
          },
          style: {
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#ffffff',
            textOutline: '1px contrast',
            fontFamily: '"Source Sans 3", "Source Sans", sans-serif'
          },
          allowOverlap: false
        },
        events: {
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
      enabled: false
    },
    series: [{
      name: 'Funding Amount',
      data: dataWithPercentages.map((d, index) => ({
        y: d.amount,
        color: d.color,
        name: d.name
      })),
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
      {totalFunding > 0 ? (
        <HighchartsReact highcharts={Highcharts} options={options} />
      ) : (
        <div className="p-6 text-center text-gray-500">
          No funding data available.
        </div>
      )}
    </div>
  );
};

export default FundingBreakdownChart; 