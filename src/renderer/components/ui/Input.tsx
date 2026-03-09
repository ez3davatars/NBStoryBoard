
import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
 label?: string;
}

export function Input({ label, className = "", ...props }: InputProps) {
 return (
 <div className="flex flex-col gap-1.5">
 {label && (
 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">
 {label}
 </label>
 )}
 <input
 className={`bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white 
 focus:outline-none focus:border-yellow-500/50 focus:bg-black/50 transition-all 
 placeholder:text-white/20 hover:border-white/20 ${className}`}
 {...props}
 />
 </div>
 );
}
