import React, { useRef, useEffect } from 'react';

interface AutoGrowTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    minRows?: number;
    maxRows?: number;
}

export default function AutoGrowTextarea({
    value,
    onChange,
    minRows = 3,
    maxRows = 14,
    className = '',
    ...props
}: AutoGrowTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Approximate line height for text-sm (1.25rem ~ 20px) + padding
    const lineHeight = 20;
    const paddingY = 16; // py-2 is 8px top + 8px bottom

    useEffect(() => {
        const resetHeight = () => {
            if (textareaRef.current) {
                // Reset to min height to calculate true scrollHeight
                textareaRef.current.style.height = `${(minRows * lineHeight) + paddingY}px`;
                const scrollHeight = textareaRef.current.scrollHeight;

                // Calculate max allowed height
                const maxHeight = (maxRows * lineHeight) + paddingY;

                // Clamp height between content need and maxRows
                const newHeight = Math.min(Math.max(scrollHeight, (minRows * lineHeight) + paddingY), maxHeight);
                textareaRef.current.style.height = `${newHeight}px`;
            }
        };

        resetHeight();
        // Optional: Also run on window resize if font sizes might change
        window.addEventListener('resize', resetHeight);
        return () => window.removeEventListener('resize', resetHeight);
    }, [value, minRows, maxRows]);

    return (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            className={`w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400/40 resize-y overflow-y-auto ${className}`}
            {...props}
        />
    );
}
