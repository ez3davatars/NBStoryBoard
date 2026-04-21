import React, { useState, useEffect, useRef } from 'react';

interface PropertyFieldProps {
 label: string;
 value: string;
 onChange: (value: string) => void;
 icon?: React.ComponentType<{ className?: string }>;
 type?: "text" | "textarea" | "number";
 placeholder?: string;
 debounceMs?: number;
}

export const PropertyField = ({
 label,
 value,
 onChange,
 icon: Icon,
 type = "text",
 placeholder = "",
 debounceMs = 400
}: PropertyFieldProps) => {
 const [localValue, setLocalValue] = useState(value);
 const timerRef = useRef<number | null>(null);

 useEffect(() => {
 setLocalValue(value);
 }, [value]);

 useEffect(() => {
 return () => {
 if (timerRef.current) window.clearTimeout(timerRef.current);
 };
 }, []);

 const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
 const val = e.target.value;
 setLocalValue(val);
 if (timerRef.current) window.clearTimeout(timerRef.current);
 timerRef.current = window.setTimeout(() => {
 onChange(val);
 }, debounceMs);
 };

 return (
 <div className="space-y-1">
 <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-1">
 {Icon && <Icon className="w-3 h-3" />} {label}
 </label>
 {type === "textarea" ? (
 <textarea
 value={localValue}
 onChange={handleChange}
 placeholder={placeholder}
 rows={2}
 className="w-full bg-[#18181b] border border-[#27272a] text-xs text-white p-2 rounded focus:border-yellow-500 outline-none resize-none"
 />
 ) : (
 <input
 type={type}
 value={localValue}
 onChange={handleChange}
 placeholder={placeholder}
 className="w-full bg-[#18181b] border border-[#27272a] text-xs text-white p-2 rounded focus:border-yellow-500 outline-none"
 />
 )}
 </div>
 );
};



