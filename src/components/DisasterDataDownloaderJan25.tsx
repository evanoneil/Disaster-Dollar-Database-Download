"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import _ from 'lodash';
import { Download } from 'lucide-react';
import TimeSeriesBrush from './TimeSeriesBrush';
import DisasterMap from './DisasterMap';

interface DisasterData {
  incident_start: string;
  incident_type: string;
  state: string;
  event: string;
  ihp_total: number;
  pa_total: number;
  cdbg_dr_allocation: number;
  sba_total_approved_loan_amount: number;
  incident_number: number;
  declaration_date: string;
  declaration_url: string;
  // ... add other fields as needed
}

const DisasterDataDownloaderJan25 = () => {
  const [data, setData] = useState<DisasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startYear: 2015,
    startMonth: 1,
    endYear: 2025,
    endMonth: 10,
  });
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedDisasterTypes, setSelectedDisasterTypes] = useState<string[]>([]);
  const [selectedFundingTypes, setSelectedFundingTypes] = useState<string[]>(['ihp', 'pa', 'cdbg_dr_allocation', 'sba_total_approved_loan_amount']);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<string>('incident_start');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // State and territory mappings
  const stateNames = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DC': 'District of Columbia', 'DE': 'Delaware', 
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 
    'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 
    'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York', 
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma', 
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
  };

  // Known territories for grouping
  const territories = ['PR', 'GU', 'VI', 'MP', 'AS', 'FM', 'MH', 'PW'];
  const [includesTerritories, setIncludesTerritories] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/data/Jan-25/disaster_dollar_database_2025_02_05.csv');
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          complete: (results) => {
            console.log('First row of data:', results.data[0]);
            setData(results.data as DisasterData[]);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      const uniqueDisasterTypes = _.uniq(data.map(row => row.incident_type)).filter(Boolean).sort();
      setSelectedDisasterTypes(uniqueDisasterTypes);
    }
  }, [loading, data]);

  // Memoize the filtered data based on filters
  const filteredData = useMemo(() => {
    if (loading) return [];
    
    return data.filter(row => {
      if (!row.incident_start) return false;
      
      const incidentDate = new Date(row.incident_start);
      const startDate = new Date(dateRange.startYear, dateRange.startMonth - 1, 1);
      const endDate = new Date(dateRange.endYear, dateRange.endMonth, 0);
      
      const dateMatch = incidentDate >= startDate && incidentDate <= endDate;
      
      // Handle territories as a special case
      let stateMatch = false;
      if (selectedStates.length === 0) {
        stateMatch = true; // No states selected means all states match
      } else if (territories.includes(row.state) && includesTerritories) {
        stateMatch = true; // Include territories if the territories option is selected
      } else {
        stateMatch = selectedStates.includes(row.state); // Normal state matching
      }
      
      const typeMatch = selectedDisasterTypes.length === 0 || selectedDisasterTypes.includes(row.incident_type);
      
      // Add funding type matching
      let fundingMatch = true;
      if (selectedFundingTypes.length > 0) {
        // Convert funding values to numbers and check if any selected funding type has a value > 0
        fundingMatch = false;
        
        if (selectedFundingTypes.includes('ihp')) {
          const ihpValue = typeof row.ihp_total === 'number' ? row.ihp_total : 
                       (typeof row.ihp_total === 'string' ? parseFloat(row.ihp_total) || 0 : 0);
          if (ihpValue > 0) fundingMatch = true;
        }
        
        if (!fundingMatch && selectedFundingTypes.includes('pa')) {
          const paValue = typeof row.pa_total === 'number' ? row.pa_total : 
                      (typeof row.pa_total === 'string' ? parseFloat(row.pa_total) || 0 : 0);
          if (paValue > 0) fundingMatch = true;
        }
        
        if (!fundingMatch && selectedFundingTypes.includes('cdbg_dr_allocation')) {
          const cdbgValue = typeof row.cdbg_dr_allocation === 'number' ? row.cdbg_dr_allocation :
                          (typeof row.cdbg_dr_allocation === 'string' ? parseFloat(row.cdbg_dr_allocation) || 0 : 0);
          if (cdbgValue > 0) fundingMatch = true;
        }

        if (!fundingMatch && selectedFundingTypes.includes('sba_total_approved_loan_amount')) {
          const sbaValue = typeof row.sba_total_approved_loan_amount === 'number' ? row.sba_total_approved_loan_amount :
                          (typeof row.sba_total_approved_loan_amount === 'string' ? parseFloat(row.sba_total_approved_loan_amount) || 0 : 0);
          if (sbaValue > 0) fundingMatch = true;
        }
      }

      return dateMatch && stateMatch && typeMatch && fundingMatch;
    });
  }, [dateRange, selectedStates, selectedDisasterTypes, selectedFundingTypes, data, loading, includesTerritories, territories]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange, selectedStates, selectedDisasterTypes, selectedFundingTypes]);

  const handleDownload = () => {
    // Check if there's any data to download
    if (filteredData.length === 0 || selectedFundingTypes.length === 0) {
      alert('No data to download. Please select at least one funding type and ensure data matches your filters.');
      return;
    }

    // Use the already filtered data directly since we've incorporated funding type filtering
    const processedData = filteredData.map(row => ({
      ...row,
      state: stateNames[row.state as keyof typeof stateNames] || row.state
    }));

    const csv = Papa.unparse(processedData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'disaster_data_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Sorting function
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  // Sort the filtered data
  const sortedData = useMemo(() => {
    const sorted = [...filteredData].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortColumn) {
        case 'incident_start':
          aValue = new Date(a.incident_start);
          bValue = new Date(b.incident_start);
          break;
        case 'state':
          aValue = stateNames[a.state as keyof typeof stateNames] || a.state;
          bValue = stateNames[b.state as keyof typeof stateNames] || b.state;
          break;
        case 'incident_type':
          aValue = a.incident_type;
          bValue = b.incident_type;
          break;
        case 'event':
          aValue = a.event;
          bValue = b.event;
          break;
        case 'incident_number':
          aValue = a.incident_number;
          bValue = b.incident_number;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }, [filteredData, sortColumn, sortDirection, stateNames]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = sortedData.slice(startIndex, endIndex);

  if (loading) {
    return <div className="text-center p-4">Loading data...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 text-[#003A63]">Disaster Dollar Database Data Download Delivery Device</h1>
        <p className="text-[#89684F]">
          Filter and download disaster assistance data by date range, location, and disaster type.
        </p>
      </div>

      <div className="space-y-6">
        {/* Time Series Date Selection Only */}
        {!loading && (
          <TimeSeriesBrush 
            data={data} 
            dateRange={dateRange} 
            onDateRangeChange={setDateRange}
            showDateSelection={true}
            showChart={false}
          />
        )}
        
        {/* Filter Sections - Moved right below TimeSeriesBrush */}
        <div className="flex flex-col md:flex-row md:space-x-4">
          {/* Location Selection */}
          <div className="md:w-1/3 mb-6 md:mb-0">
            <div className="border rounded-lg h-[320px] flex flex-col">
              <div className="p-2 border-b flex justify-between items-center bg-gray-50">
                <span className="text-sm font-medium text-[#003A63]">Filter by Location</span>
                <div className="space-x-2">
                  <button
                    onClick={() => {
                      const allStateAbbrs = Object.keys(stateNames);
                      setSelectedStates(allStateAbbrs);
                      setIncludesTerritories(true);
                    }}
                    className="px-2 py-1 text-xs bg-[#00A79D] text-white rounded hover:bg-[#003A63]"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => {
                      setSelectedStates([]);
                      setIncludesTerritories(false);
                    }}
                    className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-scroll p-4 relative scrollbar-custom">
                {/* Scroll indicator for more content */}
                <div className="absolute top-2 right-2 text-xs text-gray-400 pointer-events-none">
                  Scroll for more ↓
                </div>
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3 pt-4">
                  {Object.entries(stateNames).map(([abbr, name]) => (
                    <label key={abbr} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedStates.includes(abbr)}
                        onChange={(e) => {
                          setSelectedStates(
                            e.target.checked
                              ? [...selectedStates, abbr]
                              : selectedStates.filter(s => s !== abbr)
                          );
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{name}</span>
                    </label>
                  ))}
                  
                  {/* Add Territories as a special option at the end */}
                  <label className="flex items-center space-x-2 bg-gray-100 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={includesTerritories}
                      onChange={(e) => {
                        setIncludesTerritories(e.target.checked);
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium">U.S. Territories</span>
                  </label>
                </div>
                {/* Bottom fade gradient to indicate more content */}
                <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
              </div>
            </div>
          </div>

          {/* Disaster Type Selection */}
          <div className="md:w-1/3 mb-6 md:mb-0">
            <div className="border rounded-lg h-[320px] flex flex-col">
              <div className="p-2 border-b flex justify-between items-center bg-gray-50">
                <span className="text-sm font-medium text-[#003A63]">Filter by Disaster Type</span>
                <div className="space-x-2">
                  <button
                    onClick={() => {
                      const allDisasterTypes = _.uniq(data.map(row => row.incident_type)).filter(Boolean).sort();
                      setSelectedDisasterTypes(allDisasterTypes);
                    }}
                    className="px-2 py-1 text-xs bg-[#00A79D] text-white rounded hover:bg-[#003A63]"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedDisasterTypes([])}
                    className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-scroll p-4 relative scrollbar-custom">
                {/* Scroll indicator for more content */}
                <div className="absolute top-2 right-2 text-xs text-gray-400 pointer-events-none">
                  Scroll for more ↓
                </div>
                <div className="grid grid-cols-1 md:grid-cols-1 gap-3 pt-4">
                  {_.uniq(data.map(row => row.incident_type)).filter(Boolean).sort().map(type => (
                    <label key={type} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedDisasterTypes.includes(type)}
                        onChange={(e) => {
                          setSelectedDisasterTypes(
                            e.target.checked
                              ? [...selectedDisasterTypes, type]
                              : selectedDisasterTypes.filter(t => t !== type)
                          );
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{type}</span>
                    </label>
                  ))}
                </div>
                {/* Bottom fade gradient to indicate more content */}
                <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
              </div>
            </div>
          </div>
          
          {/* Funding Type Selection */}
          <div className="md:w-1/3">
            <div className="border rounded-lg h-[320px] flex flex-col">
              <div className="p-2 border-b flex justify-between items-center bg-gray-50">
                <span className="text-sm font-medium text-[#003A63]">Filter by Funding Type</span>
                <div className="space-x-2">
                  <button
                    onClick={() => setSelectedFundingTypes(['ihp', 'pa', 'cdbg_dr_allocation', 'sba_total_approved_loan_amount'])}
                    className="px-2 py-1 text-xs bg-[#00A79D] text-white rounded hover:bg-[#003A63]"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedFundingTypes([])}
                    className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col space-y-4">
                  <label className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedFundingTypes.includes('ihp')}
                      onChange={(e) => {
                        setSelectedFundingTypes(
                          e.target.checked
                            ? [...selectedFundingTypes, 'ihp']
                            : selectedFundingTypes.filter(t => t !== 'ihp')
                        );
                      }}
                      className="rounded border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium">FEMA Individual & Household Program</span>
                      <p className="text-xs text-gray-500 mt-1">FEMA assistance for individuals and families</p>
                    </div>
                  </label>
                  <label className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedFundingTypes.includes('pa')}
                      onChange={(e) => {
                        setSelectedFundingTypes(
                          e.target.checked
                            ? [...selectedFundingTypes, 'pa']
                            : selectedFundingTypes.filter(t => t !== 'pa')
                        );
                      }}
                      className="rounded border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium">FEMA Public Assistance</span>
                      <p className="text-xs text-gray-500 mt-1">Funding to repair infrastructure and public facilities</p>
                    </div>
                  </label>
                  <label className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedFundingTypes.includes('cdbg_dr_allocation')}
                      onChange={(e) => {
                        setSelectedFundingTypes(
                          e.target.checked
                            ? [...selectedFundingTypes, 'cdbg_dr_allocation']
                            : selectedFundingTypes.filter(t => t !== 'cdbg_dr_allocation')
                        );
                      }}
                      className="rounded border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium">HUD CDBG-DR</span>
                      <p className="text-xs text-gray-500 mt-1">Community Development Block Grant Disaster Recovery</p>
                    </div>
                  </label>
                  <label className="flex items-center space-x-2 p-2 border rounded-md hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedFundingTypes.includes('sba_total_approved_loan_amount')}
                      onChange={(e) => {
                        setSelectedFundingTypes(
                          e.target.checked
                            ? [...selectedFundingTypes, 'sba_total_approved_loan_amount']
                            : selectedFundingTypes.filter(t => t !== 'sba_total_approved_loan_amount')
                        );
                      }}
                      className="rounded border-gray-300"
                    />
                    <div>
                      <span className="text-sm font-medium">SBA Disaster Loans</span>
                      <p className="text-xs text-gray-500 mt-1">Small Business Administration Approved Disaster Loan Amount</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Timeline Chart - Moved below other filters */}
        {!loading && (
          <TimeSeriesBrush 
            data={filteredData}
            dateRange={dateRange} 
            onDateRangeChange={setDateRange}
            showDateSelection={false}
            showChart={true}
            title="Disaster Funding Overview"
            filterSummary={[
              {
                label: "Date Range",
                value: `${months[dateRange.startMonth - 1]} ${dateRange.startYear} - ${months[dateRange.endMonth - 1]} ${dateRange.endYear}`
              },
              {
                label: "Locations",
                value: selectedStates.length === 0 && !includesTerritories ? 'All states' : 
                  selectedStates.length === Object.keys(stateNames).length && includesTerritories ? 'All states & territories' :
                  selectedStates.length === 0 && includesTerritories ? 'U.S. Territories only' :
                  selectedStates.length <= 3 ? 
                    selectedStates.map(abbr => stateNames[abbr as keyof typeof stateNames]).join(', ') + 
                    (includesTerritories ? ' + Territories' : '') :
                    `${selectedStates.length} states selected` + (includesTerritories ? ' + Territories' : '')
              },
              {
                label: "Disaster Types",
                value: selectedDisasterTypes.length === 0 ? 'All types' :
                  selectedDisasterTypes.length <= 2 ? selectedDisasterTypes.join(', ') :
                  `${selectedDisasterTypes.length} types selected`
              },
              {
                label: "Funding Types",
                value: selectedFundingTypes.length === 0 ? 'None selected' :
                  selectedFundingTypes.length === 4 ? 'All funding types' :
                  selectedFundingTypes.map(type => {
                    switch(type) {
                      case 'ihp': return 'IHP';
                      case 'pa': return 'PA';
                      case 'cdbg_dr_allocation': return 'CDBG-DR';
                      case 'sba_total_approved_loan_amount': return 'SBA';
                      default: return type;
                    }
                  }).join(', ')
              }
            ]}
          />
        )}
        
        {/* Total Funding Summary */}
        <div className="mb-6">
          <div className="bg-[#f8fafc] border border-[#E6E7E8] rounded-lg p-4">
            {(() => {
              // Calculate totals for all funding types
              const totalIHP = filteredData.reduce((sum, item) => {
                const ihpTotal = typeof item.ihp_total === 'number' ? item.ihp_total : 
                            (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);
                return sum + (selectedFundingTypes.includes('ihp') ? ihpTotal : 0);
              }, 0);
              
              const totalPA = filteredData.reduce((sum, item) => {
                const paTotal = typeof item.pa_total === 'number' ? item.pa_total : 
                           (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0);
                return sum + (selectedFundingTypes.includes('pa') ? paTotal : 0);
              }, 0);
              
              const totalCDBG = filteredData.reduce((sum, item) => {
                const cdbgTotal = typeof item.cdbg_dr_allocation === 'number' ? item.cdbg_dr_allocation :
                               (typeof item.cdbg_dr_allocation === 'string' ? parseFloat(item.cdbg_dr_allocation) || 0 : 0);
                return sum + (selectedFundingTypes.includes('cdbg_dr_allocation') ? cdbgTotal : 0);
              }, 0);

              const totalSBA = filteredData.reduce((sum, item) => {
                const sbaTotal = typeof item.sba_total_approved_loan_amount === 'number' ? item.sba_total_approved_loan_amount :
                               (typeof item.sba_total_approved_loan_amount === 'string' ? parseFloat(item.sba_total_approved_loan_amount) || 0 : 0);
                return sum + (selectedFundingTypes.includes('sba_total_approved_loan_amount') ? sbaTotal : 0);
              }, 0);

              const grandTotal = totalIHP + totalPA + totalCDBG + totalSBA;
              
              // Helper function to format currency
              const formatCurrency = (amount: number): string => {
                return new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0
                }).format(amount);
              };

              return (
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="md:flex-1 flex flex-col md:flex-row gap-3">
                    {/* Number of Disaster Events Box */}
                    <div className="flex-1 bg-white p-4 rounded-lg border border-[#E6E7E8] shadow-sm">
                      <h3 className="text-xl font-bold text-[#003A63] mb-2">Disaster Events</h3>
                      <p className="text-3xl font-bold text-[#003A63]">{formatNumber(filteredData.length)}</p>
                      <p className="text-sm text-gray-500 mt-1">Total events matching filters</p>
                    </div>
                    
                    {/* Grand Total Box */}
                    <div className="flex-1 bg-white p-4 rounded-lg border border-[#E6E7E8] shadow-sm">
                      <h3 className="text-xl font-bold text-[#00A79D] mb-2">Grand Total</h3>
                      <p className="text-3xl font-bold text-[#00A79D]">{formatCurrency(grandTotal)}</p>
                      <p className="text-sm text-gray-500 mt-1">All selected funding types</p>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 h-full">
                      {selectedFundingTypes.includes('ihp') && (
                        <div className="bg-white p-3 rounded-lg border border-[#E6E7E8] shadow-sm flex flex-col justify-between h-full">
                          <div>
                            <h4 className="text-sm font-semibold text-[#003A63]">Individual & Household<br />Program Total</h4>
                            <p className="text-xl font-bold text-[#2171b5] mt-1">{formatCurrency(totalIHP)}</p>
                          </div>
                          <div></div> {/* Empty div for consistent spacing */}
                        </div>
                      )}
                      
                      {selectedFundingTypes.includes('pa') && (
                        <div className="bg-white p-3 rounded-lg border border-[#E6E7E8] shadow-sm flex flex-col justify-between h-full">
                          <div>
                            <h4 className="text-sm font-semibold text-[#003A63]">Public<br />Assistance Total</h4>
                            <p className="text-xl font-bold text-[#41B6E6] mt-1">{formatCurrency(totalPA)}</p>
                          </div>
                          <div></div> {/* Empty div for consistent spacing */}
                        </div>
                      )}
                      
                      {selectedFundingTypes.includes('cdbg_dr_allocation') && (
                        <div className="bg-white p-3 rounded-lg border border-[#E6E7E8] shadow-sm flex flex-col justify-between h-full">
                          <div>
                            <h4 className="text-sm font-semibold text-[#003A63]">CDBG-DR<br />Allocation Total</h4>
                            <p className="text-xl font-bold text-[#89684F] mt-1">{formatCurrency(totalCDBG)}</p>
                          </div>
                          <div></div> {/* Empty div for consistent spacing */}
                        </div>
                      )}

                      {selectedFundingTypes.includes('sba_total_approved_loan_amount') && (
                        <div className="bg-white p-3 rounded-lg border border-[#E6E7E8] shadow-sm flex flex-col justify-between h-full">
                          <div>
                            <h4 className="text-sm font-semibold text-[#003A63]">SBA Approved Disaster<br />Loan Total</h4>
                            <p className="text-xl font-bold text-[#F7931E] mt-1">{formatCurrency(totalSBA)}</p>
                          </div>
                          <div></div> {/* Empty div for consistent spacing */}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
              
              // Helper function to format large numbers with commas
              function formatNumber(num: number): string {
                return new Intl.NumberFormat('en-US').format(num);
              }
            })()}
          </div>
        </div>

        {/* Map Section */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Disaster Map</h2>
          
          {/* Map Description */}
          <p className="text-sm text-gray-600 mb-4">
            Explore the geographic distribution of disaster events and funding. Color of states indicate funding amounts across the selected funding types and date range.
          </p>
          
          {/* Current Filters Readout */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Current Filters Applied</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Date Range */}
              <div>
                <span className="font-medium text-gray-600">Date Range:</span>
                <p className="text-gray-800">
                  {months[dateRange.startMonth - 1]} {dateRange.startYear} - {months[dateRange.endMonth - 1]} {dateRange.endYear}
                </p>
              </div>
              
              {/* Locations */}
              <div>
                <span className="font-medium text-gray-600">Locations:</span>
                <p className="text-gray-800">
                  {selectedStates.length === 0 && !includesTerritories ? 'All states' : 
                   selectedStates.length === Object.keys(stateNames).length && includesTerritories ? 'All states & territories' :
                   selectedStates.length === 0 && includesTerritories ? 'U.S. Territories only' :
                   selectedStates.length <= 3 ? 
                     selectedStates.map(abbr => stateNames[abbr as keyof typeof stateNames]).join(', ') + 
                     (includesTerritories ? ' + Territories' : '') :
                     `${selectedStates.length} states selected` + (includesTerritories ? ' + Territories' : '')
                  }
                </p>
              </div>
              
              {/* Disaster Types */}
              <div>
                <span className="font-medium text-gray-600">Disaster Types:</span>
                <p className="text-gray-800">
                  {selectedDisasterTypes.length === 0 ? 'All types' :
                   selectedDisasterTypes.length <= 2 ? selectedDisasterTypes.join(', ') :
                   `${selectedDisasterTypes.length} types selected`
                  }
                </p>
              </div>
              
              {/* Funding Types */}
              <div>
                <span className="font-medium text-gray-600">Funding Types:</span>
                <p className="text-gray-800">
                  {selectedFundingTypes.length === 0 ? 'None selected' :
                   selectedFundingTypes.length === 4 ? 'All funding types' :
                   selectedFundingTypes.map(type => {
                     switch(type) {
                       case 'ihp': return 'IHP';
                       case 'pa': return 'PA';
                       case 'cdbg_dr_allocation': return 'CDBG-DR';
                       case 'sba_total_approved_loan_amount': return 'SBA';
                       default: return type;
                     }
                   }).join(', ')
                  }
                </p>
              </div>
            </div>
          </div>
          
          <DisasterMap 
            filteredData={filteredData} 
            stateNames={stateNames} 
            selectedFundingTypes={selectedFundingTypes}
          />
        </div>

        {/* Download Section */}
        <div className="flex items-center justify-between pt-4 border-t">
          <span className="text-sm text-[#89684F]">
            {sortedData.length} records match your criteria
          </span>
          <button
            onClick={handleDownload}
            className="flex items-center px-4 py-2 bg-[#00A79D] text-white rounded-md hover:bg-[#003A63]"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Selected Data
          </button>
        </div>
        
        {/* Records Table */}
        <div className="mt-8 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#003A63]">Preview Records</h2>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-[#89684F]">Records per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#00A79D]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
          <table className="min-w-full border-collapse border border-[#E6E7E8] text-sm">
            <thead>
              <tr className="bg-[#003A63] text-white">
                <th 
                  className="px-3 py-2 border border-[#E6E7E8] text-sm cursor-pointer hover:bg-[#004c7a] select-none"
                  onClick={() => handleSort('incident_start')}
                >
                  <div className="flex items-center justify-between">
                    <span>Incident Date</span>
                    <span className="ml-1">
                      {sortColumn === 'incident_start' ? (
                        sortDirection === 'asc' ? '↑' : '↓'
                      ) : '↕'}
                    </span>
                  </div>
                </th>
                <th 
                  className="px-3 py-2 border border-[#E6E7E8] text-sm cursor-pointer hover:bg-[#004c7a] select-none"
                  onClick={() => handleSort('state')}
                >
                  <div className="flex items-center justify-between">
                    <span>State</span>
                    <span className="ml-1">
                      {sortColumn === 'state' ? (
                        sortDirection === 'asc' ? '↑' : '↓'
                      ) : '↕'}
                    </span>
                  </div>
                </th>
                <th 
                  className="px-3 py-2 border border-[#E6E7E8] text-sm cursor-pointer hover:bg-[#004c7a] select-none"
                  onClick={() => handleSort('incident_type')}
                >
                  <div className="flex items-center justify-between">
                    <span>Disaster Type</span>
                    <span className="ml-1">
                      {sortColumn === 'incident_type' ? (
                        sortDirection === 'asc' ? '↑' : '↓'
                      ) : '↕'}
                    </span>
                  </div>
                </th>
                <th 
                  className="px-3 py-2 border border-[#E6E7E8] text-sm cursor-pointer hover:bg-[#004c7a] select-none"
                  onClick={() => handleSort('event')}
                >
                  <div className="flex items-center justify-between">
                    <span>Event</span>
                    <span className="ml-1">
                      {sortColumn === 'event' ? (
                        sortDirection === 'asc' ? '↑' : '↓'
                      ) : '↕'}
                    </span>
                  </div>
                </th>
                <th 
                  className="px-3 py-2 border border-[#E6E7E8] text-sm cursor-pointer hover:bg-[#004c7a] select-none"
                  onClick={() => handleSort('incident_number')}
                >
                  <div className="flex items-center justify-between">
                    <span>Incident Number</span>
                    <span className="ml-1">
                      {sortColumn === 'incident_number' ? (
                        sortDirection === 'asc' ? '↑' : '↓'
                      ) : '↕'}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentData.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-[#E6E7E8]'}>
                  <td className="px-3 py-2 border border-[#E6E7E8] text-sm">
                    {new Date(row.incident_start).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 border border-[#E6E7E8] text-sm">
                    {stateNames[row.state as keyof typeof stateNames] || row.state}
                  </td>
                  <td className="px-3 py-2 border border-[#E6E7E8] text-sm">{row.incident_type}</td>
                  <td className="px-3 py-2 border border-[#E6E7E8] text-sm">{row.event}</td>
                  <td className="px-3 py-2 border border-[#E6E7E8] text-sm">{row.incident_number}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-[#89684F]">
              Showing {startIndex + 1}-{Math.min(endIndex, sortedData.length)} of {sortedData.length} records
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-md ${
                  currentPage === 1
                    ? 'bg-[#E6E7E8] text-gray-500 cursor-not-allowed'
                    : 'bg-[#89684F] text-white hover:bg-[#003A63]'
                }`}
              >
                &larr; Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded-md ${
                  currentPage === totalPages
                    ? 'bg-[#E6E7E8] text-gray-500 cursor-not-allowed'
                    : 'bg-[#89684F] text-white hover:bg-[#003A63]'
                }`}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisasterDataDownloaderJan25;