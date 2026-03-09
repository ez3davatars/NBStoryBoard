import React from 'react';

interface DirectorCardProps {
 title: string;
 children: React.ReactNode;
}

const DirectorCard: React.FC<DirectorCardProps> = ({ title, children }) => {
 return (
 <div className="rounded-xl border border-[#1f2937] bg-gradient-to-br from-[#111827] to-[#0f172a] p-4 hover: transition-all duration-200">
 <div className="text-xs uppercase tracking-widest text-white/50 mb-2">
 {title}
 </div>
 {children}
 </div>
 );
};

export default DirectorCard;
