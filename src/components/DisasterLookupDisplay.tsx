"use client";

import * as React from 'react';
import { useMemo, useRef } from 'react';
import { Download, Share2 } from 'lucide-react';
import { format, subYears } from 'date-fns';
import FundingBreakdownChart from './FundingBreakdownChart';

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
  year?: number | null;
  ihp_applicants?: number;
  ihp_average_award?: number;
  _derivedTypes?: string[];
}

interface DisasterLookupDisplayProps {
  event: DisasterData;
  allEvents: DisasterData[];
  stateNames: Record<string, string>;
  useSBAData?: boolean;
  displayName?: string;
}

const formatCurrency = (amount: number, abbreviate = false) => {
  if (!amount || isNaN(amount) || amount === 0) return '$0';
  if (abbreviate) {
    if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(2)}B`;
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount);
};

const formatNumber = (num: number) => {
  if (!num || isNaN(num)) return '0';
  return new Intl.NumberFormat('en-US').format(num);
};

const formatDateLong = (s: string) => {
  if (!s) return 'N/A';
  return format(new Date(s), 'MMMM d, yyyy');
};

const DisasterLookupDisplay: React.FC<DisasterLookupDisplayProps> = ({
  event,
  allEvents,
  stateNames,
  useSBAData = false,
  displayName,
}) => {
  const stateName = stateNames[event.state as keyof typeof stateNames] || event.state;
  const primaryEvent = event;
  const headerTitle = displayName || primaryEvent.event || 'Unnamed Event';

  const sameTypeRecentEvents = useMemo(() => {
    const fiveYearsAgo = subYears(new Date(), 5);
    const eventTypes = event._derivedTypes && event._derivedTypes.length
      ? event._derivedTypes
      : (event.incident_type ? [event.incident_type] : []);
    if (eventTypes.length === 0) return [];
    return allEvents.filter(item => {
      if (!item.incident_start) return false;
      const date = new Date(item.incident_start);
      if (date < fiveYearsAgo) return false;
      const itemTypes = item._derivedTypes && item._derivedTypes.length
        ? item._derivedTypes
        : (item.incident_type ? [item.incident_type] : []);
      return itemTypes.some(t => eventTypes.includes(t));
    });
  }, [allEvents, event._derivedTypes, event.incident_type]);

  const eventStats = useMemo(() => {
    const totalIhpAmount = primaryEvent.ihp_total || 0;
    let applicants = primaryEvent.ihp_applicants || 0;
    let avgAssistance = 0;

    if (primaryEvent.ihp_average_award && primaryEvent.ihp_average_award > 0) {
      avgAssistance = primaryEvent.ihp_average_award;
      if (!applicants && totalIhpAmount > 0 && avgAssistance > 0) {
        applicants = Math.round(totalIhpAmount / avgAssistance);
      }
    } else if (applicants > 0 && totalIhpAmount > 0) {
      avgAssistance = totalIhpAmount / applicants;
    } else if (!applicants && totalIhpAmount > 0) {
      const nationalAveragesByType = {
        hurricane: 5372, flood: 4467, wildfire: 6198, tornado: 3975, default: 4103
      };
      let est = nationalAveragesByType.default;
      if (primaryEvent.incident_type) {
        const t = primaryEvent.incident_type.toLowerCase();
        if (t.includes('hurricane') || t.includes('typhoon')) est = nationalAveragesByType.hurricane;
        else if (t.includes('flood')) est = nationalAveragesByType.flood;
        else if (t.includes('fire') || t.includes('wildfire')) est = nationalAveragesByType.wildfire;
        else if (t.includes('tornado')) est = nationalAveragesByType.tornado;
      }
      applicants = Math.round(totalIhpAmount / est);
      avgAssistance = est;
    }

    return {
      avgAssistance,
      totalApplicants: applicants,
      similarDisastersCount: sameTypeRecentEvents.length
    };
  }, [primaryEvent, sameTypeRecentEvents]);

  const lookupRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!lookupRef.current) return;
    try {
      const [html2canvas, jsPDF] = await Promise.all([
        import('html2canvas').then(m => m.default),
        import('jspdf').then(m => m.default)
      ]);

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

      const buttons = lookupRef.current.querySelectorAll('button');
      buttons.forEach(b => b.style.display = 'none');
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(lookupRef.current, {
        scale: 2, useCORS: true, logging: false, allowTaint: true, backgroundColor: '#ffffff'
      });

      const imgWidth = 210;
      const imgHeight = canvas.height * imgWidth / canvas.width;
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight);

      const eventName = (headerTitle || 'unnamed-event').replace(/\s+/g, '-').toLowerCase();
      pdf.save(`disaster-lookup-${stateName}-${eventName}.pdf`);

      buttons.forEach(b => b.style.display = '');
      document.body.removeChild(loadingToast);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('There was an error generating the PDF. Please try again.');
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Disaster Lookup: ${headerTitle} in ${stateName}`,
        text: `Federal Disaster Spending in ${stateName}`,
        url: window.location.href
      }).catch(error => console.log('Error sharing:', error));
    } else {
      alert('Sharing not supported on this browser');
    }
  };

  const totalIHP = primaryEvent.ihp_total || 0;
  const totalPA = primaryEvent.pa_total || 0;
  const totalCDBG = primaryEvent.cdbg_dr_allocation || 0;
  const totalSBA = primaryEvent.sba_total_approved_loan_amount || 0;
  const grandTotal = totalIHP + totalPA + totalCDBG + (useSBAData ? totalSBA : 0);

  return (
    <section
      ref={lookupRef}
      className="relative bg-white border border-[#E6E7E8] rounded-lg overflow-hidden"
    >
      {/* Top gradient accent */}
      <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-[#003A63] via-[#00A79D] to-[#89684F]" />

      {/* Header */}
      <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-[#E6E7E8]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#003A63]/[0.08] text-[#003A63]">
              {primaryEvent.incident_type || 'Disaster'}
            </span>
            <span className="text-[10px] text-[#89684F] tabular-nums font-semibold">
              DR-{primaryEvent.incident_number}
            </span>
          </div>
          <h2 className="text-2xl sm:text-[1.75rem] font-black text-[#003A63] leading-tight tracking-tight">
            {headerTitle}
          </h2>
          <div className="mt-2 text-sm text-[#89684F]">
            {stateName} · Declaration {formatDateLong(primaryEvent.declaration_date || primaryEvent.incident_start)}
          </div>
        </div>

        <div className="flex space-x-2 print:hidden">
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 bg-[#003A63] text-white rounded-md hover:bg-[#002B4A] text-xs font-semibold flex items-center gap-1.5"
          >
            <Download size={14} />
            Download
          </button>
          <button
            onClick={handleShare}
            className="px-3 py-1.5 bg-[#00A79D] text-white rounded-md hover:bg-[#008F87] text-xs font-semibold flex items-center gap-1.5"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
      </div>

      {grandTotal > 0 && (
        <div className="px-6 sm:px-8 py-6 border-b border-[#E6E7E8]">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-bold text-[#003A63] uppercase tracking-[0.1em]">
              Total Funding by Source
            </h3>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.1em] text-[#89684F] font-semibold">Grand Total</div>
              <div className="text-2xl font-black text-[#00A79D] tabular-nums leading-tight">
                {formatCurrency(grandTotal)}
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-2 ${useSBAData ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 mb-6`}>
            <div className="relative overflow-hidden rounded-lg bg-white border border-[#E6E7E8] p-4 hover:border-[#2171b5]/30 transition-colors">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-[#2171b5]" />
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#003A63] font-semibold mb-1">IHP</div>
              <div className="text-xl font-black text-[#2171b5] tabular-nums leading-tight">{formatCurrency(totalIHP)}</div>
              <div className="text-[11px] text-[#003A63] mt-1">Individual &amp; Household Program</div>
            </div>
            <div className="relative overflow-hidden rounded-lg bg-white border border-[#E6E7E8] p-4 hover:border-[#41B6E6]/30 transition-colors">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-[#41B6E6]" />
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#003A63] font-semibold mb-1">PA</div>
              <div className="text-xl font-black text-[#41B6E6] tabular-nums leading-tight">{formatCurrency(totalPA)}</div>
              <div className="text-[11px] text-[#003A63] mt-1">Public Assistance</div>
            </div>
            <div className="relative overflow-hidden rounded-lg bg-white border border-[#E6E7E8] p-4 hover:border-[#89684F]/30 transition-colors">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-[#89684F]" />
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#003A63] font-semibold mb-1">CDBG-DR</div>
              <div className="text-xl font-black text-[#89684F] tabular-nums leading-tight">{formatCurrency(totalCDBG)}</div>
              <div className="text-[11px] text-[#003A63] mt-1">Community Development Block Grant</div>
            </div>
            {useSBAData && (
              <div className="relative overflow-hidden rounded-lg bg-white border border-[#E6E7E8] p-4 hover:border-[#228B22]/30 transition-colors">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-[#228B22]" />
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#003A63] font-semibold mb-1">SBA</div>
                <div className="text-xl font-black text-[#228B22] tabular-nums leading-tight">{formatCurrency(totalSBA)}</div>
                <div className="text-[11px] text-[#003A63] mt-1">Small Business Administration Loans</div>
              </div>
            )}
          </div>

          <div className="bg-[#f7f8f9] border border-[#E6E7E8] rounded-lg p-2">
            <FundingBreakdownChart
              ihpTotal={totalIHP}
              paTotal={totalPA}
              cdbgTotal={totalCDBG}
              sbaTotal={totalSBA}
              useSBAData={useSBAData}
            />
          </div>
        </div>
      )}

      <div className="px-6 sm:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative overflow-hidden rounded-lg bg-white border border-[#E6E7E8] p-5 hover:border-[#00A79D]/40 transition-colors">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[#00A79D]" />
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#89684F] font-semibold mb-1">
              Average assistance to households
            </div>
            <div className="text-3xl font-black text-[#003A63] tabular-nums leading-tight">
              {formatCurrency(eventStats.avgAssistance)}
            </div>
            <div className="text-[11px] text-[#89684F] mt-1">
              {primaryEvent.ihp_average_award ? 'From FEMA reporting' : 'Calculated from program totals'}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg bg-white border border-[#E6E7E8] p-5 hover:border-[#00A79D]/40 transition-colors">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[#00A79D]" />
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#89684F] font-semibold mb-1">
              Total applicants
            </div>
            <div className="text-3xl font-black text-[#003A63] tabular-nums leading-tight">
              {formatNumber(eventStats.totalApplicants)}
            </div>
            <div className="text-[11px] text-[#89684F] mt-1">
              Households that applied for FEMA assistance
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg bg-white border border-[#E6E7E8] p-5 hover:border-[#00A79D]/40 transition-colors">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[#00A79D]" />
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#89684F] font-semibold mb-1">
              Similar disasters in past 5 years
            </div>
            <div className="text-3xl font-black text-[#003A63] tabular-nums leading-tight">
              {formatNumber(eventStats.similarDisastersCount)}
            </div>
            <div className="text-[11px] text-[#89684F] mt-1">
              Nationwide, same incident type
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DisasterLookupDisplay;
