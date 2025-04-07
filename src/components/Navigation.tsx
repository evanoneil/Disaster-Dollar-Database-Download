"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Navigation = () => {
  const pathname = usePathname();
  
  return (
    <nav className="max-w-6xl mx-auto mb-6 bg-white rounded-lg shadow-md">
      <div className="flex flex-col sm:flex-row">
        <Link 
          href="/" 
          className={`py-3 px-6 text-[#003A63] font-medium border-b sm:border-b-0 sm:border-r border-gray-200 hover:bg-gray-50 rounded-tl-lg rounded-tr-lg sm:rounded-tr-none sm:rounded-bl-lg text-center ${
            pathname === '/' ? 'bg-white' : ''
          }`}
        >
          Data Downloader
        </Link>
        <Link 
          href="/fact-sheet" 
          className={`py-3 px-6 text-[#003A63] font-medium hover:bg-gray-50 rounded-bl-lg rounded-br-lg sm:rounded-bl-none sm:rounded-tr-lg text-center ${
            pathname === '/fact-sheet' ? 'bg-white' : ''
          }`}
        >
          Fact Sheet Creator
        </Link>
      </div>
    </nav>
  );
};

export default Navigation; 