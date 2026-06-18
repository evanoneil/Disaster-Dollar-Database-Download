"use client";

import NavLinksV2 from './NavLinksV2';

const NavigationV2 = () => {
  return (
    <nav className="relative">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-[#003A63] via-[#00A79D] to-[#89684F]" />

      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-end py-2">
          <NavLinksV2 />
        </div>
      </div>
    </nav>
  );
};

export default NavigationV2;
