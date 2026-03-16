import React, { useState, useEffect, useRef } from 'react';

interface NumericInputProps {
    value: number;
    onChange: (val: number) => void;
    label?: string;
    step?: number;
    min?: number;
    max?: number;
    className?: string;
    precision?: number;
}

export const NumericInput: React.FC<NumericInputProps> = ({
    value,
    onChange,
    label,
    step = 1,
    min = -99999,
    max = 99999,
    className = "",
    precision = 0
}) => {
    // Local draft state allows user to type intermediate garbage (e.g. '-') without snapping instantly
    const [draft, setDraft] = useState<string>(value.toFixed(precision));
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync from props when NOT focused, so external changes (like dragging a token) update the field visually
    useEffect(() => {
        if (!isFocused) {
            setDraft(value.toFixed(precision));
        }
    }, [value, isFocused, precision]);

    const commit = (strValue: string) => {
        let parsed = parseFloat(strValue);
        
        // Prevent NaN commits if user just leaves "-" or blank
        if (isNaN(parsed)) {
            parsed = value; 
        }

        // Clamp
        if (parsed < min) parsed = min;
        if (parsed > max) parsed = max;

        // Apply
        onChange(parsed);
        setDraft(parsed.toFixed(precision));
    };

    const handleBlur = () => {
        setIsFocused(false);
        commit(draft);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            inputRef.current?.blur(); // Triggers handleBlur instantly
        } else if (e.key === 'Escape') {
            // Revert
            setDraft(value.toFixed(precision));
            inputRef.current?.blur();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const multiplier = e.shiftKey ? 10 : 1;
            commit((parseFloat(draft || "0") + step * multiplier).toString());
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const multiplier = e.shiftKey ? 10 : 1;
            commit((parseFloat(draft || "0") - step * multiplier).toString());
        }
    };

    const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
        if (!isFocused) return;
        
        // Block the page from scrolling heavily while tweaking a number
        e.preventDefault(); 
        
        const multiplier = e.shiftKey ? 10 : 1;
        const delta = e.deltaY < 0 ? step * multiplier : -step * multiplier;
        commit((parseFloat(draft || "0") + delta).toString());
    };

    return (
        <div className="relative group w-full">
            {label && (
                <span className="absolute -top-2 left-1 text-[9px] text-gray-300 font-bold z-10 bg-[#09090b] px-1 rounded shadow-sm">
                    {label}
                </span>
            )}
            <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                onWheel={handleWheel}
                className={`w-full bg-[#18181b] border border-gray-700 hover:border-gray-500 focus:border-yellow-500 py-1.5 px-2 text-[12px] text-yellow-400 font-mono outline-none text-center rounded-sm transition-colors ${className}`}
            />
        </div>
    );
};
