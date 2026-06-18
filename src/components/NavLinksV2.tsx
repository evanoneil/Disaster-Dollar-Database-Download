"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The four primary navigation links, shared between the standalone
 * NavigationV2 bar (used on Compare / Fact Sheets) and the Data Explorer
 * home hero, where they sit in the same row as the summary stats.
 */
const NavLinksV2 = () => {
  const pathname = usePathname();
  const isExplorer = pathname === '/';
  const isLookup = pathname === '/disaster-lookup';
  const isCompare = pathname === '/compare';

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/"
        className={`relative px-3 py-1.5 text-xs font-semibold transition-all duration-150 rounded-sm ${
          isExplorer
            ? 'text-[#003A63] bg-[#003A63]/[0.06]'
            : 'text-[#89684F] hover:text-[#003A63] hover:bg-[#003A63]/[0.03]'
        }`}
      >
        {isExplorer && (
          <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#00A79D] rounded-full" />
        )}
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-60">
            <path d="M2 3h12M2 7h8M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Data Explorer
        </span>
      </Link>
      <Link
        href="/disaster-lookup"
        className={`relative px-3 py-1.5 text-xs font-semibold transition-all duration-150 rounded-sm ${
          isLookup
            ? 'text-[#003A63] bg-[#003A63]/[0.06]'
            : 'text-[#89684F] hover:text-[#003A63] hover:bg-[#003A63]/[0.03]'
        }`}
      >
        {isLookup && (
          <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#00A79D] rounded-full" />
        )}
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-60">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M14 14l-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Disaster Lookup
        </span>
      </Link>
      <Link
        href="/compare"
        className={`relative px-3 py-1.5 text-xs font-semibold transition-all duration-150 rounded-sm ${
          isCompare
            ? 'text-[#003A63] bg-[#003A63]/[0.06]'
            : 'text-[#89684F] hover:text-[#003A63] hover:bg-[#003A63]/[0.03]'
        }`}
      >
        {isCompare && (
          <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#00A79D] rounded-full" />
        )}
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-60">
            <path d="M3 12V4M3 4L6 7M3 4L9 4M13 4v8M13 12l-3-3M13 12H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Compare
        </span>
      </Link>
    </div>
  );
};

export default NavLinksV2;
