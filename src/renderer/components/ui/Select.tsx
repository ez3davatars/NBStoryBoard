
import React from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
 label?: string;
 options: { label: string; value: string | number }[];
}

export function Select({ label, options, className = "", ...props }: SelectProps) {
 return (
 <div className="flex flex-col gap-1.5">
 {label && (
 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
 {label}
 </label>
 )}
 <div className="relative">
 <select
 className={`w-full bg-[#0f1117] text-white border border-white/10 rounded-xl px-3 py-2 
 focus:outline-none focus:ring-2 focus:ring-yellow-500 transition-all 
 appearance-none hover:border-white/20 text-xs ${className}`}
 {...props}
 >
 {options.map((opt) => (
 <option key={opt.value} value={opt.value} className="bg-[#0f1117] text-white">
 {opt.label}
 </option>
 ))}
 </select>
 {/* Accent colored Chevron Icon */}
 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-80">
 <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
 <path d="M1 1L5 5L9 1" stroke="#eab308" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 </div>
 </div>
 </div>
 );
}
