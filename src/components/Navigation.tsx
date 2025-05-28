"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Navigation = () => {
  const pathname = usePathname();
  
  return (
    <nav className="max-w-6xl mx-auto mb-6 bg-white rounded-lg shadow-md">
      <div className="flex flex-col lg:flex-row">
        <Link 
          href="/" 
          className={`py-4 px-6 text-[#003A63] font-medium hover:bg-gray-50 rounded-tl-lg rounded-tr-lg lg:rounded-tr-none lg:rounded-bl-lg text-left lg:flex-1 transition-all duration-200 ${
            pathname === '/' 
              ? 'bg-blue-50 border-2 border-blue-500 shadow-md' 
              : 'border-b lg:border-b-0 lg:border-r border-gray-200'
          }`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-1">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-lg text-[#003A63]">Data Downloader</div>
              <div className="text-sm text-gray-600 mt-1">
                Search, filter, and download disaster assistance data in CSV format
              </div>
            </div>
          </div>
        </Link>
        <Link 
          href="/fact-sheet" 
          className={`py-4 px-6 text-[#003A63] font-medium hover:bg-gray-50 rounded-bl-lg rounded-br-lg lg:rounded-bl-none lg:rounded-tr-lg text-left lg:flex-1 transition-all duration-200 ${
            pathname === '/fact-sheet' 
              ? 'bg-blue-50 border-2 border-blue-500 shadow-md' 
              : 'border-t lg:border-t-0 lg:border-l border-gray-200'
          }`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-1">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a4 4 0 01-4-4V5a4 4 0 014-4h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a4 4 0 01-4 4z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-semibold text-lg text-[#003A63]">Fact Sheet Creator</div>
              <div className="text-sm text-gray-600 mt-1">
                Generate comprehensive disaster impact reports with visualizations and key metrics
              </div>
            </div>
          </div>
        </Link>
      </div>
    </nav>
  );
};

export default Navigation; 