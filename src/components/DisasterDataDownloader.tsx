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
  incident_number: number;
  declaration_date: string;
  declaration_url: string;
  // ... add other fields as needed
}

const DisasterDataDownloader = () => {
  const [data, setData] = useState<DisasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startYear: 2015,
    startMonth: 1,
    endYear: new Date().getFullYear(),
    endMonth: new Date().getMonth() + 1,
  });
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedDisasterTypes, setSelectedDisasterTypes] = useState<string[]>([]);
  const [selectedFundingTypes, setSelectedFundingTypes] = useState<string[]>(['ihp', 'pa', 'cdbg_dr_allocation']);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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
        const response = await fetch('/data/disaster_dollar_database_2025_02_05.csv');
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

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = filteredData.slice(startIndex, endIndex);

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
        {/* Time Series Brush Selector */}
        {!loading && (
          <TimeSeriesBrush 
            data={data} 
            dateRange={dateRange} 
            onDateRangeChange={setDateRange} 
          />
        )}

        {/* Map Section */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Disaster Map</h2>
          <DisasterMap 
            filteredData={filteredData} 
            stateNames={stateNames} 
            selectedFundingTypes={selectedFundingTypes}
          />
        </div>

        {/* Location Selection */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Location</h2>
          <div className="border rounded-lg">
            <div className="p-2 border-b flex justify-between items-center bg-gray-50">
              <span className="text-sm font-medium text-[#003A63]">States & Territories</span>
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
            <div className="max-h-60 overflow-y-auto p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
            </div>
          </div>
        </div>

        {/* Disaster Type Selection */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Disaster Types</h2>
          <div className="border rounded-lg">
            <div className="p-2 border-b flex justify-between items-center bg-gray-50">
              <span className="text-sm font-medium text-[#003A63]">Incident Types</span>
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
            <div className="p-4 max-h-60 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            </div>
          </div>
        </div>

        {/* Funding Type Selection */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Funding Types</h2>
          <div className="border rounded-lg">
            <div className="p-2 border-b flex justify-between items-center bg-gray-50">
              <span className="text-sm font-medium text-[#003A63]">Funding Programs</span>
              <div className="space-x-2">
                <button
                  onClick={() => setSelectedFundingTypes(['ihp', 'pa', 'cdbg_dr_allocation'])}
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
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex items-center space-x-2">
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
                  <span className="text-sm">Individual & Household Program (IHP)</span>
                </label>
                <label className="flex items-center space-x-2">
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
                  <span className="text-sm">Public Assistance (PA)</span>
                </label>
                <label className="flex items-center space-x-2">
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
                  <span className="text-sm">Community Development Block Grant (CDBG-DR)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Download Section */}
        <div className="flex items-center justify-between pt-4 border-t">
          <span className="text-sm text-[#89684F]">
            {filteredData.length} records match your criteria
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
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Preview Records</h2>
          <table className="min-w-full border-collapse border border-[#E6E7E8] text-sm">
            <thead>
              <tr className="bg-[#003A63] text-white">
                <th className="px-3 py-2 border border-[#E6E7E8] text-sm">Incident Date</th>
                <th className="px-3 py-2 border border-[#E6E7E8] text-sm">State</th>
                <th className="px-3 py-2 border border-[#E6E7E8] text-sm">Disaster Type</th>
                <th className="px-3 py-2 border border-[#E6E7E8] text-sm">Event</th>
                <th className="px-3 py-2 border border-[#E6E7E8] text-sm">Incident Number</th>
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
              Showing {startIndex + 1}-{Math.min(endIndex, filteredData.length)} of {filteredData.length} records
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

export default DisasterDataDownloader;