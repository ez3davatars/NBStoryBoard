import React, { useState, useEffect, useRef } from 'react';

interface DebouncedTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
 value: string;
 onChange: (value: string) => void;
 debounceMs?: number;
}

export const DebouncedTextarea: React.FC<DebouncedTextareaProps> = ({
 value,
 onChange,
 debounceMs = 400,
 ...props
}) => {
 const [localValue, setLocalValue] = useState(value);
 const timerRef = useRef<number | null>(null);

 // Sync with external value changes
 useEffect(() => {
 setLocalValue(value);
 }, [value]);

 const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
 const val = e.target.value;
 setLocalValue(val);

 if (timerRef.current) window.clearTimeout(timerRef.current);
 timerRef.current = window.setTimeout(() => {
 onChange(val);
 }, debounceMs);
 };

 // Cleanup timer on unmount
 useEffect(() => {
 return () => {
 if (timerRef.current) window.clearTimeout(timerRef.current);
 };
 }, []);

 return (
 <textarea
 value={localValue}
 onChange={handleChange}
 {...props}
 />
 );
};
