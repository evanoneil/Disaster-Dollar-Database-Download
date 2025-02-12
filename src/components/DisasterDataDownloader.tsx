"use client";

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import _ from 'lodash';
import { Download } from 'lucide-react';

interface DisasterData {
  incident_start: string;
  incident_type: string;
  state: string;
  event: string;
  ihp_total: number;
  pa_total: number;
  incident_number: number;
  declaration_date: string;
  declaration_url: string;
  // ... add other fields as needed
}

const DisasterDataDownloader = () => {
  const [data, setData] = useState<DisasterData[]>([]);
  const [filteredData, setFilteredData] = useState<DisasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startYear: 2003,
    startMonth: 1,
    endYear: 2025,
    endMonth: 12
  });
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedDisasterTypes, setSelectedDisasterTypes] = useState<string[]>([]);
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

  useEffect(() => {
    if (!loading) {
      const filtered = data.filter(row => {
        if (!row.incident_start) return false;
        
        const incidentDate = new Date(row.incident_start);
        const startDate = new Date(dateRange.startYear, dateRange.startMonth - 1, 1);
        const endDate = new Date(dateRange.endYear, dateRange.endMonth, 0);
        
        const dateMatch = incidentDate >= startDate && incidentDate <= endDate;
        const stateMatch = selectedStates.length === 0 || selectedStates.includes(row.state);
        const typeMatch = selectedDisasterTypes.length === 0 || selectedDisasterTypes.includes(row.incident_type);
        
        return dateMatch && stateMatch && typeMatch;
      });

      setFilteredData(filtered);
    }
  }, [dateRange, selectedStates, selectedDisasterTypes, data, loading]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange, selectedStates, selectedDisasterTypes]);

  const handleDownload = () => {
    const processedData = filteredData.map(row => ({
      ...row,
      state: stateNames[row.state as keyof typeof stateNames] || 
             row.state
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
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 text-[#003A63]">Disaster Dollar Database Data Download Delivery Device</h1>
        <p className="text-[#89684F]">
          Filter and download disaster assistance data by date range, location, and disaster type.
        </p>
      </div>

      <div className="space-y-6">
        {/* Date Range Selection */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Date Range</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Start Date</label>
              <div className="flex gap-2">
                <select
                  value={dateRange.startMonth}
                  onChange={(e) => setDateRange({ ...dateRange, startMonth: parseInt(e.target.value) })}
                  className="flex-1 rounded-md border border-gray-300 p-2"
                >
                  {months.map((month, index) => (
                    <option key={index + 1} value={index + 1}>{month}</option>
                  ))}
                </select>
                <select
                  value={dateRange.startYear}
                  onChange={(e) => setDateRange({ ...dateRange, startYear: parseInt(e.target.value) })}
                  className="flex-1 rounded-md border border-gray-300 p-2"
                >
                  {_.range(2003, 2026).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">End Date</label>
              <div className="flex gap-2">
                <select
                  value={dateRange.endMonth}
                  onChange={(e) => setDateRange({ ...dateRange, endMonth: parseInt(e.target.value) })}
                  className="flex-1 rounded-md border border-gray-300 p-2"
                >
                  {months.map((month, index) => (
                    <option key={index + 1} value={index + 1}>{month}</option>
                  ))}
                </select>
                <select
                  value={dateRange.endYear}
                  onChange={(e) => setDateRange({ ...dateRange, endYear: parseInt(e.target.value) })}
                  className="flex-1 rounded-md border border-gray-300 p-2"
                >
                  {_.range(2003, 2026).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Location Selection */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Location</h2>
          <div className="border rounded-lg">
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
              </div>
            </div>
          </div>
        </div>

        {/* Disaster Type Selection */}
        <div>
          <h2 className="text-lg font-semibold mb-4 text-[#003A63]">Disaster Types</h2>
          <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
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
                Previous
              </button>
              <span className="px-4 py-1 text-[#89684F]">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded-md ${
                  currentPage === totalPages
                    ? 'bg-[#E6E7E8] text-gray-500 cursor-not-allowed'
                    : 'bg-[#89684F] text-white hover:bg-[#003A63]'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DisasterDataDownloader; 