import React from 'react';
import { useHelp } from '../../context/HelpContext';

interface InlineHintProps {
    zone: string;
    id: string;
    className?: string;
}

const InlineHint: React.FC<InlineHintProps> = ({ zone, id, className = '' }) => {
    const help = useHelp(zone, id);

    // Strict: Only render if type is correct
    if (!help || help.type !== 'inline') {
        return null;
    }

    return (
        <div className={`text-[10px] text-gray-500 italic mt-1 ${className}`}>
            {help.text}
        </div>
    );
};

export default InlineHint;
