"use client";

import * as React from 'react';
import { useMemo, useRef, useState, useEffect } from 'react';
import { Download, Share2 } from 'lucide-react';
import { format, subYears } from 'date-fns';
import DisasterFundingChart from './DisasterFundingChart';
import FundingBreakdownChart from './FundingBreakdownChart';
import * as Papa from 'papaparse';

// We'll load these libraries when needed in the function
// to avoid issues with SSR, instead of using dynamic imports
// which are causing TypeScript errors

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
  year: number | null;
  ihp_applicants?: number;
  ihp_average_award?: number;
  // CDBG-DR grantee information
  frn1_date?: string;
  frn1_grantee1_name?: string;
  frn1_grantee1_amount?: number;
  frn1_grantee2_name?: string;
  frn1_grantee2_amount?: number;
  frn1_grantee3_name?: string;
  frn1_grantee3_amount?: number;
  frn1_grantee4_name?: string;
  frn1_grantee4_amount?: number;
  frn1_grantee5_name?: string;
  frn1_grantee5_amount?: number;
  frn1_grantee6_name?: string;
  frn1_grantee6_amount?: number;
  frn1_grantee7_name?: string;
  frn1_grantee7_amount?: number;
  frn1_grantee8_name?: string;
  frn1_grantee8_amount?: number;
  frn1_grantee9_name?: string;
  frn1_grantee9_amount?: number;
  frn2_date?: string;
  frn2_grantee1_name?: string;
  frn2_grantee1_amount?: number;
  frn2_grantee2_name?: string;
  frn2_grantee2_amount?: number;
  frn2_grantee3_name?: string;
  frn2_grantee3_amount?: number;
  frn2_grantee4_name?: string;
  frn2_grantee4_amount?: number;
  frn3_date?: string;
  frn3_grantee1_name?: string;
  frn3_grantee1_amount?: number;
  frn3_grantee2_name?: string;
  frn3_grantee2_amount?: number;
  frn3_grantee3_name?: string;
  frn3_grantee3_amount?: number;
  frn3_grantee4_name?: string;
  frn3_grantee4_amount?: number;
  frn4_date?: string;
  frn4_grantee1_name?: string;
  frn4_grantee1_amount?: number;
  // ... add other fields as needed
}

interface CongressionalDistrictData {
  state_name: string;
  district_label: string;
  district_number: number;
  representative: string;
  party: string;
  total_applicants: number;
  total_funding: number;
  funding_per_applicant: number;
  n_zips: number;
  disaster_numbers: string;
  NAMELSAD: string;
  STATEFP: string;
}

interface FactSheetDisplayProps {
  event: DisasterData;
  allEvents: DisasterData[];
  selectedEvents?: DisasterData[];
  stateNames: Record<string, string>;
  useSBAData?: boolean;
}

const FactSheetDisplay: React.FC<FactSheetDisplayProps> = ({
  event,
  allEvents,
  selectedEvents = [],
  stateNames,
  useSBAData = false
}) => {
  const stateName = stateNames[event.state as keyof typeof stateNames] || event.state;
  const multipleEventsSelected = selectedEvents.length > 1;
  
  // Sort state for congressional district data
  const [sortField, setSortField] = useState<'funding' | 'applicants'>('funding');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Function to toggle sort
  const toggleSort = (field: 'funding' | 'applicants') => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // Set new field and default to descending
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  // Use the first event as the primary one for the header and main stats
  const primaryEvent = event;
  
  // Get all events for this state for calculations
  const stateEvents = useMemo(() => {
    return allEvents.filter(item => item.state === event.state);
  }, [allEvents, event.state]);
  
  // Get all events of the same type nationwide in the last 5 years
  const sameTypeRecentEvents = useMemo(() => {
    const fiveYearsAgo = subYears(new Date(), 5);
    return allEvents.filter(item => {
      if (item.incident_type !== event.incident_type) return false;
      if (!item.incident_start) return false;
      const date = new Date(item.incident_start);
      return date >= fiveYearsAgo;
    });
  }, [allEvents, event.incident_type]);

  // Calculate event-specific stats for primary event
  const eventStats = useMemo(() => {
    // Average assistance to households for this disaster
    const totalIhpAmount = typeof primaryEvent.ihp_total === 'number' ? primaryEvent.ihp_total : 
                          (typeof primaryEvent.ihp_total === 'string' ? parseFloat(primaryEvent.ihp_total) || 0 : 0);
    
    let applicants = primaryEvent.ihp_applicants || 0;
    let avgAssistance = 0;
    
    // First, check if we have the actual average award from the data
    if (primaryEvent.ihp_average_award && primaryEvent.ihp_average_award > 0) {
      // Use the actual average award data from the CSV
      avgAssistance = primaryEvent.ihp_average_award;
      
      // If we have the average award but not applicants, calculate applicants
      if (!applicants && totalIhpAmount > 0 && avgAssistance > 0) {
        applicants = Math.round(totalIhpAmount / avgAssistance);
      }
    } 
    // If no actual average award data but we have both IHP total and applicants
    else if (applicants > 0 && totalIhpAmount > 0) {
      // Calculate average assistance from actual data
      avgAssistance = totalIhpAmount / applicants;
    }
    // Last resort: if we don't have applicants data but do have IHP funding
    else if (!applicants && totalIhpAmount > 0) {
      // Estimate based on national averages from FEMA data
      // These are FEMA's national average grant sizes by disaster type (more accurate than our previous static values)
      const nationalAveragesByType = {
        hurricane: 5372,
        flood: 4467,
        wildfire: 6198,
        tornado: 3975,
        default: 4103 // national average across all disaster types
      };
      
      let estimatedAverageGrant = nationalAveragesByType.default;
      
      if (primaryEvent.incident_type) {
        const disasterType = primaryEvent.incident_type.toLowerCase();
        if (disasterType.includes('hurricane') || disasterType.includes('typhoon')) {
          estimatedAverageGrant = nationalAveragesByType.hurricane;
        } else if (disasterType.includes('flood')) {
          estimatedAverageGrant = nationalAveragesByType.flood;
        } else if (disasterType.includes('fire') || disasterType.includes('wildfire')) {
          estimatedAverageGrant = nationalAveragesByType.wildfire;
        } else if (disasterType.includes('tornado')) {
          estimatedAverageGrant = nationalAveragesByType.tornado;
        }
      }
      
      // Calculate estimated applicants and use the national average as the avgAssistance
      applicants = Math.round(totalIhpAmount / estimatedAverageGrant);
      avgAssistance = estimatedAverageGrant;
      
      // Log that we're using an estimated value
      console.log(`Using estimated average assistance for ${primaryEvent.event || 'Unnamed Event'} (#${primaryEvent.incident_number}): $${avgAssistance}`);
    }
    
    // Number of applicants for this disaster
    const totalApplicants = applicants;
    
    // Count of similar disasters nationwide in past 5 years
    const similarDisastersCount = sameTypeRecentEvents.length;
    
    // Log the data we're using for debugging
    console.log(`Average assistance for ${primaryEvent.event || 'Unnamed Event'} (#${primaryEvent.incident_number}): $${avgAssistance}`);
    console.log(`Data source: ${primaryEvent.ihp_average_award ? 'Actual CSV data' : 'Calculated/Estimated'}`);
    
    return {
      avgAssistance,
      totalApplicants,
      similarDisastersCount
    };
  }, [primaryEvent, sameTypeRecentEvents]);

  // Calculate combined funding data for all selected events
  const combinedFundingStats = useMemo(() => {
    if (selectedEvents.length <= 1) {
      // If only one event is selected, return null to use the regular display
      return null;
    }
    
    // Helper function to calculate total funding for an event
    const calculateEventTotalFunding = (item: DisasterData) => {
      const ihpTotal = typeof item.ihp_total === 'number' ? item.ihp_total :
                     (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);

      const paTotal = typeof item.pa_total === 'number' ? item.pa_total :
                     (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0);

      const cdbgDrAllocation = typeof item.cdbg_dr_allocation === 'number' ? item.cdbg_dr_allocation :
                              (typeof item.cdbg_dr_allocation === 'string' ? parseFloat(item.cdbg_dr_allocation) || 0 : 0);

      const sbaTotal = typeof item.sba_total_approved_loan_amount === 'number' ? item.sba_total_approved_loan_amount :
                      (typeof item.sba_total_approved_loan_amount === 'string' ? parseFloat(item.sba_total_approved_loan_amount) || 0 : 0);

      return {
        ihpTotal,
        paTotal,
        cdbgDrAllocation,
        sbaTotal,
        totalFunding: ihpTotal + paTotal + cdbgDrAllocation + (useSBAData ? sbaTotal : 0)
      };
    };
    
    // Calculate totals across all selected events
    const totalsByEvent = selectedEvents.map(event => {
      const funding = calculateEventTotalFunding(event);
      const stateName = stateNames[event.state as keyof typeof stateNames] || event.state;
      const year = event.incident_start ? new Date(event.incident_start).getFullYear() : 'Unknown';
      
      // Calculate applicants for this event
      let applicants = event.ihp_applicants || 0;
      
      // If we don't have applicants data but we have IHP funding and average award, estimate it
      if (!applicants && event.ihp_total > 0) {
        // First try to use the actual average award if available
        if (event.ihp_average_award && event.ihp_average_award > 0) {
          applicants = Math.round(event.ihp_total / event.ihp_average_award);
        } else {
          // If no average award is available, use national averages based on disaster type
          let estimatedAverageGrant = 4103; // Default national average
          
          if (event.incident_type) {
            const disasterType = event.incident_type.toLowerCase();
            if (disasterType.includes('hurricane') || disasterType.includes('typhoon')) {
              estimatedAverageGrant = 5372;
            } else if (disasterType.includes('flood')) {
              estimatedAverageGrant = 4467;
            } else if (disasterType.includes('fire') || disasterType.includes('wildfire')) {
              estimatedAverageGrant = 6198;
            } else if (disasterType.includes('tornado')) {
              estimatedAverageGrant = 3975;
            }
          }
          
          applicants = Math.round(event.ihp_total / estimatedAverageGrant);
        }
      }
      
      return {
        name: `${year} ${stateName} ${event.event || 'Unnamed Event'}`,
        incident_number: event.incident_number,
        ihpTotal: funding.ihpTotal,
        paTotal: funding.paTotal,
        cdbgDrTotal: funding.cdbgDrAllocation,
        sbaTotal: funding.sbaTotal,
        totalFunding: funding.totalFunding,
        state: event.state,
        stateName,
        incidentType: event.incident_type,
        date: event.incident_start,
        applicants: applicants
      };
    });

    // Calculate grand totals
    const grandTotals = {
      ihpTotal: totalsByEvent.reduce((sum, e) => sum + e.ihpTotal, 0),
      paTotal: totalsByEvent.reduce((sum, e) => sum + e.paTotal, 0),
      cdbgDrTotal: totalsByEvent.reduce((sum, e) => sum + e.cdbgDrTotal, 0),
      sbaTotal: totalsByEvent.reduce((sum, e) => sum + e.sbaTotal, 0),
      totalFunding: totalsByEvent.reduce((sum, e) => sum + e.totalFunding, 0),
      totalApplicants: totalsByEvent.reduce((sum, e) => sum + e.applicants, 0)
    };
    
    // Get all unique states in selection
    const states = Array.from(new Set(selectedEvents.map(e => e.state))).map(abbr => 
      stateNames[abbr as keyof typeof stateNames] || abbr
    );
    
    // Get all unique incident types in selection
    const incidentTypes = Array.from(new Set(selectedEvents.map(e => e.incident_type)));
    
    // Find date range of selected events
    const dates = selectedEvents
      .map(e => e.incident_start ? new Date(e.incident_start) : null)
      .filter(Boolean) as Date[];
    
    let dateRange = "Unknown";
    if (dates.length > 0) {
      const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const latestDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      const formatDateShort = (date: Date) => format(date, 'MMM d, yyyy');
      dateRange = `${formatDateShort(earliestDate)} - ${formatDateShort(latestDate)}`;
    }
    
    return {
      totalsByEvent,
      grandTotals,
      states,
      incidentTypes,
      dateRange,
      eventCount: selectedEvents.length
    };
  }, [selectedEvents, stateNames]);

  // Calculate annual federal spend - now more accurate by finding the date range
  const federalSpendStats = useMemo(() => {
    // Ensure all values are properly parsed as numbers
    const calculateFunding = (item: DisasterData) => {
      // Convert any string values to numbers and handle nullish values
      const ihpTotal = typeof item.ihp_total === 'number' ? item.ihp_total :
                     (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);

      const paTotal = typeof item.pa_total === 'number' ? item.pa_total :
                     (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0);

      const cdbgDrAllocation = typeof item.cdbg_dr_allocation === 'number' ? item.cdbg_dr_allocation :
                              (typeof item.cdbg_dr_allocation === 'string' ? parseFloat(item.cdbg_dr_allocation) || 0 : 0);

      const sbaTotal = typeof item.sba_total_approved_loan_amount === 'number' ? item.sba_total_approved_loan_amount :
                      (typeof item.sba_total_approved_loan_amount === 'string' ? parseFloat(item.sba_total_approved_loan_amount) || 0 : 0);

      return {
        ihpTotal,
        paTotal,
        cdbgDrAllocation,
        sbaTotal,
        total: ihpTotal + paTotal + cdbgDrAllocation + (useSBAData ? sbaTotal : 0)
      };
    };
    
    // Find the date range of all events for this state
    const dates = stateEvents
      .map(item => item.incident_start ? new Date(item.incident_start) : null)
      .filter(Boolean) as Date[];
    
    if (dates.length === 0) {
      return {
        totalFunding: 0,
        annualAverage: 0,
        yearsSpan: 0,
        earliestYear: new Date().getFullYear(),
        latestYear: new Date().getFullYear()
      };
    }
    
    const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const latestDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    const earliestYear = earliestDate.getFullYear();
    const latestYear = latestDate.getFullYear();
    
    console.log(`Raw date range for ${stateName}: ${earliestYear} - ${latestYear}`);
    
    // Only consider events from the last 10 years for all states
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    
    const filteredEvents = stateEvents.filter(item => {
      if (!item.incident_start) return false;
      const date = new Date(item.incident_start);
      return date >= tenYearsAgo;
    });
    
    // Calculate the effective date range for display
    const effectiveEarliestYear = Math.max(earliestYear, latestYear - 10);
    
    // FIXED: Always use exactly 10 years for consistency across all states
    const yearsSpan = 10;
    
    console.log(`Using effective date range: ${effectiveEarliestYear} - ${latestYear} (${yearsSpan} years)`);
    console.log(`Filtered to ${filteredEvents.length} of ${stateEvents.length} events`);
    
    // Calculate all funding directly from the data without arbitrary caps
    const fundingDetails = filteredEvents.map(item => {
      const funding = calculateFunding(item);
      
      // Log large values for debugging but don't cap them
      const totalFunding = funding.total;
      if (totalFunding > 1_000_000_000) {
        console.log(`Large funding detected: ${item.event} (#${item.incident_number}) - $${totalFunding.toLocaleString()}`);
        console.log(`  IHP: $${funding.ihpTotal.toLocaleString()}`);
        console.log(`  PA: $${funding.paTotal.toLocaleString()}`);
        console.log(`  CDBG-DR: $${funding.cdbgDrAllocation.toLocaleString()}`);
      }
      
      return {
        event: item.event,
        date: item.incident_start,
        incident_number: item.incident_number,
        funding
      };
    });
    
    // Calculate total funding by summing individual events - no capping
    const totalFunding = fundingDetails.reduce((sum, item) => sum + item.funding.total, 0);
    
    // Calculate annual average - be explicit about using 10 years
    const annualAverage = totalFunding / yearsSpan;
    
    // Log detailed information for Louisiana to help debug
    if (stateName === 'Louisiana') {
      console.log('LOUISIANA FUNDING DETAILS:');
      console.log(`Total events: ${stateEvents.length}, Filtered events: ${filteredEvents.length}`);
      console.log(`Total funding calculation: $${totalFunding.toLocaleString()}`);
      console.log(`Annual average: $${annualAverage.toLocaleString()} over ${yearsSpan} years`);
      
      // Top events by funding
      const topEvents = [...fundingDetails]
        .sort((a, b) => b.funding.total - a.funding.total)
        .slice(0, 10);
      
      console.log('Top Events by Funding:');
      topEvents.forEach(item => {
        console.log(`${item.event} (#${item.incident_number}) - ${new Date(item.date).toLocaleDateString()}`);
        console.log(`  Total: $${item.funding.total.toLocaleString()}`);
        console.log(`  IHP: $${item.funding.ihpTotal.toLocaleString()}`);
        console.log(`  PA: $${item.funding.paTotal.toLocaleString()}`);
        console.log(`  CDBG-DR: $${item.funding.cdbgDrAllocation.toLocaleString()}`);
      });
    }
    
    // Also log North Carolina data for reference
    if (stateName === 'North Carolina') {
      console.log('NORTH CAROLINA FUNDING DETAILS:');
      console.log(`Total events: ${stateEvents.length}, Filtered events: ${filteredEvents.length}`);
      console.log(`Total funding calculation: $${totalFunding.toLocaleString()}`);
      console.log(`Annual average: $${annualAverage.toLocaleString()} over ${yearsSpan} years`);
      
      // Top events by funding
      const topEvents = [...fundingDetails]
        .sort((a, b) => b.funding.total - a.funding.total)
        .slice(0, 10);
      
      console.log('Top Events by Funding:');
      topEvents.forEach(item => {
        console.log(`${item.event} (#${item.incident_number}) - ${new Date(item.date).toLocaleDateString()}`);
        console.log(`  Total: $${item.funding.total.toLocaleString()}`);
        console.log(`  IHP: $${item.funding.ihpTotal.toLocaleString()}`);
        console.log(`  PA: $${item.funding.paTotal.toLocaleString()}`);
        console.log(`  CDBG-DR: $${item.funding.cdbgDrAllocation.toLocaleString()}`);
      });
    }
    
    return {
      totalFunding,
      annualAverage,
      yearsSpan,
      earliestYear: effectiveEarliestYear,
      latestYear
    };
  }, [stateEvents, stateName, event.state]);

  // Calculate major storms data for the state with improved filtering and selection
  const majorStormsData = useMemo(() => {
    // Helper function to calculate total funding for each event with improved error handling
    const calculateEventTotalFunding = (item: DisasterData) => {
      // More robust parsing with fallbacks for all funding sources
      const ihpTotal = typeof item.ihp_total === 'number' && !isNaN(item.ihp_total) ? item.ihp_total :
                     (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);

      const paTotal = typeof item.pa_total === 'number' && !isNaN(item.pa_total) ? item.pa_total :
                     (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0);

      const cdbgDrAllocation = typeof item.cdbg_dr_allocation === 'number' && !isNaN(item.cdbg_dr_allocation) ? item.cdbg_dr_allocation :
                              (typeof item.cdbg_dr_allocation === 'string' ? parseFloat(item.cdbg_dr_allocation) || 0 : 0);

      const sbaTotal = typeof item.sba_total_approved_loan_amount === 'number' && !isNaN(item.sba_total_approved_loan_amount) ? item.sba_total_approved_loan_amount :
                      (typeof item.sba_total_approved_loan_amount === 'string' ? parseFloat(item.sba_total_approved_loan_amount) || 0 : 0);

      // Calculate total and report any suspiciously large values for logging
      const totalFunding = ihpTotal + paTotal + cdbgDrAllocation + (useSBAData ? sbaTotal : 0);

      return {
        ihpTotal,
        paTotal,
        cdbgDrAllocation,
        sbaTotal,
        totalFunding
      };
    };
    
    // Log initial state events count
    console.log(`Processing ${stateEvents.length} total events for ${stateName}`);
    
    // Get all events from this state with calculated funding values
    const eventsWithFunding = stateEvents.map(item => {
      const funding = calculateEventTotalFunding(item);
      
      // Create a formatted date for easier debugging
      let formattedDate = 'Unknown';
      if (item.incident_start) {
        try {
          formattedDate = new Date(item.incident_start).toISOString().split('T')[0];
        } catch (e) {
          // Keep the default value if date parsing fails
        }
      }
      
      return {
        ...item,
        calculatedFunding: funding,
        formattedDate
      };
    });
    
    // Determine the appropriate time window based on events data
    // Instead of a fixed 10 years, look at data distribution to decide
    const allDates = eventsWithFunding
      .filter(item => item.incident_start)
      .map(item => new Date(item.incident_start))
      .sort((a, b) => a.getTime() - b.getTime());
      
    // Choose a more appropriate time window - use 20 years if there's enough historical data
    // otherwise default to 10 years or what's available
    let yearsToConsider = 10; // Default
    
    if (allDates.length > 0) {
      const earliestDate = allDates[0];
      const latestDate = allDates[allDates.length - 1];
      const yearsDiff = latestDate.getFullYear() - earliestDate.getFullYear();
      
      // Adapt the window based on available data
      if (yearsDiff >= 20) {
        yearsToConsider = 20; // Use 20 years if we have 20+ years of data
      } else if (yearsDiff >= 15) {
        yearsToConsider = 15; // Use 15 years if we have 15-19 years of data
      } else {
        yearsToConsider = Math.max(10, yearsDiff); // Otherwise use at least 10 years
      }
      
      console.log(`Data spans ${yearsDiff} years for ${stateName}, using a ${yearsToConsider}-year window`);
    }
    
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsToConsider);
    
    // Save the cutoff year and current year for the chart title
    const cutoffYear = cutoffDate.getFullYear();
    const currentYear = new Date().getFullYear();
    
    // Filter to events within our chosen timeframe
    let recentEvents = eventsWithFunding.filter(item => {
      if (!item.incident_start) {
        console.log(`Excluding event without start date: ${item.event || 'Unnamed'} #${item.incident_number}`);
        return false;
      }
      
      const date = new Date(item.incident_start);
      const isRecent = date >= cutoffDate;
      
      // Log events that are being excluded due to age
      if (!isRecent && item.calculatedFunding.totalFunding > 500000000) { // Log excluded events over $500M
        console.log(`EXCLUDED MAJOR STORM due to age: ${item.event || 'Unnamed'} (${item.formattedDate}) - $${Math.round(item.calculatedFunding.totalFunding).toLocaleString()}`);
      }
      
      return isRecent;
    });
    
    // Check if we have any events with funding
    const eventsWithNonZeroFunding = recentEvents.filter(item => item.calculatedFunding.totalFunding > 0);
    
    // If we have very few events with funding data but many events overall,
    // consider including older events or events without date information
    if (eventsWithNonZeroFunding.length < 5 && stateEvents.length > 10) {
      console.log(`Few recent funded events (${eventsWithNonZeroFunding.length}) for ${stateName}, expanding criteria`);
      
      // Add events that have funding but might not have dates or are older
      const additionalEvents = eventsWithFunding
        .filter(item => !recentEvents.includes(item) && item.calculatedFunding.totalFunding > 0)
        .sort((a, b) => b.calculatedFunding.totalFunding - a.calculatedFunding.totalFunding)
        .slice(0, 10); // Add up to 10 more events
      
      if (additionalEvents.length > 0) {
        console.log(`Adding ${additionalEvents.length} additional events for ${stateName}`);
        recentEvents = [...recentEvents, ...additionalEvents];
      }
    }
    
    // Sort by funding amount
    const sortedEvents = [...recentEvents].sort((a, b) => 
      b.calculatedFunding.totalFunding - a.calculatedFunding.totalFunding
    );
    
    // Log event counts and funding amounts
    console.log(`Found ${sortedEvents.length} events for ${stateName} chart, with ${eventsWithNonZeroFunding.length} funded events`);
    if (sortedEvents.length > 0) {
      console.log(`Top 3 funding amounts: ${sortedEvents.slice(0, 3).map(e => 
        `${e.formattedDate} ${e.event || 'Unnamed'}: $${Math.round(e.calculatedFunding.totalFunding).toLocaleString()}`
      ).join(', ')}`);
    }
    
    // Determine how many events to display based on data availability
    // More flexible than a fixed number
    const displayCount = sortedEvents.length <= 5 ? sortedEvents.length : 
                        (sortedEvents.length <= 15 ? Math.min(sortedEvents.length, 15) : 20);
    
    // Take the top events based on our dynamic count
    const topEvents = sortedEvents.slice(0, displayCount);
    
    // Map to the format needed for the chart
    const majorEventsForChart = topEvents.map(item => {
      const year = item.incident_start ? new Date(item.incident_start).getFullYear() : 
                  (item.year || 'Unknown');
      
      return {
        name: `${year} ${item.event || 'Unnamed Event'}`,
        incidentNumber: item.incident_number,
        ihpTotal: item.calculatedFunding.ihpTotal,
        paTotal: item.calculatedFunding.paTotal,
        cdbgDrTotal: item.calculatedFunding.cdbgDrAllocation,
        sbaTotal: item.calculatedFunding.sbaTotal,
        totalFunding: item.calculatedFunding.totalFunding,
        date: item.incident_start // Include the date for reference
      };
    });
    
    console.log(`Displaying ${majorEventsForChart.length} events in the chart for ${stateName}`);
    return {
      data: majorEventsForChart,
      dateRange: `${cutoffYear}-${currentYear}` // Return the date range for the chart title
    };
  }, [stateEvents, stateName, event.state]);

  // Format currency
  const formatCurrency = (amount: number, abbreviate = false) => {
    // Handle invalid or zero amounts
    if (!amount || isNaN(amount) || amount === 0) {
      return '$0';
    }
    
    if (abbreviate) {
      if (amount >= 1000000000) {
        return `$${(amount / 1000000000).toFixed(1)}B`;
      } else if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(1)}M`;
      } else if (amount >= 1000) {
        return `$${(amount / 1000).toFixed(1)}K`;
      }
    }
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Format number with commas
  const formatNumber = (num: number) => {
    if (!num || isNaN(num)) return '0';
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Reference to the fact sheet content
  const factSheetRef = useRef<HTMLDivElement>(null);

  // Download fact sheet as PDF
  const handleDownload = async () => {
    if (!factSheetRef.current) return;
    
    try {
      // Load libraries dynamically when needed
      const [html2canvas, jsPDF] = await Promise.all([
        import('html2canvas').then(module => module.default),
        import('jspdf').then(module => module.default)
      ]);

      // Show loading message
      const loadingToast = document.createElement('div');
      loadingToast.style.position = 'fixed';
      loadingToast.style.top = '20px';
      loadingToast.style.left = '50%';
      loadingToast.style.transform = 'translateX(-50%)';
      loadingToast.style.padding = '10px 20px';
      loadingToast.style.background = '#003A63';
      loadingToast.style.color = 'white';
      loadingToast.style.borderRadius = '4px';
      loadingToast.style.zIndex = '9999';
      loadingToast.textContent = 'Generating PDF...';
      document.body.appendChild(loadingToast);
      
      // Temporarily hide the download and share buttons for the capture
      const buttons = factSheetRef.current.querySelectorAll('button');
      buttons.forEach(button => button.style.display = 'none');
      
      // Give time for the DOM to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use html2canvas to capture the content
      const canvas = await html2canvas(factSheetRef.current, {
        scale: 2, // Higher scale for better quality
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      
      // Calculate dimensions for the PDF (Letter size: 8.5 x 11 inches)
      const imgWidth = 210; // A4 width in mm (standard for PDF)
      const imgHeight = canvas.height * imgWidth / canvas.width;
      
      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight);
      
      // Determine filename based on content
      let filename = 'disaster-fact-sheet.pdf';
      if (multipleEventsSelected) {
        filename = `disaster-comparison-${combinedFundingStats?.states.join('-')}.pdf`;
      } else {
        const stateName = event.state ? (stateNames[event.state as keyof typeof stateNames] || event.state) : 'unknown';
        const eventName = event.event ? event.event.replace(/\s+/g, '-').toLowerCase() : 'unnamed-event';
        filename = `disaster-fact-sheet-${stateName}-${eventName}.pdf`;
      }
      
      // Save the PDF
      pdf.save(filename);
      
      // Restore button visibility
      buttons.forEach(button => button.style.display = '');
      
      // Remove loading message
      document.body.removeChild(loadingToast);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('There was an error generating the PDF. Please try again.');
    }
  };

  // Share functionality
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Disaster Fact Sheet: ${event.event} in ${stateName}`,
        text: `Federal Disaster Spending in ${stateName}`,
        url: window.location.href
      }).catch(error => {
        console.log('Error sharing:', error);
      });
    } else {
      alert('Sharing not supported on this browser');
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'MMMM d, yyyy');
  };

  // State to hold congressional district data
  const [congressionalData, setCongressionalData] = useState<CongressionalDistrictData[]>([]);
  const [congressionalDataLoading, setCongressionalDataLoading] = useState(true);
  
  // Load congressional district funding data
  useEffect(() => {
    const loadCongressionalData = async () => {
      try {
        setCongressionalDataLoading(true);
        const response = await fetch('/data/ihp_funding_by_cd_2023_districts_2021_onwards.csv');
        const text = await response.text();
        
        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          complete: (results) => {
            const parsedData = results.data as CongressionalDistrictData[];
            setCongressionalData(parsedData.filter(item => 
              item.state_name && item.district_number !== undefined && item.total_funding
            ));
            setCongressionalDataLoading(false);
          },
          error: (error: Error) => {
            console.error('Error parsing congressional district data:', error);
            setCongressionalDataLoading(false);
          }
        });
      } catch (error) {
        console.error('Error loading congressional district data:', error);
        setCongressionalDataLoading(false);
      }
    };
    
    loadCongressionalData();
  }, []);
  
  // Filter congressional data based on selected states and apply sorting
  const relevantCongressionalData = useMemo(() => {
    if (!congressionalData.length) {
      console.log('Congressional data debug:', {
        congressionalDataLength: congressionalData.length,
        reason: 'No congressional data'
      });
      return [];
    }
    
    // Get unique state abbreviations from selected events OR the primary event
    let selectedStateAbbrs: string[] = [];
    
    if (selectedEvents.length > 0) {
      // Multiple events selected
      selectedStateAbbrs = Array.from(new Set(selectedEvents.map(e => e.state)));
    } else {
      // Single event - use the primary event's state
      selectedStateAbbrs = [primaryEvent.state];
    }
    
    // Get full state names for filtering
    const selectedStateNames = selectedStateAbbrs.map(abbr => 
      stateNames[abbr as keyof typeof stateNames] || abbr
    );
    
    console.log('Congressional data filtering:', {
      selectedStateAbbrs,
      selectedStateNames,
      availableStatesInCongressionalData: [...new Set(congressionalData.map(d => d.state_name))].slice(0, 10)
    });
    
    // Filter by selected states - check both state name and abbreviation
    const filteredData = congressionalData
      .filter(item => 
        selectedStateNames.includes(item.state_name) || 
        selectedStateAbbrs.includes(item.state_name)
      );
    
    console.log('Filtered congressional data:', {
      originalCount: congressionalData.length,
      filteredCount: filteredData.length,
      sampleResults: filteredData.slice(0, 3).map(d => ({
        state: d.state_name,
        district: d.district_label,
        rep: d.representative,
        funding: d.total_funding
      }))
    });
    
    // Apply sorting based on current sort settings
    const sortedData = [...filteredData].sort((a, b) => {
      if (sortField === 'funding') {
        const valueA = a.total_funding || 0;
        const valueB = b.total_funding || 0;
        return sortDirection === 'desc' ? valueB - valueA : valueA - valueB;
      } else {
        const valueA = a.total_applicants || 0;
        const valueB = b.total_applicants || 0;
        return sortDirection === 'desc' ? valueB - valueA : valueA - valueB;
      }
    });
    
    return sortedData.slice(0, 10); // Get top 10
  }, [congressionalData, selectedEvents, primaryEvent.state, stateNames, sortField, sortDirection]);

  // Get state name from abbreviation
  const getStateName = (abbr: string) => {
    return stateNames[abbr as keyof typeof stateNames] || abbr;
  };

  // Extract CDBG-DR recipients for the selected event
  const getCDBGRecipients = (event: DisasterData) => {
    interface CDBGRecipient {
      name: string;
      totalAmount: number;
      dates: string[];
    }
    
    const recipientMap = new Map<string, { totalAmount: number; dates: string[] }>();
    
    // Helper function to add recipients from a specific FRN
    const addRecipientsFromFRN = (frnNumber: number, frnDate?: string) => {
      for (let i = 1; i <= 9; i++) {
        const nameKey = `frn${frnNumber}_grantee${i}_name` as keyof DisasterData;
        const amountKey = `frn${frnNumber}_grantee${i}_amount` as keyof DisasterData;
        
        const name = event[nameKey] as string;
        const amount = event[amountKey] as number;
        
        if (name && amount && amount > 0) {
          const trimmedName = name.trim();
          const existingRecipient = recipientMap.get(trimmedName);
          
          if (existingRecipient) {
            // Add to existing recipient
            existingRecipient.totalAmount += amount;
            if (frnDate && frnDate !== 'Unknown' && !existingRecipient.dates.includes(frnDate)) {
              existingRecipient.dates.push(frnDate);
            }
          } else {
            // Create new recipient entry
            recipientMap.set(trimmedName, {
              totalAmount: amount,
              dates: frnDate && frnDate !== 'Unknown' ? [frnDate] : []
            });
          }
        }
      }
    };
    
    // Extract from all FRNs
    addRecipientsFromFRN(1, event.frn1_date);
    addRecipientsFromFRN(2, event.frn2_date);
    addRecipientsFromFRN(3, event.frn3_date);
    addRecipientsFromFRN(4, event.frn4_date);
    
    // Convert map to array and sort by total amount (highest first)
    const consolidatedRecipients: CDBGRecipient[] = Array.from(recipientMap.entries()).map(([name, data]) => {
      // Sort dates chronologically
      const sortedDates = data.dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      
      return {
        name,
        totalAmount: data.totalAmount,
        dates: sortedDates
      };
    });
    
    return consolidatedRecipients.sort((a, b) => b.totalAmount - a.totalAmount);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200 print:shadow-none relative" ref={factSheetRef}>
      {/* Export buttons */}
      <div className="absolute top-4 right-4 flex space-x-2 print:hidden">
        <button
          onClick={handleDownload}
          className="p-2 bg-[#003A63] text-white rounded-md hover:bg-[#002B4A] flex items-center"
        >
          <Download size={16} className="mr-1" />
          <span className="text-sm">Download</span>
        </button>
        <button
          onClick={handleShare}
          className="p-2 bg-[#00A79D] text-white rounded-md hover:bg-[#008F87] flex items-center"
        >
          <Share2 size={16} className="mr-1" />
          <span className="text-sm">Share</span>
        </button>
      </div>
      
      {/* Header - Show comparison title if multiple events are selected */}
      <div className="mb-6">
        <div className="text-sm text-gray-500 mb-1">
          {multipleEventsSelected ? 'Multi-Disaster Comparison' : 'Fact Sheet for'}
        </div>
        
        {multipleEventsSelected ? (
          <div>
            <h1 className="text-2xl font-bold text-[#003A63]">
              Comparing {combinedFundingStats?.eventCount} Disaster Events
            </h1>
            <div className="text-lg text-[#00A79D]">
              {combinedFundingStats?.states.join(', ')} • 
              {combinedFundingStats?.incidentTypes.length === 1 
                ? ` ${combinedFundingStats.incidentTypes[0]}s` 
                : ' Multiple Disaster Types'} • 
              {combinedFundingStats?.dateRange}
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold text-[#003A63]">
              {primaryEvent.event || 'Unnamed Event'} (#{primaryEvent.incident_number})
            </h1>
            <div className="text-lg text-[#00A79D]">
              {stateName} • {primaryEvent.incident_type} • Declaration Date: {formatDate(primaryEvent.declaration_date || primaryEvent.incident_start)}
            </div>
          </div>
        )}
      </div>
      
      {/* Stats Section - Show combined stats if multiple events are selected */}
      {multipleEventsSelected && combinedFundingStats ? (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-[#003A63]">Combined Disaster Funding</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-100 p-4 rounded-md">
              <h3 className="text-3xl font-bold text-[#00A79D]">
                {formatCurrency(combinedFundingStats.grandTotals.totalFunding, true)}
              </h3>
              <p className="text-gray-700">
                Total funding across all selected disasters
              </p>
            </div>
            
            <div className="bg-gray-100 p-4 rounded-md">
              <h3 className="text-3xl font-bold text-[#00A79D]">
                {formatCurrency(combinedFundingStats.grandTotals.ihpTotal, true)}
              </h3>
              <p className="text-gray-700">
                Total Individual & Household Assistance
              </p>
            </div>
            
            <div className="bg-gray-100 p-4 rounded-md">
              <h3 className="text-3xl font-bold text-[#00A79D]">
                {formatNumber(combinedFundingStats.grandTotals.totalApplicants)}
              </h3>
              <p className="text-gray-700">
                Total number of applicants across all selected disasters
              </p>
            </div>
          </div>
        </div>
      ) : null}
      
      {/* Total Funding by Source Section - Moved to top */}
      {(() => {
        // Calculate funding totals based on selection type
        let totalIHP = 0;
        let totalPA = 0;
        let totalCDBG = 0;
        let totalSBA = 0;

        if (multipleEventsSelected && combinedFundingStats) {
          // For multiple events, use the combined stats
          totalIHP = combinedFundingStats.grandTotals.ihpTotal;
          totalPA = combinedFundingStats.grandTotals.paTotal;
          totalCDBG = combinedFundingStats.grandTotals.cdbgDrTotal;
          totalSBA = combinedFundingStats.grandTotals.sbaTotal;
        } else {
          // For single event, use only the selected event's data
          totalIHP = typeof primaryEvent.ihp_total === 'number' ? primaryEvent.ihp_total :
                    (typeof primaryEvent.ihp_total === 'string' ? parseFloat(primaryEvent.ihp_total) || 0 : 0);
          totalPA = typeof primaryEvent.pa_total === 'number' ? primaryEvent.pa_total :
                   (typeof primaryEvent.pa_total === 'string' ? parseFloat(primaryEvent.pa_total) || 0 : 0);
          totalCDBG = typeof primaryEvent.cdbg_dr_allocation === 'number' ? primaryEvent.cdbg_dr_allocation :
                     (typeof primaryEvent.cdbg_dr_allocation === 'string' ? parseFloat(primaryEvent.cdbg_dr_allocation) || 0 : 0);
          totalSBA = typeof primaryEvent.sba_total_approved_loan_amount === 'number' ? primaryEvent.sba_total_approved_loan_amount :
                    (typeof primaryEvent.sba_total_approved_loan_amount === 'string' ? parseFloat(primaryEvent.sba_total_approved_loan_amount) || 0 : 0);
        }

        const grandTotal = totalIHP + totalPA + totalCDBG + (useSBAData ? totalSBA : 0);
        
        // Only show if there's actually funding data
        if (grandTotal > 0) {
          return (
            <div className="mb-8 border-t pt-8">
              <h2 className="text-xl font-bold mb-4 text-[#003A63]">Total Funding by Source</h2>

              {/* Summary cards */}
              <div className={`grid grid-cols-1 ${useSBAData ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3 mb-6`}>
                <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col h-24 justify-end">
                  <h4 className="text-sm font-semibold text-[#003A63] mb-2 line-clamp-2">Grand Total</h4>
                  <p className="text-xl font-bold text-[#00A79D] mt-auto">{formatCurrency(grandTotal)}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col h-24 justify-end">
                  <h4 className="text-sm font-semibold text-[#003A63] mb-2 line-clamp-2">FEMA Individual & Household Program</h4>
                  <p className="text-xl font-bold text-[#2171b5] mt-auto">{formatCurrency(totalIHP)}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col h-24 justify-end">
                  <h4 className="text-sm font-semibold text-[#003A63] mb-2 line-clamp-2">FEMA Public Assistance</h4>
                  <p className="text-xl font-bold text-[#41B6E6] mt-auto">{formatCurrency(totalPA)}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col h-24 justify-end">
                  <h4 className="text-sm font-semibold text-[#003A63] mb-2 line-clamp-2">HUD CDBG-DR</h4>
                  <p className="text-xl font-bold text-[#89684F] mt-auto">{formatCurrency(totalCDBG)}</p>
                </div>
                {useSBAData && (
                  <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col h-24 justify-end">
                    <h4 className="text-sm font-semibold text-[#003A63] mb-2 line-clamp-2">SBA Disaster Loans</h4>
                    <p className="text-xl font-bold text-[#228B22] mt-auto">{formatCurrency(totalSBA)}</p>
                  </div>
                )}
              </div>
              
              {/* Chart visualization */}
              <div className="mb-4">
                <FundingBreakdownChart
                  ihpTotal={totalIHP}
                  paTotal={totalPA}
                  cdbgTotal={totalCDBG}
                  sbaTotal={totalSBA}
                  useSBAData={useSBAData}
                />
              </div>
            </div>
          );
        }
        return null;
      })()}
      
      {/* Stats Section for single events - Moved below Total Funding by Source */}
      {!multipleEventsSelected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-100 p-4 rounded-md">
            <h3 className="text-3xl font-bold text-[#00A79D]">
              {formatCurrency(eventStats.avgAssistance)}
            </h3>
            <p className="text-gray-700">
              Average assistance to households for this disaster
            </p>
          </div>
          
          <div className="bg-gray-100 p-4 rounded-md">
            <h3 className="text-3xl font-bold text-[#00A79D]">
              {formatNumber(eventStats.totalApplicants)}
            </h3>
            <p className="text-gray-700">
              Total number of applicants for this disaster
            </p>
          </div>
          
          <div className="bg-gray-100 p-4 rounded-md">
            <h3 className="text-3xl font-bold text-[#00A79D]">
              {eventStats.similarDisastersCount}
            </h3>
            <p className="text-gray-700">
              Similar disasters nationwide in the past 5 years
            </p>
          </div>
        </div>
      )}
      
      {/* HUD CDBG-DR Recipients Section - For single events only */}
      {!multipleEventsSelected && (() => {
        const cdbgRecipients = getCDBGRecipients(primaryEvent);
        const hasCDBGData = cdbgRecipients.length > 0;
        
        return hasCDBGData ? (
          <div className="mb-8 border-t pt-8 border-b pb-8">
            <h2 className="text-xl font-bold mb-4 text-[#003A63]">
              HUD CDBG-DR Grant Recipients
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-md">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="py-3 px-4 border-b text-left font-semibold">Recipient</th>
                    <th className="py-3 px-4 border-b text-right font-semibold">Total Grant Amount</th>
                    <th className="py-3 px-4 border-b text-left font-semibold">Award Dates</th>
                  </tr>
                </thead>
                <tbody>
                  {cdbgRecipients.map((recipient, index) => (
                    <tr key={`${recipient.name}-${index}`} 
                        className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="py-3 px-4 border-b">
                        <div className="font-medium text-gray-900">
                          {recipient.name}
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b text-right">
                        <div className="font-bold text-[#00A79D]">
                          {formatCurrency(recipient.totalAmount)}
                        </div>
                      </td>
                      <td className="py-3 px-4 border-b">
                        <div className="text-gray-700">
                          {recipient.dates.length > 0 ? recipient.dates.map(date => formatDate(date)).join(', ') : 'Unknown'}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {cdbgRecipients.length > 1 && (
                    <tr className="bg-gray-100 font-bold">
                      <td className="py-3 px-4 border-t border-gray-300">
                        Total CDBG-DR Funding
                      </td>
                      <td className="py-3 px-4 border-t border-gray-300 text-right text-[#003A63]">
                        {formatCurrency(cdbgRecipients.reduce((sum, r) => sum + r.totalAmount, 0))}
                      </td>
                      <td className="py-3 px-4 border-t border-gray-300"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null;
      })()}
      
      {/* Major Storms Section - Using Highcharts */}
      <div className="mb-8 border-b pb-8">
        <h2 className="text-xl font-bold mb-4 text-[#003A63]">
          Funding for Major Disasters by Source in {stateName}
        </h2>
        <DisasterFundingChart
          data={majorStormsData.data}
          dateRange={majorStormsData.dateRange}
          title=""
          useSBAData={useSBAData}
        />
      </div>
      
      {/* All Selected Disasters comparison table */}
      {multipleEventsSelected && combinedFundingStats && (
        <div className="overflow-x-auto mb-8">
          <h3 className="text-lg font-bold mb-2 text-[#003A63]">All Selected Disasters</h3>
          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-[#003A63] text-white">
                <th className="py-2 px-4 text-left">Disaster</th>
                <th className="py-2 px-4 text-left">Location</th>
                <th className="py-2 px-4 text-left">Type</th>
                <th className="py-2 px-4 text-right">Date</th>
                <th className="py-2 px-4 text-right">Total Funding</th>
              </tr>
            </thead>
            <tbody>
              {combinedFundingStats.totalsByEvent.map((item, index) => (
                <tr key={item.incident_number} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="py-2 px-4 border-t border-gray-200">{item.name}</td>
                  <td className="py-2 px-4 border-t border-gray-200">{item.stateName}</td>
                  <td className="py-2 px-4 border-t border-gray-200">{item.incidentType}</td>
                  <td className="py-2 px-4 border-t border-gray-200 text-right">
                    {item.date ? formatDate(item.date) : 'Unknown'}
                  </td>
                  <td className="py-2 px-4 border-t border-gray-200 text-right">
                    {formatCurrency(item.totalFunding)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-bold">
                <td className="py-2 px-4 border-t border-gray-200" colSpan={4}>
                  Total
                </td>
                <td className="py-2 px-4 border-t border-gray-200 text-right">
                  {formatCurrency(combinedFundingStats.grandTotals.totalFunding)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      
      {/* Congressional District Section - Shows for both single and multiple events */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 text-[#003A63]">
          Top Congressional Districts in {stateName} by Disaster Assistance (2021-Present)
        </h2>
        
        {congressionalDataLoading ? (
          <div className="flex justify-center items-center h-24">
            <p className="text-gray-500">Loading congressional data...</p>
          </div>
        ) : relevantCongressionalData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border border-gray-200 rounded-md">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-2 px-4 border-b text-left">Representative</th>
                  <th className="py-2 px-4 border-b text-left">District</th>
                  <th className="py-2 px-4 border-b text-left">Party</th>
                  <th 
                    className="py-2 px-4 border-b text-right cursor-pointer group"
                    onClick={() => toggleSort('funding')}
                  >
                    <div className="flex items-center justify-end">
                      Total Funding
                      <span className="ml-1">
                        {sortField === 'funding' ? (
                          sortDirection === 'desc' ? '▼' : '▲'
                        ) : ''}
                      </span>
                    </div>
                  </th>
                  <th 
                    className="py-2 px-4 border-b text-right cursor-pointer group"
                    onClick={() => toggleSort('applicants')}
                  >
                    <div className="flex items-center justify-end">
                      Applicants
                      <span className="ml-1">
                        {sortField === 'applicants' ? (
                          sortDirection === 'desc' ? '▼' : '▲'
                        ) : ''}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {relevantCongressionalData.map((district, index) => (
                  <tr key={`${district.state_name}-${district.district_number}`} 
                      className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-2 px-4 border-b">
                      {district.representative || 'Unknown'}
                    </td>
                    <td className="py-2 px-4 border-b">
                      {district.district_label || `${district.state_name} District ${district.district_number}`}
                    </td>
                    <td className="py-2 px-4 border-b">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        district.party === 'Republican' 
                          ? 'bg-red-100 text-red-800' 
                          : district.party === 'Democratic' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-gray-100 text-gray-800'
                      }`}>
                        {district.party || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-2 px-4 border-b text-right font-medium">
                      {formatCurrency(district.total_funding || 0)}
                    </td>
                    <td className="py-2 px-4 border-b text-right">
                      {formatNumber(district.total_applicants || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 text-xs text-gray-500">
              Click column headers to sort by funding or applicants
            </div>
          </div>
        ) : (
          <div className="p-4 border rounded-md bg-gray-50 text-center">
            <p className="text-gray-600">No congressional district data available for the selected states.</p>
          </div>
        )}
      </div>
      
      {/* Annual Funding Stats - Display for both single and multiple events */}
      <div className="mb-8 bg-gray-50 p-6 rounded-lg">
        <h3 className="text-3xl font-bold text-[#003A63] mb-2">
          {formatCurrency(federalSpendStats.annualAverage, true)}
        </h3>
        <p className="text-gray-700 mb-4">
          {federalSpendStats.yearsSpan <= 1 ? (
            // For a single year or less
            `In ${federalSpendStats.latestYear}, the federal government allocated ${formatCurrency(federalSpendStats.totalFunding)} to ${stateName} for disaster recovery.`
          ) : (
            // For multiple years
            `Between ${federalSpendStats.earliestYear} and ${federalSpendStats.latestYear}, the federal government has provided an average of ${formatCurrency(federalSpendStats.annualAverage)} per year to ${stateName} for disaster recovery, totaling ${formatCurrency(federalSpendStats.totalFunding)} over ${federalSpendStats.yearsSpan} years.`
          )}
        </p>
        <div className="text-xs text-gray-500">
          Note: This analysis includes {stateEvents.length} disaster events recorded in the database for {stateName}.
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-8 text-sm text-gray-500">
      </div>
    </div>
  );
};

export default FactSheetDisplay; 