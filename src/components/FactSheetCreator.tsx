"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import * as Papa from 'papaparse';
import { Search, Filter, Check, CheckSquare, Square, Circle, CheckCircle } from 'lucide-react';
import FactSheetDisplay from './FactSheetDisplay';

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
  year: number | null;
  ihp_applicants?: number;
  // ... add other fields as needed
}

const FactSheetCreator = () => {
  const [data, setData] = useState<DisasterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<DisasterData | null>(null);
  const [searchResults, setSearchResults] = useState<DisasterData[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedResult, setSelectedResult] = useState<DisasterData | null>(null);

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
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
    'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'Virgin Islands', 'MP': 'Northern Mariana Islands', 
    'AS': 'American Samoa', 'FM': 'Federated States of Micronesia', 'MH': 'Marshall Islands', 
    'PW': 'Palau'
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
            
            // Process data to ensure consistent types and add a year field
            const processedData = (results.data as DisasterData[])
              .filter((item: any) => {
                // Filter out any rows without essential data
                return item && item.incident_number && item.state;
              })
              .map(item => {
                // Add a year field for easier filtering
                const year = item.incident_start ? new Date(item.incident_start).getFullYear() : null;
                
                // Ensure numeric values are properly parsed
                const ihpTotal = typeof item.ihp_total === 'number' ? item.ihp_total : 
                            (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);
                
                // If we don't have applicants data, estimate it based on disaster type
                let ihpApplicants = item.ihp_applicants;
                if (!ihpApplicants && ihpTotal > 0) {
                  // Different disasters have different average grant sizes
                  let avgGrantSize = 4000; // default
                  
                  if (item.incident_type) {
                    const disasterType = item.incident_type.toLowerCase();
                    
                    // Hurricane assistance tends to be higher
                    if (disasterType.includes('hurricane') || disasterType.includes('typhoon')) {
                      avgGrantSize = 6000;
                    }
                    // Flood assistance varies but is often substantial
                    else if (disasterType.includes('flood')) {
                      avgGrantSize = 5000;
                    }
                    // Wildfire assistance can be quite high per household
                    else if (disasterType.includes('fire') || disasterType.includes('wildfire')) {
                      avgGrantSize = 7000;
                    }
                    // Tornado assistance depends on scope but is often targeted
                    else if (disasterType.includes('tornado')) {
                      avgGrantSize = 4500;
                    }
                  }
                  
                  // Calculate estimated applicants
                  ihpApplicants = Math.round(ihpTotal / avgGrantSize);
                }
                
                return {
                  ...item,
                  year,
                  ihp_applicants: ihpApplicants,
                  ihp_total: ihpTotal,
                  pa_total: typeof item.pa_total === 'number' ? item.pa_total : 
                           (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0),
                  cdbg_dr_allocation: typeof item.cdbg_dr_allocation === 'number' ? item.cdbg_dr_allocation : 
                                     (typeof item.cdbg_dr_allocation === 'string' ? parseFloat(item.cdbg_dr_allocation) || 0 : 0)
                };
              });
            
            // Remove any incomplete entries
            const validData = processedData.filter(item => item.incident_number);
            
            console.log(`Loaded ${validData.length} disaster records`);
            setData(validData);
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

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (e.target.value.trim() === '') {
      setSearchResults([]);
      setShowResults(false);
      setSelectedResult(null);
    }
  };

  // Handle search submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      setShowResults(false);
      setSelectedResult(null);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    
    // Search through the data for matching events
    const results = data.filter(item => {
      return (
        (item.event && item.event.toLowerCase().includes(query)) ||
        (item.incident_type && item.incident_type.toLowerCase().includes(query)) ||
        (item.state && item.state.toLowerCase().includes(query)) ||
        (item.incident_number && item.incident_number.toString().includes(query))
      );
    });
    
    // Sort results by date (most recent first)
    const sortedResults = [...results].sort((a, b) => {
      const dateA = a.incident_start ? new Date(a.incident_start).getTime() : 0;
      const dateB = b.incident_start ? new Date(b.incident_start).getTime() : 0;
      return dateB - dateA;
    });
    
    setSearchResults(sortedResults);
    setSelectedResult(null);
    setShowResults(true);
  };

  // Display fact sheet for selected event
  const displaySelectedEvents = () => {
    if (selectedResult) {
      setSelectedEvent(selectedResult);
      setShowResults(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Get state name from abbreviation
  const getStateName = (abbr: string) => {
    return stateNames[abbr as keyof typeof stateNames] || abbr;
  };

  if (loading) {
    return <div className="text-center p-4">Loading data...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 text-[#003A63]">Disaster Fact Sheet Creator</h1>
        <p className="text-[#89684F]">
          Search for a specific disaster event to create a sharable fact sheet with key data.
        </p>
      </div>

      {/* Search bar */}
      <div className="mb-8">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by event name, incident type, state, or disaster number..."
            className="w-full p-4 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003A63]"
          />
          <button
            type="submit"
            className="absolute right-4 top-4 text-[#003A63]"
          >
            <Search size={20} />
          </button>
        </form>
        
        {/* Search results with radio buttons */}
        {showResults && searchResults.length > 0 && (
          <div className="mt-2 border rounded-lg shadow-md">
            <div className="p-2 bg-gray-100 border-b flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm">({searchResults.length} results found)</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={displaySelectedEvents}
                  className="px-2 py-1 text-xs bg-[#00A79D] text-white rounded hover:bg-[#003A63]"
                >
                  Show Selected
                </button>
                <button
                  onClick={() => setShowResults(false)}
                  className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                  Close
                </button>
              </div>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              <div className="divide-y">
                {searchResults.map((event, index) => (
                  <div 
                    key={`${event.incident_number}-${index}`} 
                    className="p-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedResult(event)}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 text-[#003A63]">
                        {selectedResult && selectedResult.incident_number === event.incident_number ? (
                          <CheckCircle size={16} />
                        ) : (
                          <Circle size={16} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-[#003A63]">
                          {event.event || 'Unnamed Event'} {event.incident_number && `(#${event.incident_number})`}
                        </div>
                        <div className="text-sm text-gray-600 flex justify-between">
                          <span>{event.incident_type}</span>
                          <span>{getStateName(event.state)}</span>
                          <span>{formatDate(event.incident_start)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {showResults && searchResults.length === 0 && (
          <div className="mt-2 p-4 border rounded-lg bg-gray-50">
            <p className="text-gray-600">No disasters found matching "{searchQuery}"</p>
          </div>
        )}
      </div>

      {/* Fact Sheet Display */}
      {selectedEvent && (
        <FactSheetDisplay 
          event={selectedEvent} 
          allEvents={data}
          selectedEvents={[selectedEvent]}
          stateNames={stateNames}
        />
      )}

      {/* Instructions when no event is selected */}
      {!selectedEvent && !showResults && (
        <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <h3 className="text-lg font-medium text-[#003A63] mb-2">
            Search for a disaster to get started
          </h3>
          <p className="text-gray-600">
            Enter a disaster name, state, or incident number in the search bar above to find specific events.
            <br />You can search for terms like "Hurricane Ian", "Texas", "Florida", or a specific FEMA incident number.
          </p>
        </div>
      )}
    </div>
  );
};

export default FactSheetCreator; 