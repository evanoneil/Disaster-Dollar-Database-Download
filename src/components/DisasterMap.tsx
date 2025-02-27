import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl, { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface DisasterData {
  state: string;
  incident_type: string;
  ihp_total: number;
  pa_total: number;
  cdbg_dr_total: number;
  [key: string]: any; // Allow other properties
}

interface DisasterMapProps {
  filteredData: DisasterData[];
  stateNames: Record<string, string>;
  selectedFundingTypes: string[];
}

interface StateData {
  count: number;
  funding: number;
  types: Record<string, number>;
  typesFunding: Record<string, number>;
}

// Use a simpler approach to avoid TypeScript errors with GeoJSON
type GeoJSONFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: string;
    properties: Record<string, any>;
    geometry: any;
  }>;
};

// Jenks natural breaks classification algorithm
function getJenksBreaks(data: number[], numClasses: number): number[] {
  // Sort the data
  data = [...data].sort((a, b) => a - b);
  
  // Remove duplicates
  data = [...new Set(data)];
  
  // If we have fewer unique values than classes, return the unique values
  if (data.length <= numClasses) {
    return data;
  }
  
  // Initialize matrices
  const lowerClassLimits: number[][] = Array(data.length + 1)
    .fill(0)
    .map(() => Array(numClasses + 1).fill(0));
  
  const varianceCombinations: number[][] = Array(data.length + 1)
    .fill(0)
    .map(() => Array(numClasses + 1).fill(0));
  
  // Initialize first row of matrices
  for (let i = 1; i <= numClasses; i++) {
    lowerClassLimits[1][i] = 1;
    varianceCombinations[1][i] = 0;
  }
  
  // Initialize first column of matrices
  for (let i = 2; i <= data.length; i++) {
    lowerClassLimits[i][1] = 1;
    varianceCombinations[i][1] = 0;
    
    for (let j = 0; j < i; j++) {
      varianceCombinations[i][1] += Math.pow(data[i - 1] - (data.slice(0, i).reduce((a, b) => a + b, 0) / i), 2);
    }
  }
  
  // Calculate the rest of the matrices
  for (let l = 2; l <= numClasses; l++) {
    for (let m = 2; m <= data.length; m++) {
      let lowerClassLimit = 0;
      let varianceCombination = 0;
      
      for (let j = 1; j <= m - 1; j++) {
        const variance = 0;
        const mean = 0;
        
        // Calculate variance for the potential split
        const subData = data.slice(j, m);
        const subMean = subData.reduce((a, b) => a + b, 0) / subData.length;
        const subVariance = subData.reduce((a, b) => a + Math.pow(b - subMean, 2), 0);
        
        const totalVariance = varianceCombinations[j][l - 1] + subVariance;
        
        if (lowerClassLimit === 0 || totalVariance < varianceCombination) {
          lowerClassLimit = j;
          varianceCombination = totalVariance;
        }
      }
      
      lowerClassLimits[m][l] = lowerClassLimit;
      varianceCombinations[m][l] = varianceCombination;
    }
  }
  
  // Extract the breaks from the matrices
  const breaks: number[] = [data[0]];
  let k = data.length;
  
  for (let i = numClasses; i > 1; i--) {
    breaks.push(data[lowerClassLimits[k][i] - 1]);
    k = lowerClassLimits[k][i] - 1;
  }
  
  // Add the maximum value
  if (breaks[breaks.length - 1] !== data[data.length - 1]) {
    breaks.push(data[data.length - 1]);
  }
  
  // Ensure we have the right number of breaks
  while (breaks.length < numClasses + 1) {
    breaks.push(breaks[breaks.length - 1]);
  }
  
  // Sort breaks in ascending order
  return breaks.sort((a, b) => a - b);
}

// Simplified Jenks implementation for better performance
function getSimplifiedBreaks(data: number[], numClasses: number): number[] {
  // Remove zeros and sort the data
  const nonZeroData = data.filter(d => d > 0).sort((a, b) => a - b);
  
  if (nonZeroData.length === 0) {
    return [0, 1, 10, 100, 1000, 10000, 100000, 1000000];
  }
  
  // If we have fewer unique values than classes, use quantiles
  if (nonZeroData.length <= numClasses) {
    return [0, ...nonZeroData];
  }
  
  const min = nonZeroData[0];
  const max = nonZeroData[nonZeroData.length - 1];
  
  console.log(`Funding range: min=${min}, max=${max}`);
  
  // Create more meaningful breaks
  const breaks = [0]; // Always start with 0
  
  // If the range is very large (more than 6 orders of magnitude), use logarithmic scale
  if (max / min > 1000000) {
    const logMin = Math.log10(Math.max(1, min));
    const logMax = Math.log10(max);
    const logRange = logMax - logMin;
    
    for (let i = 1; i <= numClasses; i++) {
      const logValue = logMin + (i / numClasses) * logRange;
      const value = Math.pow(10, logValue);
      breaks.push(value);
    }
  } else {
    // Use quantiles for more evenly distributed breaks
    for (let i = 1; i <= numClasses; i++) {
      const index = Math.floor((i / numClasses) * nonZeroData.length) - 1;
      const value = nonZeroData[Math.max(0, index)];
      breaks.push(value);
    }
  }
  
  // Ensure max is included
  if (breaks[breaks.length - 1] < max) {
    breaks[breaks.length - 1] = max;
  }
  
  // Round breaks to nice numbers
  return breaks.map(b => {
    if (b === 0) return 0;
    const magnitude = Math.pow(10, Math.floor(Math.log10(b)));
    return Math.ceil(b / magnitude) * magnitude;
  });
}

const DisasterMap: React.FC<DisasterMapProps> = ({ filteredData, stateNames, selectedFundingTypes }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [statesGeoJson, setStatesGeoJson] = useState<GeoJSONFeatureCollection | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const [colorBreaks, setColorBreaks] = useState<number[]>([0, 100, 10000, 100000, 500000, 1000000, 10000000, 50000000]);
  const [colorScale, setColorScale] = useState<string[]>([
    '#ffffff', // No funding (0)
    '#eef8ff', // Very low
    '#d0e6f7', // Low
    '#a6d0f5', // Low-medium
    '#6baed6', // Medium
    '#4292c6', // Medium-high
    '#2171b5', // High
    '#084594', // Very high
    '#041e42'  // Extremely high
  ]);
  const [dynamicThresholds, setDynamicThresholds] = useState<number[]>([0, 100, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 5000000000]);
  
  // Function to create a color expression with literal values
  const createColorExpression = useCallback((thresholds: number[] = [0, 1, 10, 100, 1000, 10000, 100000, 1000000, 10000000]) => {
    // Create a complete interpolate expression with the provided thresholds
    const expression: any[] = [
      'interpolate',
      ['linear'],
      ['get', 'state_funding']
    ];
    
    // Add color stops for each threshold
    const colors = [
      '#ffffff', // No funding (0)
      '#eef8ff', // Very low
      '#d0e6f7', // Low
      '#a6d0f5', // Low-medium
      '#6baed6', // Medium
      '#4292c6', // Medium-high
      '#2171b5', // High
      '#084594', // Very high
      '#041e42'  // Extremely high
    ];
    
    // Ensure we have enough colors for all thresholds
    while (colors.length < thresholds.length) {
      colors.push(colors[colors.length - 1]);
    }
    
    // Add each threshold and its corresponding color to the expression
    for (let i = 0; i < thresholds.length; i++) {
      expression.push(thresholds[i]);
      expression.push(colors[i]);
    }
    
    return expression;
  }, []);
  
  // Function to update the color stops based on dynamic thresholds
  const updateColorStops = useCallback((map: maplibregl.Map, thresholds: number[]) => {
    if (!map.getLayer('states-layer')) return;
    
    // Create a new color expression with the current thresholds
    const newColorExpression = createColorExpression(thresholds);
    
    // Update the entire fill-color property with the new expression
    map.setPaintProperty('states-layer', 'fill-color', newColorExpression);
    
    console.log('Updated color expression with thresholds:', thresholds);
  }, [createColorExpression]);
  
  // Map of FIPS state codes to state abbreviations
  const stateIdToAbbr: Record<string, string> = useMemo(() => ({
    '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', 
    '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', 
    '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', 
    '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', 
    '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', 
    '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', 
    '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', 
    '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', 
    '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', 
    '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', 
    '56': 'WY'
  }), []);

  // Calculate dynamic thresholds based on the current filtered data
  const calculateDynamicThresholds = useCallback((stateData: Record<string, StateData>) => {
    const fundingValues = Object.values(stateData).map(d => d.funding).filter(f => f > 0);
    
    if (fundingValues.length === 0) {
      return [0, 100, 10000, 100000, 1000000, 10000000, 100000000, 1000000000, 5000000000];
    }
    
    // Find the maximum funding value
    const max = Math.max(...fundingValues);
    
    console.log(`Maximum funding value: ${max}`);
    
    // Create a more aggressive scale based on the maximum funding value
    // This ensures the state with the highest funding is always the darkest color
    // and more states will appear with darker colors
    const thresholds = [
      0,                // No funding
      max * 0.0001,     // 0.01% of max - much lower starting point
      max * 0.001,      // 0.1% of max
      max * 0.01,       // 1% of max
      max * 0.05,       // 5% of max
      max * 0.1,        // 10% of max
      max * 0.25,       // 25% of max
      max * 0.5,        // 50% of max
      max               // 100% of max (darkest color)
    ];
    
    // Round thresholds to nice numbers (except the max value)
    const roundedThresholds = thresholds.map((t, i) => {
      if (t === 0) return 0;
      if (i === thresholds.length - 1) return max; // Keep max value exact
      
      const magnitude = Math.pow(10, Math.floor(Math.log10(t)));
      return Math.ceil(t / magnitude) * magnitude;
    });
    
    console.log('Final thresholds:', roundedThresholds);
    return roundedThresholds;
  }, []);

  // Aggregate data by state
  const getStateData = useMemo(() => () => {
    const stateData: Record<string, StateData> = {};
    
    // Debug: Log the filtered data to check if it contains funding information
    console.log('Filtered data for map:', filteredData.slice(0, 5));
    console.log('Selected funding types:', selectedFundingTypes);
    
    // Track territories with high funding for debugging
    const territoriesData: Record<string, number> = {};
    
    filteredData.forEach(item => {
      const state = item.state;
      if (!state) return;
      
      // Skip territories not in our stateNames list (which only includes US states)
      if (!stateNames[state]) {
        // Track territory funding for debugging
        if (!territoriesData[state]) {
          territoriesData[state] = 0;
        }
        
        // Calculate funding based on selected funding types
        let territoryFunding = 0;
        
        if (selectedFundingTypes.includes('ihp')) {
          const ihpTotal = typeof item.ihp_total === 'number' ? item.ihp_total : 
                          (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);
          territoryFunding += ihpTotal;
        }
        
        if (selectedFundingTypes.includes('pa')) {
          const paTotal = typeof item.pa_total === 'number' ? item.pa_total : 
                         (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0);
          territoryFunding += paTotal;
        }
        
        if (selectedFundingTypes.includes('cdbg_dr')) {
          const cdbgDrTotal = typeof item.cdbg_dr_total === 'number' ? item.cdbg_dr_total : 
                             (typeof item.cdbg_dr_total === 'string' ? parseFloat(item.cdbg_dr_total) || 0 : 0);
          territoryFunding += cdbgDrTotal;
        }
        
        territoriesData[state] += territoryFunding;
        
        return;
      }
      
      if (!stateData[state]) {
        stateData[state] = { 
          count: 0,
          funding: 0,
          types: {},
          typesFunding: {}
        };
      }
      
      stateData[state].count += 1;
      
      // Calculate total funding based on selected funding types
      let totalFunding = 0;
      let ihpTotal = 0;
      let paTotal = 0;
      let cdbgDrTotal = 0;
      
      if (selectedFundingTypes.includes('ihp')) {
        ihpTotal = typeof item.ihp_total === 'number' ? item.ihp_total : 
                  (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);
        totalFunding += ihpTotal;
      }
      
      if (selectedFundingTypes.includes('pa')) {
        paTotal = typeof item.pa_total === 'number' ? item.pa_total : 
                 (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0);
        totalFunding += paTotal;
      }
      
      if (selectedFundingTypes.includes('cdbg_dr')) {
        cdbgDrTotal = typeof item.cdbg_dr_total === 'number' ? item.cdbg_dr_total : 
                     (typeof item.cdbg_dr_total === 'string' ? parseFloat(item.cdbg_dr_total) || 0 : 0);
        totalFunding += cdbgDrTotal;
      }
      
      // Debug: Log individual funding values
      if (totalFunding > 0) {
        console.log(`Funding for ${state}: IHP=${ihpTotal}, PA=${paTotal}, CDBG-DR=${cdbgDrTotal}, Total=${totalFunding}`);
      }
      
      stateData[state].funding += totalFunding;
      
      const incidentType = item.incident_type;
      if (incidentType) {
        if (!stateData[state].types[incidentType]) {
          stateData[state].types[incidentType] = 0;
          stateData[state].typesFunding[incidentType] = 0;
        }
        stateData[state].types[incidentType] += 1;
        stateData[state].typesFunding[incidentType] += totalFunding;
      }
    });
    
    // Log territories data for debugging
    console.log('Territories funding data (excluded from map):', territoriesData);
    
    // Debug: Log the aggregated state data to check funding values
    console.log('Aggregated state data:', stateData);
    
    return stateData;
  }, [filteredData, stateNames, selectedFundingTypes]);

  // Update dynamic thresholds when filtered data changes
  useEffect(() => {
    const stateData = getStateData();
    const newThresholds = calculateDynamicThresholds(stateData);
    
    // Ensure thresholds are unique and strictly ascending
    const uniqueThresholds = [...new Set(newThresholds)].sort((a, b) => a - b);
    
    setDynamicThresholds(uniqueThresholds);
    console.log('Updated dynamic thresholds:', uniqueThresholds);
  }, [filteredData, getStateData, calculateDynamicThresholds]);

  // Load GeoJSON data
  useEffect(() => {
    fetch('/data/us-states.geojson')
      .then(response => response.json())
      .then((data: GeoJSONFeatureCollection) => {
        // Debug: Log the first few features to check their structure
        console.log('GeoJSON first few features:', data.features.slice(0, 3));
        setStatesGeoJson(data);
      })
      .catch(error => {
        console.error('Error loading GeoJSON:', error);
      });
  }, []);

  // Initialize map when component mounts and GeoJSON is loaded
  useEffect(() => {
    if (!mapContainer.current || !statesGeoJson) return;
    
    if (map.current) return; // Initialize map only once
    
    const stateData = getStateData();
    
    // Create map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#ffffff' // Plain white background
            }
          }
        ]
      },
      center: [-98.5795, 39.8283], // Center of the US
      zoom: 3
    });

    // Add states layer when map loads
    map.current.on('load', () => {
      if (!map.current || !statesGeoJson) return;
      
      // Add state funding properties to the GeoJSON for use in the style expression
      const features = statesGeoJson.features.map((feature) => {
        const stateId = feature.id as string;
        const stateAbbr = stateIdToAbbr[stateId];
        const funding = stateAbbr && stateData[stateAbbr] ? stateData[stateAbbr].funding : 0;
        
        // Debug: Log each state's funding value
        console.log(`State ${stateAbbr} (ID: ${stateId}) funding: ${funding}`);
        
        return {
          ...feature,
          properties: {
            ...feature.properties,
            state_funding: funding,
            state_abbr: stateAbbr // Add state abbreviation to properties for easier access
          }
        };
      });
      
      // Add the states source
      map.current.addSource('states', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features
        }
      });
      
      // Create a color expression with the current dynamic thresholds
      const colorExpression = createColorExpression(dynamicThresholds);
      
      // Add the choropleth layer with linear color scale
      map.current.addLayer({
        id: 'states-layer',
        type: 'fill',
        source: 'states',
        paint: {
          'fill-color': colorExpression,
          'fill-opacity': 0.8,
          'fill-outline-color': '#000'
        }
      });
      
      // No need to call updateColorStops here since we're already using the current thresholds
      
      // Add state borders layer
      map.current.addLayer({
        id: 'state-borders',
        type: 'line',
        source: 'states',
        layout: {},
        paint: {
          'line-color': '#000',
          'line-width': 1
        }
      });
      
      // Add hover effect
      map.current.on('mousemove', 'states-layer', (e) => {
        if (!e.features || e.features.length === 0 || !map.current) return;
        
        // Remove existing popup if there is one
        if (popup.current) {
          popup.current.remove();
        }
        
        const feature = e.features[0];
        // Use the state_abbr property we added earlier instead of looking up by ID
        const stateAbbr = feature.properties.state_abbr;
        
        if (!stateAbbr) {
          console.error('No state abbreviation found for feature:', feature);
          return;
        }
        
        const stateName = stateNames[stateAbbr] || stateAbbr;
        const stateStats = stateData[stateAbbr];
        
        let html = `<strong>${stateName}</strong><br>`;
        
        if (stateStats) {
          const formattedFunding = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
          }).format(stateStats.funding);
          
          html += `Total Events: ${stateStats.count}<br>`;
          html += `Total Funding: ${formattedFunding}<br><br>`;
          
          // Add funding breakdown by type if available
          const ihpTotal = filteredData
            .filter(item => item.state === stateAbbr && selectedFundingTypes.includes('ihp'))
            .reduce((sum, item) => {
              const ihp = typeof item.ihp_total === 'number' ? item.ihp_total : 
                        (typeof item.ihp_total === 'string' ? parseFloat(item.ihp_total) || 0 : 0);
              return sum + ihp;
            }, 0);
            
          const paTotal = filteredData
            .filter(item => item.state === stateAbbr && selectedFundingTypes.includes('pa'))
            .reduce((sum, item) => {
              const pa = typeof item.pa_total === 'number' ? item.pa_total : 
                       (typeof item.pa_total === 'string' ? parseFloat(item.pa_total) || 0 : 0);
              return sum + pa;
            }, 0);
            
          const cdbgDrTotal = filteredData
            .filter(item => item.state === stateAbbr && selectedFundingTypes.includes('cdbg_dr'))
            .reduce((sum, item) => {
              const cdbgDr = typeof item.cdbg_dr_total === 'number' ? item.cdbg_dr_total : 
                           (typeof item.cdbg_dr_total === 'string' ? parseFloat(item.cdbg_dr_total) || 0 : 0);
              return sum + cdbgDr;
            }, 0);
          
          html += '<strong>Funding Breakdown:</strong><br>';
          
          if (selectedFundingTypes.includes('ihp')) {
            const formattedIHP = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0
            }).format(ihpTotal);
            html += `IHP: ${formattedIHP}<br>`;
          }
          
          if (selectedFundingTypes.includes('pa')) {
            const formattedPA = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0
            }).format(paTotal);
            html += `PA: ${formattedPA}<br>`;
          }
          
          if (selectedFundingTypes.includes('cdbg_dr')) {
            const formattedCDBG = new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0
            }).format(cdbgDrTotal);
            html += `CDBG-DR: ${formattedCDBG}<br>`;
          }
          
          html += '<br><strong>By Disaster Type:</strong><br>';
          
          Object.entries(stateStats.types)
            .sort((a, b) => stateStats.typesFunding[b[0]] - stateStats.typesFunding[a[0]])
            .forEach(([type, count]) => {
              const typeFunding = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0
              }).format(stateStats.typesFunding[type]);
              
              html += `${type}: ${count} events (${typeFunding})<br>`;
            });
        } else {
          html += 'No disaster data available';
        }
        
        // Create and store the popup
        popup.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false
        })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map.current);
      });
      
      // Change cursor on hover
      map.current.on('mouseenter', 'states-layer', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = 'pointer';
        }
      });
      
      // Remove popup when mouse leaves the states layer
      map.current.on('mouseleave', 'states-layer', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = '';
        }
        
        // Remove the popup when mouse leaves the states layer
        if (popup.current) {
          popup.current.remove();
          popup.current = null;
        }
      });
    });
    
    // Clean up the map when component unmounts
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      if (popup.current) {
        popup.current.remove();
        popup.current = null;
      }
    };
  }, [statesGeoJson, filteredData, stateNames, getStateData, stateIdToAbbr, dynamicThresholds, createColorExpression]);

  // Update map when filtered data changes
  useEffect(() => {
    if (!map.current || !statesGeoJson) return;
    
    // Wait for the map style to be fully loaded
    if (!map.current.isStyleLoaded()) {
      // If style isn't loaded yet, wait for the style.load event
      const onStyleLoad = () => {
        updateMapData();
        map.current?.off('style.load', onStyleLoad);
      };
      map.current.on('style.load', onStyleLoad);
      return;
    }
    
    updateMapData();
    
    function updateMapData() {
      if (!map.current || !statesGeoJson) return;
      
      const stateData = getStateData();
      
      // Update the state funding properties in the GeoJSON
      const features = statesGeoJson.features.map((feature) => {
        const stateId = feature.id as string;
        const stateAbbr = stateIdToAbbr[stateId];
        const funding = stateAbbr && stateData[stateAbbr] ? stateData[stateAbbr].funding : 0;
        
        return {
          ...feature,
          properties: {
            ...feature.properties,
            state_funding: funding,
            state_abbr: stateAbbr // Add state abbreviation to properties for easier access
          }
        };
      });
      
      // Update the source data with the new properties
      const source = map.current?.getSource('states');
      if (source && 'setData' in source) {
        (source as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features
        });
      }
      
      // Update the color stops with the current dynamic thresholds
      if (map.current?.getLayer('states-layer')) {
        updateColorStops(map.current, dynamicThresholds);
      }
    }
  }, [filteredData, statesGeoJson, getStateData, stateIdToAbbr, dynamicThresholds, updateColorStops]);

  // Effect to update color stops when dynamic thresholds change
  useEffect(() => {
    if (map.current && map.current.isStyleLoaded() && map.current.getLayer('states-layer')) {
      updateColorStops(map.current, dynamicThresholds);
    }
  }, [dynamicThresholds, updateColorStops]);

  // Format a number as currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Format large numbers with abbreviations
  const formatLargeNumber = (num: number): string => {
    if (num >= 1000000000) {
      return `$${(num / 1000000000).toFixed(1)}B`;
    } else if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `$${(num / 1000).toFixed(1)}K`;
    } else {
      return `$${num}`;
    }
  };

  return (
    <div className="relative">
      {/* Increase the map height */}
      <div 
        ref={mapContainer} 
        className="w-full rounded-lg shadow-md" 
        style={{ height: '500px' }} // Increased from previous height
      />
      
      {/* Update the legend to be linear instead of discrete boxes */}
      <div className="absolute bottom-4 right-4 bg-white p-3 rounded shadow-md z-10 text-xs">
        <h3 className="font-bold mb-2 text-sm">Disaster Funding by State</h3>
        
        {/* Linear gradient legend instead of discrete boxes */}
        <div className="flex flex-col space-y-1">
          <div 
            className="h-6 rounded-sm mb-1" 
            style={{ 
              background: 'linear-gradient(to right, #ffffff, #f7fbff, #deebf7, #c6dbef, #9ecae1, #6baed6, #4292c6, #2171b5, #08519c)',
              width: '100%' // Full width of the container
            }} 
          />
          <div className="flex justify-between text-[10px] w-full">
            <span>$0</span>
            <span>{formatLargeNumber(dynamicThresholds[Math.floor(dynamicThresholds.length / 2)])}</span>
            <span>{formatLargeNumber(dynamicThresholds[dynamicThresholds.length - 1])}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisasterMap; 