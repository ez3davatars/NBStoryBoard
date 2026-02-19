
import React from "react";

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    valueDisplay?: string | number;
}

export function Slider({ label, valueDisplay, className = "", ...props }: SliderProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-1">
                {label && (
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {label}
                    </label>
                )}
                {valueDisplay !== undefined && (
                    <span className="text-xs font-mono text-yellow-500 font-bold">
                        {valueDisplay}
                    </span>
                )}
            </div>
            <input
                type="range"
                className={`w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-yellow-500 
          hover:bg-white/20 transition-all ${className}`}
                {...props}
            />
        </div>
    );
}
